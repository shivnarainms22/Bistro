import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { fetchMenu, type MenuItem } from '@/lib/api';
import { useMenuStore, useStore } from '@/store';

function CategoryPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: active ? '#1b1c1c' : '#efeded',
        marginRight: 8,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: '500',
          color: active ? '#ffffff' : '#444748',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const localImages: Record<string, ReturnType<typeof require>> = {
  'smoked-octopus': require('@/assets/images/smoked-octopus.jpg'),
  'herb-crusted-lamb': require('@/assets/images/herb-crusted-lamb.jpg'),
};

function getDietaryLabels(item: MenuItem) {
  const labels: string[] = [];
  if (item.dietary.vegetarian) labels.push('Vegetarian');
  if (item.dietary.glutenFree) labels.push('GF');
  if (item.dietary.dairyFree) labels.push('Dairy-Free');
  if (item.dietary.nutFree) labels.push('Nut-Free');
  return labels.slice(0, 4);
}

function formatAllergen(allergen: MenuItem['allergens'][number]) {
  return allergen === 'tree-nuts' ? 'tree nuts' : allergen;
}

function ItemCard({ item }: { item: MenuItem }) {
  const addItem = useStore((s) => s.addItem);
  const updateQuantity = useStore((s) => s.updateQuantity);
  const removeItem = useStore((s) => s.removeItem);
  const cartItems = useStore((s) => s.items);
  const cartEntry = cartItems.find((i) => i.itemId === item.id && !i.customizations);
  const dietaryLabels = getDietaryLabels(item);
  const allergenLabel =
    item.allergens.length > 0 ? `Contains ${item.allergens.map(formatAllergen).join(', ')}` : null;

  const handleAdd = useCallback(() => {
    if (!item.inStock) return;
    addItem({ itemId: item.id, name: item.name, price: item.price });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [addItem, item]);

  const handleDecrement = useCallback(() => {
    if (!cartEntry) return;
    if (cartEntry.quantity === 1) {
      removeItem(item.id);
    } else {
      updateQuantity(item.id, cartEntry.quantity - 1);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [cartEntry, removeItem, updateQuantity, item.id]);

  return (
    <View style={styles.card}>
      <Image
        source={localImages[item.id] ?? { uri: item.imageUrl }}
        placeholder={{ blurhash: item.blurhash }}
        style={styles.cardImage}
        contentFit="cover"
        transition={300}
      />
      {!item.inStock && (
        <View style={styles.soldOutOverlay}>
          <Text style={styles.soldOutText}>SOLD OUT</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTags}>
          {item.tags.slice(0, 2).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
        <View style={styles.dietaryRow}>
          {dietaryLabels.map((label) => (
            <View key={label} style={styles.dietaryTag}>
              <Text style={styles.dietaryTagText}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {item.description}
        </Text>
        {allergenLabel && <Text style={styles.allergenText}>{allergenLabel}</Text>}
        <View style={styles.cardFooter}>
          <Text style={styles.cardPrice}>${item.price}</Text>
          {item.inStock ? (
            cartEntry ? (
              <View style={styles.stepper}>
                <Pressable onPress={handleDecrement} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepCount}>{cartEntry.quantity}</Text>
                <Pressable
                  onPress={handleAdd}
                  style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleAdd}
                style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
              >
                <Text style={styles.addBtnText}>+ Add</Text>
              </Pressable>
            )
          ) : (
            <View style={styles.addBtnDisabled}>
              <Text style={styles.addBtnDisabledText}>Unavailable</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMenuStore((s) => s.categories);
  const setCategories = useMenuStore((s) => s.setCategories);

  useEffect(() => {
    fetchMenu()
      .then((cats) => {
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].name);
      })
      .catch(() => setError('Could not load menu. Is the server running?'))
      .finally(() => setLoading(false));
  }, [setCategories]);

  const sections = useMemo(() => {
    const source = activeCategory
      ? categories.filter((c) => c.name === activeCategory)
      : categories;
    return source.map((cat) => ({ title: cat.name, data: cat.items }));
  }, [categories, activeCategory]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.secondary} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>OUR MENU</Text>
        <Text style={styles.headerTitle}>The Bistro</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexShrink: 0 }}
        contentContainerStyle={styles.pillRow}
      >
        {categories.map((cat) => (
          <CategoryPill
            key={cat.name}
            label={cat.name}
            active={activeCategory === cat.name}
            onPress={() => setActiveCategory(cat.name)}
          />
        ))}
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item }) => <ItemCard item={item} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  errorText: { color: Colors.secondary, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2,
    color: Colors.secondary, textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold',
    color: Colors.onSurface, marginTop: 2,
  },

  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pill: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.surfaceContainer,
    marginRight: 8,
  },
  pillActive: { backgroundColor: Colors.onSurface },
  pillText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.onSurfaceVariant },
  pillTextActive: { color: '#fff' },

  sectionHeader: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2,
    textTransform: 'uppercase', color: Colors.onSurfaceVariant,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
    backgroundColor: Colors.background,
  },

  card: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 12, overflow: 'hidden',
    shadowColor: Colors.onSurface,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 16, elevation: 2,
  },
  cardImage: { width: '100%', height: 200, backgroundColor: Colors.surfaceContainer },
  soldOutOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 200,
    backgroundColor: 'rgba(27,28,28,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldOutText: {
    color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  cardBody: { padding: 16 },
  cardTags: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: Colors.surfaceContainer, borderRadius: 4,
  },
  tagText: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    color: Colors.onSurfaceVariant, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  dietaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  dietaryTag: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: '#edf5e8', borderRadius: 999,
  },
  dietaryTagText: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    color: '#47633d', letterSpacing: 0.4, textTransform: 'uppercase',
  },
  cardName: {
    fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold',
    color: Colors.onSurface, marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14, fontFamily: 'Inter_400Regular',
    color: Colors.onSurfaceVariant, lineHeight: 20, marginBottom: 14,
  },
  allergenText: {
    fontSize: 11, fontFamily: 'Inter_500Medium',
    color: Colors.onSurfaceVariant, marginTop: -6, marginBottom: 12,
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold', color: Colors.onSurface },

  addBtn: {
    paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: Colors.onSurface, borderRadius: 8,
  },
  addBtnPressed: { opacity: 0.75 },
  addBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  addBtnDisabled: {
    paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: Colors.surfaceContainer, borderRadius: 8,
  },
  addBtnDisabledText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.onSurfaceVariant },

  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.secondary, borderRadius: 8, overflow: 'hidden',
  },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, color: '#fff', lineHeight: 24 },
  stepCount: {
    fontSize: 14, fontFamily: 'Inter_600SemiBold',
    color: '#fff', minWidth: 24, textAlign: 'center',
  },
});
