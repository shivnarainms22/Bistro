import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  addCartItem,
  applyCartActionToItems,
  cartLineKey,
  describeCustomizations,
  normalizeCartItems,
  updateCartCustomizations,
  updateCartQuantity,
} from '../store/cartLogic.js';

describe('cart logic', () => {
  test('merges quantities only when item customizations match', () => {
    const first = addCartItem([], {
      itemId: 'oat-flat-white',
      name: 'Oat Flat White',
      price: 6,
      quantity: 1,
      customizations: { size: 'large', milk: 'oat' },
    });

    const merged = addCartItem(first, {
      itemId: 'oat-flat-white',
      name: 'Oat Flat White',
      price: 6,
      quantity: 2,
      customizations: { milk: 'oat', size: 'large' },
    });

    const separate = addCartItem(merged, {
      itemId: 'oat-flat-white',
      name: 'Oat Flat White',
      price: 6,
      quantity: 1,
      customizations: { size: 'small', milk: 'oat' },
    });

    assert.equal(separate.length, 2);
    assert.equal(separate[0]?.quantity, 3);
    assert.equal(separate[1]?.quantity, 1);
  });

  test('applies AI add actions with menu metadata and customizations', () => {
    const items = applyCartActionToItems(
      [],
      {
        type: 'add_item',
        itemId: 'dry-aged-ribeye',
        quantity: 1,
        customizations: {
          doneness: 'medium rare',
          sides: ['fries'],
          specialInstructions: 'sauce on the side',
        },
      },
      { id: 'dry-aged-ribeye', name: 'Dry-Aged Ribeye', price: 65 }
    );

    assert.deepEqual(items, [
      {
        itemId: 'dry-aged-ribeye',
        name: 'Dry-Aged Ribeye',
        price: 65,
        quantity: 1,
        customizations: {
          doneness: 'medium rare',
          sides: ['fries'],
          specialInstructions: 'sauce on the side',
        },
      },
    ]);
  });

  test('formats customizations for cart display', () => {
    assert.equal(
      describeCustomizations({
        size: 'large',
        milk: 'oat',
        spiceLevel: 'spicy',
        sides: ['fries', 'side salad'],
      }),
      'Large, oat milk, spicy, fries, side salad'
    );
  });

  test('applies AI option updates to matching cart items', () => {
    const items = applyCartActionToItems(
      [
        {
          itemId: 'dry-aged-ribeye',
          name: 'Dry-Aged Ribeye',
          price: 65,
          quantity: 1,
        },
      ],
      {
        type: 'update_item',
        itemId: 'dry-aged-ribeye',
        customizations: { doneness: 'medium rare', sides: ['fries'] },
      }
    );

    assert.deepEqual(items[0]?.customizations, {
      doneness: 'medium rare',
      sides: ['fries'],
    });
  });

  test('updates a single customized item line when AI omits customizations', () => {
    const items = updateCartQuantity(
      [
        {
          itemId: 'dry-aged-ribeye',
          name: 'Dry-Aged Ribeye',
          price: 65,
          quantity: 1,
          customizations: { doneness: 'medium rare', sides: ['fries'] },
        },
      ],
      'dry-aged-ribeye',
      2
    );

    assert.equal(items[0]?.quantity, 2);
    assert.deepEqual(items[0]?.customizations, {
      doneness: 'medium rare',
      sides: ['fries'],
    });
  });

  test('merges cart lines when customization updates produce the same key', () => {
    const items = updateCartCustomizations(
      [
        {
          itemId: 'dry-aged-ribeye',
          name: 'Dry-Aged Ribeye',
          price: 65,
          quantity: 1,
          customizations: { doneness: 'well done' },
        },
        {
          itemId: 'dry-aged-ribeye',
          name: 'Dry-Aged Ribeye',
          price: 65,
          quantity: 1,
        },
      ],
      'dry-aged-ribeye',
      { doneness: 'well done' }
    );

    const keys = items.map(cartLineKey);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(items, [
      {
        itemId: 'dry-aged-ribeye',
        name: 'Dry-Aged Ribeye',
        price: 65,
        quantity: 2,
        customizations: { doneness: 'well done' },
      },
    ]);
  });

  test('normalizes duplicate persisted cart lines', () => {
    const items = normalizeCartItems([
      {
        itemId: 'dry-aged-ribeye',
        name: 'Dry-Aged Ribeye',
        price: 65,
        quantity: 1,
        customizations: { doneness: 'well done' },
      },
      {
        itemId: 'dry-aged-ribeye',
        name: 'Dry-Aged Ribeye',
        price: 65,
        quantity: 2,
        customizations: { doneness: 'well done' },
      },
    ]);

    assert.deepEqual(items, [
      {
        itemId: 'dry-aged-ribeye',
        name: 'Dry-Aged Ribeye',
        price: 65,
        quantity: 3,
        customizations: { doneness: 'well done' },
      },
    ]);
  });

  test('applies AI clear-cart actions by removing every line item', () => {
    const items = applyCartActionToItems(
      [
        {
          itemId: 'margherita',
          name: 'Margherita',
          price: 16,
          quantity: 2,
        },
        {
          itemId: 'oat-flat-white',
          name: 'Oat Flat White',
          price: 6,
          quantity: 1,
          customizations: { size: 'large' },
        },
      ],
      { type: 'clear_cart', itemId: '' }
    );

    assert.deepEqual(items, []);
  });
});
