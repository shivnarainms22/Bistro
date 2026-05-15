import { findMenuItemById, getMenuItems } from "./menu.js";
import type { CartAction, CartCustomizations, ChatRequest, ChatResponse, MenuItem } from "./types.js";

const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const allowedSizes = new Set(["small", "medium", "large"]);
const allowedSpiceLevels = new Set(["mild", "medium", "spicy", "extra spicy"]);
const allowedMilks = new Set(["whole", "oat", "almond", "soy"]);
const allowedDoneness = new Set(["rare", "medium rare", "medium", "medium well", "well done"]);
const allowedSides = new Set(["fries", "side salad", "roasted vegetables", "seasonal greens", "sourdough"]);

export function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildValidatedAction(action: CartAction): CartAction | null {
  if (action.type === "clear_cart") return { type: "clear_cart", itemId: "" };

  const item = findMenuItemById(action.itemId);
  if (!item) return null;

  if (action.type === "remove_item") {
    return { type: "remove_item", itemId: item.id };
  }

  if (action.type === "update_item") {
    return withOptionalCustomizations({
      type: "update_item",
      itemId: item.id,
      customizations: sanitizeCustomizations(action.customizations),
    });
  }

  if (!item.inStock) return null;

  if (action.type === "add_item") {
    const quantity = normalizeQuantity(action.quantity ?? 1);
    if (!quantity) return null;
    return withOptionalCustomizations({
      type: "add_item",
      itemId: item.id,
      quantity,
      customizations: sanitizeCustomizations(action.customizations),
    });
  }

  if (action.type === "update_quantity") {
    const quantity = normalizeQuantity(action.quantity ?? 0);
    if (!quantity) return null;
    return withOptionalCustomizations({
      type: "update_quantity",
      itemId: item.id,
      quantity,
      customizations: sanitizeCustomizations(action.customizations),
    });
  }

  return null;
}

export function parseLocalCartIntent(request: ChatRequest): ChatResponse | null {
  const normalized = normalizeText(request.message);
  const name = request.profile.name.trim() || "there";

  const confirmed = parseDietaryConfirmation(request);
  if (confirmed) return confirmed;

  if (/\b(clear|empty|start over|remove everything)\b/.test(normalized)) {
    return {
      reply: `I've cleared your cart, ${name}.`,
      actions: [{ type: "clear_cart", itemId: "" }],
    };
  }

  if (/\b(remove|delete|take out)\b/.test(normalized)) {
    const itemId = cartItemIdFromMessage(request);
    if (!itemId) {
      return { reply: "I couldn't match that to an item in your cart.", actions: [] };
    }
    const item = findMenuItemById(itemId);
    return {
      reply: `Removed ${item?.name ?? "that item"} from your cart.`,
      actions: [{ type: "remove_item", itemId }],
    };
  }

  const mentions = findAllItemMentions(request.message);
  const outOfStockMention = mentions.find(({ item }) => !item.inStock);
  if (outOfStockMention && /\b(add|order|get|want|please)\b/.test(normalized)) {
    return {
      reply: `${outOfStockMention.item.name} is currently out of stock.`,
      actions: [],
    };
  }

  if (/\b(recommend|suggestion|suggest|what should|popular|good option)\b/.test(normalized)) {
    return buildDietaryAwareRecommendation(request);
  }

  if (/\b(add it|add that|add this|yes add it|yes add that|order it|get it)\b/.test(normalized) || isAffirmativeOnly(normalized)) {
    const referencedItem = findRecentReferencedItem(request);
    if (referencedItem?.inStock) {
      const conflict = hasDietaryOverride(normalized)
        ? null
        : dietaryConflictForItem(referencedItem, request.profile.dietaryPrefs);
      if (conflict) return { reply: conflict, actions: [] };
      return {
        reply: `Added ${referencedItem.name} to your cart.`,
        actions: [{ type: "add_item", itemId: referencedItem.id, quantity: quantityFromText(request.message) ?? 1 }],
      };
    }
  }

  if (/\b(make|change|set|update)\b/.test(normalized)) {
    const mention = mentions.find(({ item }) => request.cart.some((cartItem) => cartItem.itemId === item.id));
    const itemId = mention?.item.id ?? cartItemIdFromMessage(request) ?? inferSingleCartItemId(request);
    if (!itemId) {
      return { reply: "I couldn't match that to an item in your cart.", actions: [] };
    }

    const customizations = mention ? extractCustomizations(request.message, mention.item) : undefined;
    const quantity =
      mention
        ? quantityAfter(request.message, mention.index, mention.form) ?? quantityBeforeOrNull(request.message, mention.index)
        : quantityFromText(request.message);
    if (customizations && !quantity) {
      return {
        reply: `Updated ${mention?.item.name ?? "that item"} options.`,
        actions: [{ type: "update_item", itemId, customizations }],
      };
    }
    if (!quantity) {
      return { reply: "What quantity should I set for that item?", actions: [] };
    }

    const item = findMenuItemById(itemId);
    return {
      reply: `Updated ${item?.name ?? "that item"} to ${quantity}.`,
      actions: [{ type: "update_quantity", itemId, quantity }],
    };
  }

  const addableMentions = mentions.filter(({ item }) => item.inStock);
  if (addableMentions.length > 0 && /\b(add|order|get|want|please|and|\d|one|two|three|four|five)\b/.test(normalized)) {
    if (!hasDietaryOverride(normalized)) {
      const conflict = addableMentions
        .map(({ item }) => dietaryConflictForItem(item, request.profile.dietaryPrefs))
        .find((value): value is string => Boolean(value));
      if (conflict) {
        return { reply: conflict, actions: [] };
      }
    }

    const actions = addableMentions.map(({ item, index }) =>
      withOptionalCustomizations({
        type: "add_item" as const,
        itemId: item.id,
        quantity: quantityBefore(request.message, index),
        customizations: extractCustomizations(request.message, item),
      })
    );
    const itemNames = addableMentions.map(({ item }) => item.name).join(" and ");
    return {
      reply: `Added ${itemNames} to your cart.`,
      actions,
    };
  }

  if (/\b(add|order|get|want)\b/.test(normalized)) {
    return {
      reply: "I couldn't match that to an item on the menu.",
      actions: [],
    };
  }

  return null;
}

