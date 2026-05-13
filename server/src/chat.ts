import Groq from "groq-sdk";

import { findMenuItemById, getMenuItems } from "./menu.js";
import type { CartAction, ChatRequest, ChatResponse } from "./types.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

const cartTools: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_item",
      description: "Add a menu item to the customer's cart.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The item's unique ID from the menu." },
          quantity: { type: "integer", description: "How many to add (default 1)." },
        },
        required: ["itemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_item",
      description: "Remove a menu item from the cart entirely.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The item's unique ID." },
        },
        required: ["itemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_quantity",
      description: "Set the exact quantity of an item already in the cart.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The item's unique ID." },
          quantity: { type: "integer", description: "New quantity." },
        },
        required: ["itemId", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_cart",
      description: "Remove all items from the cart.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function buildSystemPrompt(request: ChatRequest): string {
  const menuSummary = getMenuItems()
    .filter((item) => item.inStock)
    .map((item) => `- ${item.id}: ${item.name} ($${item.price}) [tags: ${item.tags.join(", ")}] — ${item.description}`)
    .join("\n");

  const cartSummary =
    request.cart.length === 0
      ? "Cart is currently empty."
      : request.cart
          .map((i) => `- ${i.name} ×${i.quantity} ($${i.price} each)`)
          .join("\n");

  const dietaryNote =
    request.profile.dietaryPrefs.length > 0
      ? `Dietary preferences: ${request.profile.dietaryPrefs.join(", ")}.`
      : "No dietary preferences noted.";

  // Compute frequently ordered items from order history
  const freq: Record<string, { name: string; count: number }> = {};
  for (const order of request.orders) {
    for (const item of order.items) {
      if (!freq[item.itemId]) freq[item.itemId] = { name: item.name, count: 0 };
      freq[item.itemId].count += item.quantity;
    }
  }
  const topItems = Object.values(freq)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const favoritesNote =
    topItems.length > 0
      ? `Customer's most ordered: ${topItems.map((i) => `${i.name} (${i.count}×)`).join(", ")}. Suggest these proactively as favourites or in combos when relevant.`
      : "No order history yet.";

  const name = request.profile.name.trim() || "there";

  return `You are The Gastronome, an elegant and knowledgeable dining concierge for The Intelligent Bistro.

Speak in a warm, refined tone — like a sommelier who is also a friend.
Address the customer as ${name}.
${dietaryNote}

AVAILABLE MENU ITEMS (in-stock only, with tags):
${menuSummary}

CURRENT CART:
${cartSummary}

ORDER HISTORY:
${favoritesNote}

RULES — follow without exception:
1. NEVER call a tool unless the customer uses explicit action words: "add", "order", "put in", "get me", "remove", "take out", "clear", "update". Recommendations, questions, and "what do you suggest" are NOT cart actions.
2. If the customer asks for a suggestion, opinion, or recommendation — describe the dish in words only. Do NOT call add_item or any other tool.
3. Only when the customer explicitly confirms they want to order something, call the appropriate tool.
4. Only add items that appear in the menu and are in-stock.
5. After a tool call, confirm briefly in one sentence.
6. DIETARY CONFLICTS: Before calling add_item for any item whose tags or description may conflict with the customer's dietary preferences, ask for confirmation first. Example: if the customer is Vegetarian and asks to add a meat dish, say "You've set a vegetarian preference — [item] contains meat. Would you still like to add it?" Only add it if they confirm.`;
}

type GroqMessage = Groq.Chat.ChatCompletionMessageParam;

export async function createChatResponse(request: ChatRequest): Promise<ChatResponse> {
  if (!process.env.GROQ_API_KEY) {
    return fallbackResponse(request);
  }

  try {
    // Rebuild conversation history
    const messages: GroqMessage[] = [
      { role: "system" as const, content: buildSystemPrompt(request) },
      ...request.history.map((h) => ({
        role: h.role === "model" ? ("assistant" as const) : ("user" as const),
        content: h.parts,
      })),
      { role: "user" as const, content: request.message },
    ];

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: cartTools,
      tool_choice: "auto",
      max_tokens: 512,
    });

    const choice = response.choices[0];
    const actions: CartAction[] = [];

    if (choice.message.tool_calls?.length) {
      // Process tool calls
      for (const tc of choice.message.tool_calls) {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        const name = tc.function.name;

        if (name === "add_item" && typeof args.itemId === "string") {
          const item = findMenuItemById(args.itemId);
          if (item?.inStock) {
            actions.push({
              type: "add_item",
              itemId: args.itemId,
              quantity: typeof args.quantity === "number" ? args.quantity : 1,
            });
          }
        } else if (name === "remove_item" && typeof args.itemId === "string") {
          actions.push({ type: "remove_item", itemId: args.itemId });
        } else if (
          name === "update_quantity" &&
          typeof args.itemId === "string" &&
          typeof args.quantity === "number"
        ) {
          actions.push({ type: "update_quantity", itemId: args.itemId, quantity: args.quantity });
        } else if (name === "clear_cart") {
          actions.push({ type: "clear_cart", itemId: "" });
        }
      }

      // Second turn: send tool results back to get a natural-language reply
      const followUpMessages: GroqMessage[] = [
        ...messages,
        choice.message,
        ...choice.message.tool_calls.map((tc) => ({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: "success",
        })),
      ];

      const followUp = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: followUpMessages,
        max_tokens: 256,
      });

      const reply = followUp.choices[0]?.message?.content?.trim() ?? "I've updated your cart.";
      return { reply, actions };
    }

    const reply = choice.message?.content?.trim() ?? "How can I help you?";
    return { reply, actions };
  } catch (err) {
    console.error("Groq error:", err);
    return fallbackResponse(request);
  }
}

function fallbackResponse(request: ChatRequest): ChatResponse {
  const name = request.profile.name.trim() || "there";
  return {
    reply: `Sorry ${name}, I'm having trouble connecting right now. Please try again in a moment.`,
    actions: [],
  };
}
