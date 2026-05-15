import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MenuCategory, MenuItem } from '@/lib/api';
import {
  addCartItem,
  updateCartCustomizations,
  updateCartQuantity,
  type CartCustomizations,
} from './cartLogic';

export const DIETARY_OPTIONS = ['Vegetarian', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'] as const;

export interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
  customizations?: CartCustomizations;
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
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number, customizations?: CartCustomizations) => void;
  updateCustomizations: (itemId: string, customizations?: CartCustomizations) => void;
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

function sanitizeDietaryPrefs(prefs: unknown): string[] {
  if (!Array.isArray(prefs)) return [];
  return prefs.filter((pref): pref is string =>
    typeof pref === 'string' && DIETARY_OPTIONS.includes(pref as (typeof DIETARY_OPTIONS)[number])
  );
}

export const useStore = create<BistroStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => ({
          items: addCartItem(state.items, { ...item, quantity: item.quantity ?? 1 }),
        })),
      removeItem: (itemId) =>
        set((state) => ({ items: state.items.filter((i) => i.itemId !== itemId) })),
      updateQuantity: (itemId, quantity, customizations) =>
        set((state) => ({
          items: updateCartQuantity(state.items, itemId, quantity, customizations),
        })),
      updateCustomizations: (itemId, customizations) =>
        set((state) => ({
          items: updateCartCustomizations(state.items, itemId, customizations),
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
        set((state) => ({
          profile: {
            ...state.profile,
            ...patch,
            dietaryPrefs:
              'dietaryPrefs' in patch
                ? sanitizeDietaryPrefs(patch.dietaryPrefs)
                : sanitizeDietaryPrefs(state.profile.dietaryPrefs),
          },
        })),

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
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<BistroStore> | undefined;
        return {
          ...current,
          ...persistedState,
          profile: {
            ...current.profile,
            ...persistedState?.profile,
            dietaryPrefs: sanitizeDietaryPrefs(persistedState?.profile?.dietaryPrefs),
          },
        };
      },
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