function hasDietaryOverride(normalizedMessage: string): boolean {
  return /\b(yes|yeah|yep|sure|confirm|confirmed|go ahead|add anyway|add it anyway|yes add|yes please add)\b/.test(
    normalizedMessage
  );
}

function isAffirmativeOnly(normalizedMessage: string): boolean {
  return /^(yes|yeah|yep|ok|okay|sure|sounds good|great|please do|do it)$/.test(normalizedMessage);
}

function parseDietaryConfirmation(request: ChatRequest): ChatResponse | null {
  const normalized = normalizeText(request.message);
  if (!/\b(yes|yeah|yep|confirm|confirmed|please do|go ahead|add it|add anyway|sure)\b/.test(normalized)) {
    return null;
  }

  const lastModel = [...request.history].reverse().find((entry) => entry.role === "model");
  if (!lastModel || !/does not fit|may not fit|not marked|may include|confirm|would you still like|still like me to add/i.test(lastModel.parts)) {
    return null;
  }

  const previousUser = [...request.history].reverse().find((entry) => entry.role === "user");
  if (!previousUser) return null;

  const replay = parseLocalCartIntent({
    ...request,
    message: previousUser.parts,
    profile: { ...request.profile, dietaryPrefs: [] },
    history: [],
  });
  const actions = replay?.actions.filter((action) => action.type === "add_item") ?? [];
  if (actions.length === 0) return null;

  return {
    reply: "Confirmed. I've added it to your cart.",
    actions,
  };
}

export function dietaryConflictForAction(action: CartAction, request: ChatRequest): string | null {
  if (action.type !== "add_item") return null;
  const item = findMenuItemById(action.itemId);
  if (!item) return null;
  return dietaryConflictForItem(item, request.profile.dietaryPrefs);
}

export function dietaryConflictResponse(actions: CartAction[], request: ChatRequest): ChatResponse | null {
  const conflict = actions
    .map((action) => dietaryConflictForAction(action, request))
    .find((value): value is string => Boolean(value));
  return conflict ? { reply: conflict, actions: [] } : null;
}

