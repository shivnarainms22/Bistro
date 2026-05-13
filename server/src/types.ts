export type MenuCategoryName =
  | "Signature Dishes"
  | "Artisan Starters"
  | "Artisan Pizzas"
  | "Sommelier's Selection"
  | "Coffee & Brunch";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  category: MenuCategoryName;
  tags: string[];
  imageUrl: string;
  blurhash: string;
  inStock: boolean;
  customizable: boolean;
}

export interface MenuCategory {
  name: MenuCategoryName;
  items: MenuItem[];
}

export interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
  customizations?: {
    doneness?: string;
    sides?: string[];
    specialInstructions?: string;
  };
}

export interface UserProfile {
  name: string;
  dietaryPrefs: string[];
  deliveryAddress: string;
}

export type CartActionType = "add_item" | "remove_item" | "update_quantity" | "clear_cart";

export interface CartAction {
  type: CartActionType;
  itemId: string;
  quantity?: number;
}

export interface HistoryEntry {
  role: 'user' | 'model';
  parts: string;
}

export interface OrderRecord {
  id: string;
  items: CartItem[];
  total: number;
  placedAt: string;
}

export interface ChatRequest {
  message: string;
  cart: CartItem[];
  profile: UserProfile;
  history: HistoryEntry[];
  orders: OrderRecord[];
}

export interface ChatResponse {
  reply: string;
  actions: CartAction[];
}
