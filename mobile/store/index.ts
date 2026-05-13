import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MenuCategory, MenuItem } from '@/lib/api';

export interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Profile {
  name: string;
  email: string;
  deliveryAddress: string;
  dietaryPrefs: string[];
}

export interface OrderRecord {
  id: string;
  items: CartItem[];
  total: number;
  placedAt: string;
}

// ─── Persisted store: cart + profile + orders ────────────────────────────────

interface CartSlice {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: () => number;
}

interface ProfileSlice {
  profile: Profile;
  setProfile: (patch: Partial<Profile>) => void;
}

interface OrdersSlice {
  orders: OrderRecord[];
  placeOrder: (items: CartItem[], total: number) => void;
}

type BistroStore = CartSlice & ProfileSlice & OrdersSlice;

export const useStore = create<BistroStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.itemId === item.itemId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.itemId === item.itemId ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        }),
      removeItem: (itemId) =>
        set((state) => ({ items: state.items.filter((i) => i.itemId !== itemId) })),
      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.itemId !== itemId)
              : state.items.map((i) => (i.itemId === itemId ? { ...i, quantity } : i)),
        })),
      clearCart: () => set({ items: [] }),
      cartTotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

      profile: {
        name: 'Guest',
        email: '',
        deliveryAddress: '',
        dietaryPrefs: [],
      },
      setProfile: (patch) =>
        set((state) => ({ profile: { ...state.profile, ...patch } })),

      orders: [],
      placeOrder: (items, total) =>
        set((state) => ({
          orders: [
            {
              id: Date.now().toString(),
              items,
              total,
              placedAt: new Date().toISOString(),
            },
            ...state.orders,
          ],
        })),
    }),
    {
      name: 'bistro-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Non-persisted store: menu catalogue ─────────────────────────────────────

interface MenuStore {
  categories: MenuCategory[];
  setCategories: (cats: MenuCategory[]) => void;
  findItemById: (id: string) => MenuItem | undefined;
}

export const useMenuStore = create<MenuStore>()((set, get) => ({
  categories: [],
  setCategories: (cats) => set({ categories: cats }),
  findItemById: (id) => {
    for (const cat of get().categories) {
      const item = cat.items.find((i) => i.id === id);
      if (item) return item;
    }
    return undefined;
  },
}));