function dietaryConflictForItem(item: MenuItem, dietaryPrefs: string[]): string | null {
  const prefs = dietaryPrefs.map((pref) => pref.toLowerCase());
  const itemName = item.name;

  if (prefs.includes("vegetarian") && !item.dietary.vegetarian) {
    return `${itemName} does not fit your vegetarian preference. Please confirm if you'd still like to add it.`;
  }

  if (prefs.includes("gluten-free") && !item.dietary.glutenFree) {
    return `${itemName} is not marked gluten-free. Please confirm if you'd still like to add it.`;
  }

  if (prefs.includes("dairy-free") && !item.dietary.dairyFree) {
    return `${itemName} may include dairy. Please confirm if you'd still like to add it.`;
  }

  if (prefs.includes("nut-free") && !item.dietary.nutFree) {
    return `${itemName} may include nuts. Please confirm if you'd still like to add it.`;
  }

  return null;
}

function withOptionalCustomizations<T extends CartAction>(action: T): T {
  if (!action.customizations || Object.keys(action.customizations).length === 0) {
    const { customizations: _customizations, ...rest } = action;
    return rest as T;
  }
  return action;
}

function sanitizeCustomizations(customizations?: CartCustomizations): CartCustomizations | undefined {
  if (!customizations) return undefined;

  const sanitized: CartCustomizations = {};
  const size = cleanText(customizations.size);
  const spiceLevel = cleanText(customizations.spiceLevel);
  const milk = cleanText(customizations.milk);
  const doneness = cleanText(customizations.doneness);
  const specialInstructions = cleanInstruction(customizations.specialInstructions);

  if (size && allowedSizes.has(size)) sanitized.size = size;
  if (spiceLevel && allowedSpiceLevels.has(spiceLevel)) sanitized.spiceLevel = spiceLevel;
  if (milk && allowedMilks.has(milk)) sanitized.milk = milk;
  if (doneness && allowedDoneness.has(doneness)) sanitized.doneness = doneness;
  if (specialInstructions) sanitized.specialInstructions = specialInstructions;

  const sides = customizations.sides
    ?.map((side) => cleanText(side))
    .filter((side): side is string => Boolean(side && allowedSides.has(side)));
  if (sides?.length) sanitized.sides = Array.from(new Set(sides)).slice(0, 3);

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function extractCustomizations(message: string, item: MenuItem): CartCustomizations | undefined {
  const normalized = normalizeText(message);
  const detected: CartCustomizations = {};

  if (/\blarge\b/.test(normalized)) detected.size = "large";
  else if (/\bsmall\b/.test(normalized)) detected.size = "small";
  else if (item.category === "Coffee & Brunch" && /\bmedium\b/.test(normalized)) detected.size = "medium";

  if (/\bextra spicy\b/.test(normalized)) detected.spiceLevel = "extra spicy";
  else if (/\bspicy\b/.test(normalized)) detected.spiceLevel = "spicy";
  else if (/\bmild\b/.test(normalized)) detected.spiceLevel = "mild";

  if (/\boat milk\b/.test(normalized)) detected.milk = "oat";
  else if (/\balmond milk\b/.test(normalized)) detected.milk = "almond";
  else if (/\bsoy milk\b/.test(normalized)) detected.milk = "soy";
  else if (/\bwhole milk\b/.test(normalized)) detected.milk = "whole";

  if (/\bmedium rare\b/.test(normalized)) detected.doneness = "medium rare";
  else if (/\bmedium well\b/.test(normalized)) detected.doneness = "medium well";
  else if (/\bwell done\b/.test(normalized)) detected.doneness = "well done";
  else if (/\brare\b/.test(normalized)) detected.doneness = "rare";
  else if (item.customizable && /\bmedium\b/.test(normalized) && item.category === "Signature Dishes") detected.doneness = "medium";

  const sides: string[] = [];
  if (/\bfries\b/.test(normalized)) sides.push("fries");
  if (/\bside salad\b|\bsalad\b/.test(normalized)) sides.push("side salad");
  if (/\broasted vegetables\b|\bvegetables\b/.test(normalized)) sides.push("roasted vegetables");
  if (/\bseasonal greens\b|\bgreens\b/.test(normalized)) sides.push("seasonal greens");
  if (/\bsourdough\b/.test(normalized)) sides.push("sourdough");
  if (sides.length) detected.sides = sides;

  if (/\bextra hot\b/.test(normalized)) detected.specialInstructions = "extra hot";
  else if (/\bsauce on (?:the )?side\b/.test(normalized)) detected.specialInstructions = "sauce on the side";
  else if (/\bno onions\b/.test(normalized)) detected.specialInstructions = "no onions";

  return sanitizeCustomizations(detected);
}

function cleanText(value?: string): string | undefined {
  const cleaned = value?.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function cleanInstruction(value?: string): string | undefined {
  const cleaned = value?.toLowerCase().replace(/[^a-z0-9 ,.-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 80) return undefined;
  return cleaned;
}

function normalizeQuantity(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 20) return null;
  return value;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function itemForms(item: MenuItem): string[] {
  const normalized = normalizeText(item.name);
  const words = normalized.split(" ");
  const last = words.at(-1);
  if (!last) return [normalized];

  return Array.from(
    new Set([
      normalized,
      `${normalized}s`,
      [...words.slice(0, -1), `${last}s`].join(" "),
      item.id.replaceAll("-", " "),
      ...aliasForms(item),
    ])
  );
}

function aliasForms(item: MenuItem): string[] {
  const aliases: string[] = [];
  const normalized = normalizeText(item.name);
  if (normalized.includes("ribeye")) aliases.push("ribeye", "ribeyes", "steak", "steaks");
  if (item.tags.map((tag) => tag.toLowerCase()).includes("wine")) aliases.push("wine", "wines");
  if (normalized.includes("chateauneuf")) aliases.push("red wine", "wine pairing");
  if (normalized.includes("barolo")) aliases.push("barolo", "red wine");
  if (normalized.includes("cremant")) aliases.push("sparkling wine", "bubbly");
  if (normalized.includes("flat white")) aliases.push("coffee", "flat white", "flat whites");
  return aliases;
}

function findItemMention(message: string, includeOutOfStock = true): MenuItem | undefined {
  const normalized = normalizeText(message);
  return getMenuItems()
    .filter((item) => includeOutOfStock || item.inStock)
    .sort((a, b) => b.name.length - a.name.length)
    .find((item) => itemForms(item).some((form) => normalized.includes(form)));
}

function findRecentReferencedItem(request: ChatRequest): MenuItem | undefined {
  for (const entry of [...request.history].reverse()) {
    const item = findItemMention(entry.parts, true);
    if (item) return item;
  }
  return undefined;
}

function findAllItemMentions(message: string): Array<{ item: MenuItem; index: number; form: string }> {
  const normalized = normalizeText(message);
  const mentions: Array<{ item: MenuItem; index: number; form: string }> = [];

  for (const item of getMenuItems().sort((a, b) => b.name.length - a.name.length)) {
    for (const form of itemForms(item)) {
      const index = normalized.indexOf(form);
      if (index >= 0) {
        mentions.push({ item, index, form });
        break;
      }
    }
  }

  const sorted = mentions.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return b.form.length - a.form.length;
  });
  const selected: Array<{ item: MenuItem; index: number; form: string }> = [];

  for (const mention of sorted) {
    const start = mention.index;
    const end = mention.index + mention.form.length;
    const overlaps = selected.some((existing) => {
      const existingStart = existing.index;
      const existingEnd = existing.index + existing.form.length;
      return start < existingEnd && end > existingStart;
    });
    if (!overlaps) selected.push(mention);
  }

  return selected;
}

function quantityFromText(text: string): number | null {
  const tokens = normalizeText(text).split(" ").filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (!token) continue;

    const numeric = Number.parseInt(token, 10);
    if (Number.isInteger(numeric)) return normalizeQuantity(numeric);

    const wordValue = numberWords[token];
    if (wordValue) return normalizeQuantity(wordValue);
  }

  return null;
}

