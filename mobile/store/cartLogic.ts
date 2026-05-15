export interface CartCustomizations {
  size?: string;
  spiceLevel?: string;
  milk?: string;
  doneness?: string;
  sides?: string[];
  specialInstructions?: string;
}

export interface CartItemLike {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
  customizations?: CartCustomizations;
}

export interface MenuItemLike {
  id: string;
  name: string;
  price: number;
}

export interface CartActionLike {
  type: 'add_item' | 'remove_item' | 'update_quantity' | 'update_item' | 'clear_cart';
  itemId: string;
  quantity?: number;
  customizations?: CartCustomizations;
}

export function customizationKey(customizations?: CartCustomizations): string {
  if (!customizations) return '';
  const sides = [...(customizations.sides ?? [])].sort();
  return JSON.stringify({
    size: customizations.size ?? '',
    spiceLevel: customizations.spiceLevel ?? '',
    milk: customizations.milk ?? '',
    doneness: customizations.doneness ?? '',
    sides,
    specialInstructions: customizations.specialInstructions ?? '',
  });
}

export function cartLineKey(item: Pick<CartItemLike, 'itemId' | 'customizations'>): string {
  const key = customizationKey(item.customizations);
  return key ? `${item.itemId}:${key}` : item.itemId;
}

export function addCartItem(items: CartItemLike[], item: CartItemLike): CartItemLike[] {
  const quantity = Math.max(1, Math.trunc(item.quantity || 1));
  const nextItem = withOptionalCustomizations({ ...item, quantity });
  const nextKey = cartLineKey(nextItem);
  const existing = items.find((cartItem) => cartLineKey(cartItem) === nextKey);

  if (existing) {
    return items.map((cartItem) =>
      cartLineKey(cartItem) === nextKey
        ? { ...cartItem, quantity: cartItem.quantity + quantity }
        : cartItem
    );
  }

  return [...items, nextItem];
}

export function normalizeCartItems<T extends CartItemLike>(items: T[]): T[] {
  return mergeCartLines(items);
}

export function updateCartQuantity(
  items: CartItemLike[],
  itemId: string,
  quantity: number,
  customizations?: CartCustomizations
): CartItemLike[] {
  const targetKey = resolveCartLineKey(items, itemId, customizations);
  if (!targetKey) return items;

  const nextQuantity = Math.trunc(quantity);

  if (nextQuantity <= 0) {
    return items.filter((cartItem) => cartLineKey(cartItem) !== targetKey);
  }

  return items.map((cartItem) =>
    cartLineKey(cartItem) === targetKey ? { ...cartItem, quantity: nextQuantity } : cartItem
  );
}

function resolveCartLineKey(
  items: CartItemLike[],
  itemId: string,
  customizations?: CartCustomizations
): string | null {
  const requestedKey = cartLineKey({ itemId, customizations });
  if (items.some((cartItem) => cartLineKey(cartItem) === requestedKey)) return requestedKey;
  if (customizations) return null;

  const matchingLines = items.filter((cartItem) => cartItem.itemId === itemId);
  return matchingLines.length === 1 ? cartLineKey(matchingLines[0]!) : null;
}

export function applyCartActionToItems(
  items: CartItemLike[],
  action: CartActionLike,
  menuItem?: MenuItemLike
): CartItemLike[] {
  if (action.type === 'clear_cart') return [];
  if (action.type === 'remove_item') return items.filter((item) => item.itemId !== action.itemId);
  if (action.type === 'update_quantity') {
    return updateCartQuantity(items, action.itemId, action.quantity ?? 0, action.customizations);
  }
  if (action.type === 'update_item') {
    return updateCartCustomizations(items, action.itemId, action.customizations);
  }
  if (action.type === 'add_item' && menuItem) {
    return addCartItem(items, {
      itemId: action.itemId,
      name: menuItem.name,
      price: menuItem.price,
      quantity: action.quantity ?? 1,
      customizations: action.customizations,
    });
  }
  return items;
}

export function updateCartCustomizations(
  items: CartItemLike[],
  itemId: string,
  customizations?: CartCustomizations
): CartItemLike[] {
  return mergeCartLines(
    items.map((item) =>
      item.itemId === itemId
        ? withOptionalCustomizations({
            ...item,
            customizations: { ...(item.customizations ?? {}), ...(customizations ?? {}) },
          })
        : item
    )
  );
}

export function describeCustomizations(customizations?: CartCustomizations): string {
  if (!customizations) return '';
  const parts = [
    customizations.size,
    customizations.milk ? `${customizations.milk} milk` : undefined,
    customizations.spiceLevel,
    customizations.doneness,
    ...(customizations.sides ?? []),
    customizations.specialInstructions,
  ].filter((part): part is string => Boolean(part));

  return parts
    .map((part, index) => (index === 0 ? capitalize(part) : part))
    .join(', ');
}

function withOptionalCustomizations<T extends CartItemLike>(item: T): T {
  if (!item.customizations || Object.keys(item.customizations).length === 0) {
    const { customizations: _customizations, ...rest } = item;
    return rest as T;
  }
  return item;
}

function mergeCartLines<T extends CartItemLike>(items: T[]): T[] {
  const merged = new Map<string, T>();

  for (const item of items) {
    const key = cartLineKey(item);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
  }

  return Array.from(merged.values());
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
