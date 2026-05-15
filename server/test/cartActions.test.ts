import { describe, expect, test } from "vitest";

import { buildValidatedAction, dietaryConflictForAction, parseLocalCartIntent } from "../src/cartActions.js";
import { getMenuItems } from "../src/menu.js";
import type { ChatRequest } from "../src/types.js";

const baseRequest: ChatRequest = {
  message: "",
  cart: [],
  profile: {
    name: "Shiv",
    dietaryPrefs: [],
    deliveryAddress: "123 Huntington Ave",
  },
  history: [],
  orders: [],
};

describe("cart action helpers", () => {
  test("every menu item declares complete dietary and allergen metadata", () => {
    for (const item of getMenuItems()) {
      expect(item.dietary).toEqual({
        vegetarian: expect.any(Boolean),
        glutenFree: expect.any(Boolean),
        dairyFree: expect.any(Boolean),
        nutFree: expect.any(Boolean),
      });
      expect(Array.isArray(item.allergens)).toBe(true);
    }
  });

  test("parses item customizations from local add intents", () => {
    const response = parseLocalCartIntent({
      ...baseRequest,
      message: "add two large oat flat whites with oat milk and extra hot",
    });

    expect(response?.actions).toEqual([
      {
        type: "add_item",
        itemId: "oat-flat-white",
        quantity: 2,
        customizations: {
          size: "large",
          milk: "oat",
          specialInstructions: "extra hot",
        },
      },
    ]);
  });

  test("validates and preserves safe customizations on add actions", () => {
    const action = buildValidatedAction({
      type: "add_item",
      itemId: "dry-aged-ribeye",
      quantity: 1,
      customizations: {
        doneness: "medium rare",
        sides: ["fries", "side salad"],
        specialInstructions: "sauce on the side",
      },
    });

    expect(action).toEqual({
      type: "add_item",
      itemId: "dry-aged-ribeye",
      quantity: 1,
      customizations: {
        doneness: "medium rare",
        sides: ["fries", "side salad"],
        specialInstructions: "sauce on the side",
      },
    });
  });

  test("drops unsafe or unsupported customizations instead of returning arbitrary model text", () => {
    const action = buildValidatedAction({
      type: "add_item",
      itemId: "margherita",
      quantity: 1,
      customizations: {
        size: "family bucket",
        spiceLevel: "volcanic",
        milk: "motor oil",
        specialInstructions: "x".repeat(200),
      },
    });

    expect(action).toEqual({
      type: "add_item",
      itemId: "margherita",
      quantity: 1,
    });
  });

  test("parses item option changes as update-item actions", () => {
    const response = parseLocalCartIntent({
      ...baseRequest,
      message: "make the dry-aged ribeye medium rare with fries",
      cart: [{ itemId: "dry-aged-ribeye", name: "Dry-Aged Ribeye", quantity: 1, price: 65 }],
    });

    expect(response?.actions).toEqual([
      {
        type: "update_item",
        itemId: "dry-aged-ribeye",
        customizations: {
          doneness: "medium rare",
          sides: ["fries"],
        },
      },
    ]);
  });

  test("parses empty cart requests into clear-cart actions", () => {
    const response = parseLocalCartIntent({
      ...baseRequest,
      message: "please empty my cart",
      cart: [{ itemId: "margherita", name: "Margherita", quantity: 2, price: 16 }],
    });

    expect(response).toEqual({
      reply: "I've cleared your cart, Shiv.",
      actions: [{ type: "clear_cart", itemId: "" }],
    });
  });

  test("detects dietary conflicts before add actions are applied", () => {
    const conflict = dietaryConflictForAction(
      { type: "add_item", itemId: "dry-aged-ribeye", quantity: 1 },
      {
        ...baseRequest,
        profile: {
          ...baseRequest.profile,
          dietaryPrefs: ["Vegetarian"],
        },
      }
    );

    expect(conflict).toMatch(/vegetarian/i);
  });

  test.each([
    ["Vegetarian", "dry-aged-ribeye", /vegetarian/i],
    ["Gluten-Free", "margherita", /gluten-free/i],
    ["Dairy-Free", "heirloom-burrata", /dairy/i],
    ["Nut-Free", "herb-crusted-lamb", /nut/i],
  ])("detects %s conflicts for risky menu items", (preference, itemId, expected) => {
    const conflict = dietaryConflictForAction(
      { type: "add_item", itemId, quantity: 1 },
      {
        ...baseRequest,
        profile: {
          ...baseRequest.profile,
          dietaryPrefs: [preference],
        },
      }
    );

    expect(conflict).toMatch(expected);
  });
});