function quantityBefore(message: string, itemIndex: number): number {
  return quantityBeforeOrNull(message, itemIndex) ?? 1;
}

function quantityBeforeOrNull(message: string, itemIndex: number): number | null {
  const before = normalizeText(message).slice(0, itemIndex);
  const segment = before.split(/\b(?:and|plus|with)\b/).at(-1) ?? before;
  return quantityFromText(segment);
}

function quantityAfter(message: string, itemIndex: number, form: string): number | null {
  const normalized = normalizeText(message);
  return quantityFromText(normalized.slice(itemIndex + form.length));
}

function cartItemIdFromMessage(request: ChatRequest): string | null {
  const normalized = normalizeText(request.message);
  const match = request.cart.find((item) => {
    const name = normalizeText(item.name);
    const menuItem = findMenuItemById(item.itemId);
    const forms = menuItem ? itemForms(menuItem) : [name, item.itemId.replaceAll("-", " ")];
    return forms.some((form) => normalized.includes(form));
  });
  return match?.itemId ?? findItemMention(request.message)?.id ?? null;
}

function inferSingleCartItemId(request: ChatRequest): string | null {
  return request.cart.length === 1 ? request.cart[0]?.itemId ?? null : null;
}

function buildDietaryAwareRecommendation(request: ChatRequest): ChatResponse {
  const normalized = normalizeText(request.message);
  const candidates = getMenuItems()
    .filter((item) => item.inStock)
    .filter((item) => recommendationIntentMatches(item, normalized))
    .filter((item) => !dietaryConflictForItem(item, request.profile.dietaryPrefs));
  const preferred =
    candidates.find((item) => item.tags.includes("Vegetarian") && item.tags.includes("Chef's Pick")) ??
    candidates.find((item) => item.tags.includes("Wine")) ??
    candidates.find((item) => item.tags.includes("Vegetarian")) ??
    candidates[0];

  if (!preferred) {
    return {
      reply: "I do not see a menu item that clearly fits your dietary preferences right now.",
      actions: [],
    };
  }

  const prefLabel =
    request.profile.dietaryPrefs.length > 0
      ? ` for your ${request.profile.dietaryPrefs.join(", ").toLowerCase()} preference`
      : "";
  const topItems = orderRecommendationCandidates(candidates).slice(0, 3);
  if (topItems.length > 1) {
    return {
      reply: `Here are ${topItems.length} strong picks${prefLabel}:\n${topItems
        .map((item, index) => `${index + 1}. ${item.name} - ${item.description}`)
        .join("\n")}`,
      actions: [],
    };
  }

  return {
    reply: `I recommend ${preferred.name}${prefLabel}. ${preferred.description}`,
    actions: [],
  };
}

