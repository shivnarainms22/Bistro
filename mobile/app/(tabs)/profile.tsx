import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { useStore, type OrderRecord } from '@/store';

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'];

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.onSurfaceVariant}
        keyboardType={keyboardType ?? 'default'}
        style={styles.fieldInput}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );
}

function OrderCard({ order }: { order: OrderRecord }) {
  const date = new Date(order.placedAt);
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderCardHeader}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Delivered</Text>
        <Text style={styles.dateText}>{formatted}</Text>
      </View>
      {order.items.map((item) => (
        <View key={item.itemId} style={styles.orderItemRow}>
          <Text style={styles.orderItemQty}>{item.quantity}×</Text>
          <Text style={styles.orderItemName}>{item.name}</Text>
          <Text style={styles.orderItemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
        </View>
      ))}
      <View style={styles.orderTotal}>
        <Text style={styles.orderTotalLabel}>Total paid</Text>
        <Text style={styles.orderTotalValue}>${order.total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const orders = useStore((s) => s.orders);

  const toggleDiet = (opt: string) => {
    const prefs = profile.dietaryPrefs.includes(opt)
      ? profile.dietaryPrefs.filter((p) => p !== opt)
      : [...profile.dietaryPrefs, opt];
    setProfile({ dietaryPrefs: prefs });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>YOUR ACCOUNT</Text>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Identity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Info</Text>
          <Field
            label="NAME"
            value={profile.name}
            onChange={(v) => setProfile({ name: v })}
            placeholder="Your name"
          />
          <Field
            label="EMAIL"
            value={profile.email}
            onChange={(v) => setProfile({ email: v })}
            placeholder="you@example.com"
            keyboardType="email-address"
          />
          <Field
            label="DELIVERY ADDRESS"
            value={profile.deliveryAddress}
            onChange={(v) => setProfile({ deliveryAddress: v })}
            placeholder="123 Main St, City"
          />
        </View>

        {/* Dietary prefs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dietary Preferences</Text>
          <Text style={styles.sectionHint}>
            The Gastronome uses these to personalise your recommendations.
          </Text>
          <View style={styles.chipGrid}>
            {DIETARY_OPTIONS.map((opt) => {
              const active = profile.dietaryPrefs.includes(opt);
              return (
                <Pressable
                  key={opt}
                  onPress={() => toggleDiet(opt)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {active ? '✓ ' : ''}{opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Order history */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order History</Text>
          {orders.length === 0 ? (
            <View style={styles.emptyOrders}>
              <Text style={styles.emptyOrdersText}>No orders yet.</Text>
            </View>
          ) : (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },

  header: { paddingTop: 12, paddingBottom: 20 },
  headerLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2,
    color: Colors.secondary, textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold',
    color: Colors.onSurface, marginTop: 2,
  },

  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 16, fontFamily: 'PlayfairDisplay_600SemiBold',
    color: Colors.onSurface, marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13, fontFamily: 'Inter_400Regular',
    color: Colors.onSurfaceVariant, marginBottom: 14, lineHeight: 18,
  },

  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5, textTransform: 'uppercase',
    color: Colors.onSurfaceVariant, marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.onSurface,
  },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  chipActive: { backgroundColor: Colors.onSurface, borderColor: Colors.onSurface },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.onSurfaceVariant },
  chipTextActive: { color: '#fff' },

  orderCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  orderCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3a9e3a' },
  statusText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#3a9e3a', flex: 1 },
  dateText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.onSurfaceVariant },

  orderItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  orderItemQty: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.secondary, width: 24 },
  orderItemName: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.onSurface },
  orderItemPrice: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.onSurfaceVariant },

  orderTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.outlineVariant,
  },
  orderTotalLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.onSurfaceVariant },
  orderTotalValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.onSurface },

  emptyOrders: { paddingVertical: 20, alignItems: 'center' },
  emptyOrdersText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.onSurfaceVariant },
});
