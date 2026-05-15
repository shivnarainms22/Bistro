import Groq from "groq-sdk";

import {
  buildValidatedAction,
  dietaryConflictResponse,
  parseLocalCartIntent,
  parseToolArguments,
} from "./cartActions.js";
import { getMenuItems } from "./menu.js";
import type { CartAction, ChatRequest, ChatResponse } from "./types.js";

let groq: Groq | null = null;
function getGroq(): Groq {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
  return groq;
}

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
          customizations: {
            type: "object",
            description: "Optional safe item options.",
            properties: {
              size: { type: "string", enum: ["small", "medium", "large"] },
              spiceLevel: { type: "string", enum: ["mild", "medium", "spicy", "extra spicy"] },
              milk: { type: "string", enum: ["whole", "oat", "almond", "soy"] },
              doneness: { type: "string", enum: ["rare", "medium rare", "medium", "medium well", "well done"] },
              sides: {
                type: "array",
                items: { type: "string", enum: ["fries", "side salad", "roasted vegetables", "seasonal greens", "sourdough"] },
              },
              specialInstructions: { type: "string" },
            },
          },
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
      name: "update_item",
      description: "Update item options/customizations without changing quantity.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "The item's unique ID." },
          customizations: {
            type: "object",
            properties: {
              size: { type: "string", enum: ["small", "medium", "large"] },
              spiceLevel: { type: "string", enum: ["mild", "medium", "spicy", "extra spicy"] },
              milk: { type: "string", enum: ["whole", "oat", "almond", "soy"] },
              doneness: { type: "string", enum: ["rare", "medium rare", "medium", "medium well", "well done"] },
              sides: {
                type: "array",
                items: { type: "string", enum: ["fries", "side salad", "roasted vegetables", "seasonal greens", "sourdough"] },
              },
              specialInstructions: { type: "string" },
            },
          },
        },
        required: ["itemId", "customizations"],
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
      const current = freq[item.itemId] ?? { name: item.name, count: 0 };
      current.count += item.quantity;
      freq[item.itemId] = current;
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

  return `You are The Gastronome, a dining concierge for The Intelligent Bistro. Speak warmly and elegantly. Address the customer as ${name}.

## TOOL USE RULES (MUST FOLLOW)
- Customer says "add [item]" or "order [item]" or "get me [item]" → call add_item tool
- Customer says "remove [item]" or "take out [item]" → call remove_item tool
- Customer says "make it [N]" or "change quantity to [N]" → call update_quantity tool
- Customer changes size, milk, spice, doneness, sides, or special instructions → call update_item tool
- Customer says "clear cart" or "start over" or "remove everything" → call clear_cart tool
- Customer asks for recommendation, suggestion, or question → respond in TEXT ONLY, do NOT call any tool
- After calling a tool → confirm in one short sentence. Never repeat the cart contents — the customer can see their cart on the Cart tab.
- ${dietaryNote} If customer orders something conflicting with their dietary preferences, ask for confirmation before calling add_item.

## MENU (in-stock only)
${menuSummary}

## CURRENT CART
${cartSummary}

## ORDER HISTORY
${favoritesNote}`;
}

type GroqMessage = Groq.Chat.ChatCompletionMessageParam;

export async function createChatResponse(request: ChatRequest): Promise<ChatResponse> {
  const deterministicCartIntent = parseLocalCartIntent(request);
  if (deterministicCartIntent) return deterministicCartIntent;

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

    const response = await getGroq().chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      tools: cartTools,
      tool_choice: "auto",
      temperature: 0,
      max_tokens: 512,
    });

    const choice = response.choices[0];
    if (!choice) {
      return fallbackResponse(request);
    }
    const actions: CartAction[] = [];

    if (choice.message.tool_calls?.length) {
      // Process tool calls
      for (const tc of choice.message.tool_calls) {
        const args = parseToolArguments(tc.function.arguments);
        if (!args) continue;
        const name = tc.function.name;

        if (name === "add_item" && typeof args.itemId === "string") {
          const action = buildValidatedAction({
            type: "add_item",
            itemId: args.itemId,
            quantity: typeof args.quantity === "number" ? args.quantity : 1,
            customizations: parseCustomizationsArgument(args.customizations),
          });
          if (action) actions.push(action);
        } else if (name === "remove_item" && typeof args.itemId === "string") {
          const action = buildValidatedAction({ type: "remove_item", itemId: args.itemId });
          if (action) actions.push(action);
        } else if (
          name === "update_quantity" &&
          typeof args.itemId === "string" &&
          typeof args.quantity === "number"
        ) {
          const action = buildValidatedAction({
            type: "update_quantity",
            itemId: args.itemId,
            quantity: args.quantity,
          });
          if (action) actions.push(action);
        } else if (name === "update_item" && typeof args.itemId === "string") {
          const action = buildValidatedAction({
            type: "update_item",
            itemId: args.itemId,
            customizations: parseCustomizationsArgument(args.customizations),
          });
          if (action) actions.push(action);
        } else if (name === "clear_cart") {
          actions.push({ type: "clear_cart", itemId: "" });
        }
      }

      const dietaryConflict = dietaryConflictResponse(actions, request);
      if (dietaryConflict) return dietaryConflict;

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

      const followUp = await getGroq().chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: followUpMessages,
        temperature: 0,
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

function parseCustomizationsArgument(value: unknown): CartAction["customizations"] {
  return value && typeof value === "object" ? (value as CartAction["customizations"]) : undefined;
}

function fallbackResponse(request: ChatRequest): ChatResponse {
  const parsed = parseLocalCartIntent(request);
  if (parsed) return parsed;

  const name = request.profile.name.trim() || "there";
  return {
    reply: `I can help with that, ${name}. Try asking me to add, remove, or update a specific menu item.`,
    actions: [],
  };
}
