import type { CartItem, OrderRecord, Profile } from '@/store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  tags: string[];
  imageUrl: string;
  blurhash: string;
  inStock: boolean;
  customizable: boolean;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface CartAction {
  type: 'add_item' | 'remove_item' | 'update_quantity' | 'clear_cart';
  itemId: string;
  quantity?: number;
}

export interface ChatResponse {
  reply: string;
  actions: CartAction[];
}

export async function fetchMenu(): Promise<MenuCategory[]> {
  const res = await fetch(`${API_URL}/api/menu`);
  if (!res.ok) throw new Error('Failed to fetch menu');
  const data = await res.json();
  return data.categories as MenuCategory[];
}

export interface HistoryEntry {
  role: 'user' | 'model';
  parts: string;
}

export async function sendChatMessage(
  message: string,
  cart: CartItem[],
  profile: Profile,
  history: HistoryEntry[] = [],
  orders: OrderRecord[] = []
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, cart, profile, history, orders }),
  });
  if (!res.ok) throw new Error('Chat request failed');
  return res.json() as Promise<ChatResponse>;
}
