import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { useStore, type CartItem } from '@/store';
import { cartLineKey, describeCustomizations } from '@/store/cartLogic';

function CartRow({ item }: { item: CartItem }) {
  const updateQuantity = useStore((s) => s.updateQuantity);

  const decrement = useCallback(() => {
    if (item.quantity === 1) {
      updateQuantity(item.itemId, 0, item.customizations);
    } else {
      updateQuantity(item.itemId, item.quantity - 1, item.customizations);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [item, updateQuantity]);

  const increment = useCallback(() => {
    updateQuantity(item.itemId, item.quantity + 1, item.customizations);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [item, updateQuantity]);

  const customizationSummary = describeCustomizations(item.customizations);

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.name}</Text>
        {customizationSummary !== '' && (
          <Text style={styles.rowOptions}>{customizationSummary}</Text>
        )}
        <Text style={styles.rowPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={decrement} style={styles.stepBtn}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepCount}>{item.quantity}</Text>
        <Pressable onPress={increment} style={styles.stepBtn}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const items = useStore((s) => s.items);
  const cartTotal = useStore((s) => s.cartTotal);
  const clearCart = useStore((s) => s.clearCart);
  const placeOrder = useStore((s) => s.placeOrder);
  const profile = useStore((s) => s.profile);

  const total = cartTotal();
  const deliveryFee = items.length > 0 ? 3.99 : 0;
  const grandTotal = total + deliveryFee;

  const handlePlaceOrder = useCallback(() => {
    Alert.alert(
      'Confirm Order',
      `Place order for $${grandTotal.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Place Order',
          onPress: () => {
            placeOrder(items, grandTotal);
            clearCart();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
              'Order Placed!',
              'Your order is on its way. Estimated delivery: 25–35 min.'
            );
          },
        },
      ]
    );
  }, [items, grandTotal, placeOrder, clearCart]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>YOUR ORDER</Text>
        <Text style={styles.headerTitle}>Cart</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            Browse the menu or ask The Gastronome to build your order.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i) => cartLineKey(i)}
            renderItem={({ item }) => <CartRow item={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.list}
          />

          <View style={[styles.summary, { paddingBottom: insets.bottom + 16 }]}>
            {profile.deliveryAddress !== '' && (
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>Delivering to</Text>
                <Text style={styles.addressValue} numberOfLines={1}>
                  {profile.deliveryAddress}
                </Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>${total.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery</Text>
              <Text style={styles.summaryValue}>${deliveryFee.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${grandTotal.toFixed(2)}</Text>
            </View>

            <Text style={styles.etaText}>Estimated delivery: 25–35 min</Text>

            <Pressable
              onPress={handlePlaceOrder}
              style={({ pressed }) => [styles.placeBtn, pressed && styles.placeBtnPressed]}
            >
              <Text style={styles.placeBtnText}>
                Place Order · ${grandTotal.toFixed(2)}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2,
    color: Colors.secondary, textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold',
    color: Colors.onSurface, marginTop: 2,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold', color: Colors.onSurface, marginBottom: 8 },
  emptySubtitle: {
    fontSize: 15, fontFamily: 'Inter_400Regular',
    color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22,
  },

  list: { paddingHorizontal: 20, paddingBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 14,
  },
  rowInfo: { flex: 1, marginRight: 16 },
  rowName: { fontSize: 16, fontFamily: 'Inter_500Medium', color: Colors.onSurface, marginBottom: 2 },
  rowOptions: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.secondary,
    marginBottom: 2,
  },
  rowPrice: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.onSurfaceVariant },
  separator: { height: 1, backgroundColor: Colors.outlineVariant },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { fontSize: 18, color: Colors.onSurface, lineHeight: 22 },
  stepCount: {
    fontSize: 16, fontFamily: 'Inter_600SemiBold',
    color: Colors.onSurface, minWidth: 20, textAlign: 'center',
  },

  summary: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: 1, borderTopColor: Colors.outlineVariant,
    paddingHorizontal: 20, paddingTop: 20,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  addressLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  addressValue: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.onSurface },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.onSurfaceVariant },
  summaryValue: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.onSurface },
  summaryTotal: {
    borderTopWidth: 1, borderTopColor: Colors.outlineVariant,
    paddingTop: 10, marginTop: 6, marginBottom: 0,
  },
  totalLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.onSurface },
  totalValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.onSurface },

  etaText: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    color: Colors.onSurfaceVariant, marginTop: 10, marginBottom: 16, textAlign: 'center',
  },
  placeBtn: {
    backgroundColor: Colors.secondary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center',
  },
  placeBtnPressed: { opacity: 0.8 },
  placeBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
