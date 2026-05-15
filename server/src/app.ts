import Fastify from "fastify";
import { z } from "zod";

import { createChatResponse } from "./chat.js";
import { getMenuCategories } from "./menu.js";

const cartItemSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  customizations: z
    .object({
      size: z.string().min(1).optional(),
      spiceLevel: z.string().min(1).optional(),
      milk: z.string().min(1).optional(),
      doneness: z.string().min(1).optional(),
      sides: z.array(z.string().min(1)).optional(),
      specialInstructions: z.string().min(1).optional(),
    })
    .optional(),
});

const historyEntrySchema = z.object({
  role: z.enum(["user", "model"]),
  parts: z.string(),
});

const orderRecordSchema = z.object({
  id: z.string(),
  items: z.array(cartItemSchema),
  total: z.number(),
  placedAt: z.string(),
});

const chatRequestSchema = z.object({
  message: z.string().min(1),
  cart: z.array(cartItemSchema),
  profile: z.object({
    name: z.string(),
    dietaryPrefs: z.array(z.string()),
    deliveryAddress: z.string(),
  }),
  history: z.array(historyEntrySchema).default([]),
  orders: z.array(orderRecordSchema).default([]),
});

export function buildServer() {
  const app = Fastify({
    logger: false,
  });

  app.get("/api/menu", async () => ({
    categories: getMenuCategories(),
  }));

  app.post("/api/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid chat payload.",
        issues: parsed.error.flatten(),
      });
    }

    return createChatResponse(parsed.data);
  });

  return app;
}
