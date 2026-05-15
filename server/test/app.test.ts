import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { buildServer } from "../src/app.js";

const apps: Array<{ close: () => Promise<unknown> }> = [];

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "");
});

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close();
  }
  vi.unstubAllEnvs();
});

describe("API contract", () => {
  test("GET /api/menu returns menu groups with full item details", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/menu",
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();

    expect(payload.categories).toHaveLength(5);
    expect(payload.categories[0].name).toBe("Signature Dishes");
    expect(payload.categories[0].items[0].id).toBe("dry-aged-ribeye");
    expect(payload.categories[0].items[0].dietary).toEqual({
      vegetarian: false,
      glutenFree: true,
      dairyFree: false,
      nutFree: true,
    });
    expect(payload.categories[0].items[3].allergens).toContain("tree-nuts");
    expect(payload.categories[2].items[1].inStock).toBe(false);
    expect(payload.categories[4].items[1].name).toBe("Oat Flat White");
  });

  test("POST /api/chat returns structured add-item actions for known menu items", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "2 margheritas and an oat flat white please",
        cart: [{ itemId: "margherita", name: "Margherita", quantity: 1, price: 16 }],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();

    expect(payload.reply).toMatch(/Margherita/i);
    expect(payload.actions).toEqual([
      { type: "add_item", itemId: "margherita", quantity: 2 },
      { type: "add_item", itemId: "oat-flat-white", quantity: 1 },
    ]);
  });

  test("POST /api/chat rejects unknown items instead of returning invalid cart actions", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "please add 3 moon cakes",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();

    expect(payload.actions).toEqual([]);
    expect(payload.reply).toMatch(/couldn't match/i);
  });

  test("POST /api/chat returns structured cart mutation actions without an LLM key", async () => {
    const app = buildServer();
    apps.push(app);

    const basePayload = {
      cart: [{ itemId: "margherita", name: "Margherita", quantity: 2, price: 16 }],
      profile: {
        name: "Shiv",
        dietaryPrefs: [],
        deliveryAddress: "123 Huntington Ave",
      },
    };

    const updateResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        ...basePayload,
        message: "make margherita 4",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().actions).toEqual([
      { type: "update_quantity", itemId: "margherita", quantity: 4 },
    ]);

    const removeResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        ...basePayload,
        message: "remove margherita",
      },
    });

    expect(removeResponse.statusCode).toBe(200);
    expect(removeResponse.json().actions).toEqual([
      { type: "remove_item", itemId: "margherita" },
    ]);

    const clearResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        ...basePayload,
        message: "clear cart",
      },
    });

    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json().actions).toEqual([
      { type: "clear_cart", itemId: "" },
    ]);
  });

  test("POST /api/chat does not add out-of-stock menu items", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "add one truffle arborio",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([]);
    expect(payload.reply).toMatch(/sold out|unavailable|out of stock/i);
  });

  test("POST /api/chat asks before adding items that conflict with dietary preferences", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "add one dry-aged ribeye",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([]);
    expect(payload.reply).toMatch(/vegetarian|confirm/i);
  });

  test("POST /api/chat applies a dietary-conflict add after explicit confirmation", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "yes please add it",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
        history: [
          { role: "user", parts: "add one dry-aged ribeye" },
          {
            role: "model",
            parts: "That may not match your dietary preferences. Would you still like me to add it?",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([
      { type: "add_item", itemId: "dry-aged-ribeye", quantity: 1 },
    ]);
    expect(payload.reply).toMatch(/added/i);
  });

  test("POST /api/chat treats affirmative repeated item requests as dietary confirmation", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "yes add the dry-aged ribeye",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
        history: [],
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([
      { type: "add_item", itemId: "dry-aged-ribeye", quantity: 1 },
    ]);
  });

  test("POST /api/chat resolves 'yes add it' from the previous dietary warning item", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "yes add it",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
        history: [
          { role: "user", parts: "add one dry-aged ribeye" },
          {
            role: "model",
            parts: "Dry-Aged Ribeye does not fit your vegetarian preference. Please confirm if you'd still like to add it.",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actions).toEqual([
      { type: "add_item", itemId: "dry-aged-ribeye", quantity: 1 },
    ]);
  });

  test("POST /api/chat resolves 'add it' from a prior recommendation", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "add it",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
        history: [
          { role: "user", parts: "recommend a wine pairing" },
          {
            role: "model",
            parts: "The Chateauneuf-du-Pape would pair beautifully with your dinner.",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actions).toEqual([
      { type: "add_item", itemId: "chateauneuf-du-pape", quantity: 1 },
    ]);
  });

  test("POST /api/chat understands plural shorthand when updating cart quantities", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "make it 2 ribeyes",
        cart: [{ itemId: "dry-aged-ribeye", name: "Dry-Aged Ribeye", quantity: 1, price: 65 }],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actions).toEqual([
      { type: "update_quantity", itemId: "dry-aged-ribeye", quantity: 2 },
    ]);
  });

  test("POST /api/chat removes cart items by category alias", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "remove wine from cart",
        cart: [
          { itemId: "chateauneuf-du-pape", name: "Chateauneuf-du-Pape", quantity: 1, price: 22 },
          { itemId: "margherita", name: "Margherita", quantity: 1, price: 16 },
        ],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actions).toEqual([
      { type: "remove_item", itemId: "chateauneuf-du-pape" },
    ]);
  });

  test("POST /api/chat uses dietary preferences for local recommendations", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "what should I order",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([]);
    expect(payload.reply).toMatch(/vegetarian/i);
    expect(payload.reply).not.toMatch(/ribeye|wagyu|lamb|octopus|scallop|marrow/i);
  });

  test.each([
    ["Vegetarian", /ribeye|wagyu|lamb|octopus|scallop|marrow/i],
    ["Gluten-Free", /pizza|margherita|toast|pancakes|sourdough/i],
    ["Dairy-Free", /burrata|cheese|butter|cream|milk|pecorino|labneh|buttermilk/i],
    ["Nut-Free", /pistachio/i],
  ])("POST /api/chat filters %s recommendations", async (preference, unsafePattern) => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "what's popular tonight",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: [preference],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([]);
    expect(payload.reply).toMatch(new RegExp(preference, "i"));
    expect(payload.reply).not.toMatch(unsafePattern);
  });

  test("POST /api/chat honors wine pairing recommendation intent", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "recommend a wine pairing",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: ["Vegetarian"],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([]);
    expect(payload.reply).toMatch(/wine|barolo|chateauneuf|cremant/i);
    expect(payload.reply).not.toMatch(/margherita|risotto|toast|pancakes/i);
  });

  test("POST /api/chat suggests a food item for generic popular requests", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "what's popular tonight",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.actions).toEqual([]);
    expect(payload.reply).not.toMatch(/barolo|chateauneuf|cremant|wine/i);
    expect(payload.reply).toMatch(/1\./);
    expect(payload.reply).toMatch(/2\./);
  });

  test("POST /api/chat turns yes after a recommendation into a real add action", async () => {
    const app = buildServer();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "okay",
        cart: [],
        profile: {
          name: "Shiv",
          dietaryPrefs: [],
          deliveryAddress: "123 Huntington Ave",
        },
        history: [
          { role: "user", parts: "what's popular tonight" },
          {
            role: "model",
            parts: "I recommend Wild Mushroom Risotto. Creamy risotto finished with roasted mushrooms, pecorino, and thyme.",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actions).toEqual([
      { type: "add_item", itemId: "wild-mushroom-risotto", quantity: 1 },
    ]);
  });
});