function orderRecommendationCandidates(items: MenuItem[]): MenuItem[] {
  return [...items].sort((a, b) => recommendationScore(b) - recommendationScore(a));
}

function recommendationScore(item: MenuItem): number {
  let score = 0;
  if (item.tags.includes("Chef's Pick")) score += 4;
  if (item.category === "Signature Dishes") score += 3;
  if (item.tags.includes("Dinner")) score += 2;
  if (item.tags.includes("Vegetarian")) score += 1;
  if (item.tags.includes("Wine")) score -= 3;
  return score;
}

function recommendationIntentMatches(item: MenuItem, normalizedMessage: string): boolean {
  const tags = item.tags.map((tag) => tag.toLowerCase());
  if (/\b(wine|pairing|sommelier|red|sparkling|bubbly)\b/.test(normalizedMessage)) {
    return tags.includes("wine") || item.category === "Sommelier's Selection";
  }
  if (/\b(coffee|brunch|breakfast)\b/.test(normalizedMessage)) {
    return item.category === "Coffee & Brunch";
  }
  if (/\b(pizza|pizzas)\b/.test(normalizedMessage)) {
    return item.category === "Artisan Pizzas";
  }
  if (/\b(starter|appetizer|small plate)\b/.test(normalizedMessage)) {
    return item.category === "Artisan Starters";
  }
  if (/\b(main|entree|dinner|signature)\b/.test(normalizedMessage)) {
    return item.category === "Signature Dishes";
  }
  return true;
}
