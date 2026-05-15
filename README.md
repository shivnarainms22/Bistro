# The Intelligent Bistro

React Native (Expo) mobile app plus a Node.js/Fastify backend for AI-assisted restaurant ordering.

## Highlights

- Polished Expo mobile experience with Concierge chat, menu browsing, cart management, profile preferences, and order history.
- Conversational ordering through structured cart actions for add, remove, quantity updates, item option updates, and clear-cart requests.
- Dietary-aware recommendations and confirmations using explicit menu metadata for vegetarian, gluten-free, dairy-free, nut-free, and allergen information.
- Deterministic local parser for core demo flows, with optional Groq LLM fallback for broader natural-language handling.
- Regression tests for backend API/cart parsing and mobile cart state behavior.

## Project Structure

- `mobile/` - Expo app with menu browsing, cart management, profile/order history, and concierge chat.
- `server/` - Fastify API serving menu data and structured cart actions from natural-language requests.

## Architecture

```text
mobile/
  app/(tabs)/          Expo Router screens: Concierge, Menu, Cart, Profile
  lib/api.ts           API client and shared response types
  store/               Zustand cart/profile/order state and cart reducers
  test/                Node test coverage for cart state behavior

server/
  src/app.ts           Fastify routes for /api/menu, /api/chat, /health
  src/chat.ts          Chat orchestration, prompt contract, deterministic fallback
  src/cartActions.ts   Natural-language cart intent parsing and action validation
  src/menu.ts          Menu catalog with dietary/allergen metadata
  test/                Vitest API and cart-action regression tests
```

The backend always returns structured `actions` alongside assistant text. The mobile app applies those actions through the same cart reducer logic used by direct UI actions, keeping AI and UI cart behavior consistent.

## Setup

```sh
cd server
npm install
cp .env.example .env
```

Set `GROQ_API_KEY` in `server/.env` for live LLM parsing. Without a key, the backend uses a deterministic local parser for common cart actions.

```sh
cd ../mobile
npm install
cp .env.example .env.local
```

For a physical device, set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to your machine's LAN URL, for example `http://192.168.1.20:3001`.

## Run

```sh
cd server
npm run dev
```

```sh
cd mobile
npm start
```

## Verify

```sh
cd server
npm test
npm run typecheck
npm run build
```

```sh
cd mobile
npm test
npm run typecheck
```

## Reviewer Demo Script

1. Start the backend with `cd server && npm run dev`.
2. Start the app with `cd mobile && npm start`.
3. Browse the Menu tab and show dietary/allergen chips on menu cards.
4. Open Profile and set a dietary preference such as `Vegetarian` or `Nut-Free`.
5. In Concierge, send: `What's popular tonight?`.
6. Confirm the recommendations respect the selected dietary preference.
7. Send: `Add two margheritas and an oat flat white`.
8. Confirm the cart contains two Margheritas and one Oat Flat White.
9. Send: `Add a large oat flat white with oat milk and extra hot`.
10. Confirm the cart shows the customized drink line with `Large, oat milk, extra hot`.
11. Send: `Add a dry-aged ribeye medium rare with fries`.
12. If a dietary warning appears, confirm with: `yes add it`.
13. Confirm the cart shows the ribeye with `medium rare, fries`.
14. Send: `Make it 2 ribeyes`.
15. Confirm the ribeye quantity updates without requiring the exact full item name.
16. Send: `Remove wine from cart` after adding a wine pairing.
17. Confirm the wine line is removed.
18. Send: `Empty my cart`.
19. Confirm the cart is cleared.

## Loom Checklist

- Show the mobile UI: Concierge, Menu, Cart, and Profile.
- Demonstrate AI-driven cart interactions: add, update quantity, customize, remove, and clear cart.
- Demonstrate dietary-aware recommendations and confirmation before adding conflicting items.
- Briefly explain code structure: `mobile/` for Expo UI/state, `server/src/` for API/menu/chat parsing, and `server/test/` plus `mobile/test/` for regression coverage.
- Mention AI tools used during development, including OpenAI Codex and Claude Code for implementation, debugging, and test generation.
