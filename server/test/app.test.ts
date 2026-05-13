import { afterEach, describe, expect, test } from "vitest";

import { buildServer } from "../src/app.js";

const apps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close();
  }
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
});
