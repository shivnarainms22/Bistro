import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
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

import { MaterialIcons } from '@expo/vector-icons';

import { Colors } from '@/constants/Colors';
import { sendChatMessage, type HistoryEntry } from '@/lib/api';
import { useMenuStore, useStore } from '@/store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  text: "Welcome. I'm The Gastronome, your personal dining concierge. Tell me what you're in the mood for, or ask me to build your cart.",
};

const QUICK_CHIPS = [
  "What's popular tonight?",
  'Recommend a wine pairing',
  'Something vegetarian?',
];

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>G</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

export default function ConciergeScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<FlatList>(null);

  const clearConversation = useCallback(() => {
    setMessages([WELCOME]);
    setHistory([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const items = useStore((s) => s.items);
  const profile = useStore((s) => s.profile);
  const orders = useStore((s) => s.orders);
  const addItem = useStore((s) => s.addItem);
  const removeItem = useStore((s) => s.removeItem);
  const updateQuantity = useStore((s) => s.updateQuantity);
  const clearCart = useStore((s) => s.clearCart);
  const findItemById = useMenuStore((s) => s.findItemById);
  const cartItemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const applyActions = useCallback(
    (actions: { type: string; itemId: string; quantity?: number }[]) => {
      for (const action of actions) {
        if (action.type === 'add_item') {
          const menuItem = findItemById(action.itemId);
          if (!menuItem) continue;
          const qty = action.quantity ?? 1;
          const existing = items.find((i) => i.itemId === action.itemId);
          if (existing) {
            updateQuantity(action.itemId, existing.quantity + qty);
          } else {
            addItem({ itemId: action.itemId, name: menuItem.name, price: menuItem.price });
            if (qty > 1) updateQuantity(action.itemId, qty);
          }
        } else if (action.type === 'remove_item') {
          removeItem(action.itemId);
        } else if (action.type === 'update_quantity' && action.quantity !== undefined) {
          updateQuantity(action.itemId, action.quantity);
        } else if (action.type === 'clear_cart') {
          clearCart();
        }
      }
    },
    [items, findItemById, addItem, removeItem, updateQuantity, clearCart]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setInput('');
      setSending(true);

      const userMsg: Message = { id: Date.now().toString(), role: 'user', text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        const res = await sendChatMessage(trimmed, items, profile, history, orders);
        applyActions(res.actions);
        if (res.actions.length > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const reply: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: res.reply,
        };
        setMessages((prev) => [...prev, reply]);
        setHistory((prev) => [
          ...prev,
          { role: 'user', parts: trimmed },
          { role: 'model', parts: res.reply },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: "I'm having trouble reaching the kitchen right now. Please try again.",
          },
        ]);
      } finally {
        setSending(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    },
    [sending, items, profile, applyActions]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>G</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>The Gastronome</Text>
          <Text style={styles.headerSub}>Your dining concierge</Text>
        </View>
        {cartItemCount > 0 && (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartItemCount} in cart</Text>
          </View>
        )}
        <Pressable
          onPress={clearConversation}
          style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.5 }]}
        >
          <MaterialIcons name="refresh" size={20} color={Colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Bubble message={item} />}
        contentContainerStyle={styles.messageList}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Typing indicator */}
      {sending && (
        <View style={styles.typingRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>G</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            <Text style={styles.typingDots}>• • •</Text>
          </View>
        </View>
      )}

      {/* Quick chips — hidden when text input is focused */}
      {!inputFocused && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexShrink: 0 }}
          contentContainerStyle={styles.chipsRow}
        >
          {QUICK_CHIPS.map((chip) => (
            <Pressable
              key={chip}
              onPress={() => send(chip)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText} numberOfLines={1}>{chip}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask for a recommendation…"
          placeholderTextColor={Colors.onSurfaceVariant}
          style={styles.input}
          multiline
          returnKeyType="send"
          onSubmitEditing={() => send(input)}
          blurOnSubmit
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            (!input.trim() || sending) && styles.sendBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.onSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: Colors.onSurface,
  },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.onSurfaceVariant },
  cartBadge: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cartBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  clearBtn: { padding: 4 },

  messageList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  bubbleRowUser: { flexDirection: 'row-reverse' },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.onSurface,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleAssistant: { backgroundColor: Colors.surfaceContainer, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: Colors.secondaryContainer, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.onSurface, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  typingDots: { fontSize: 18, color: Colors.onSurfaceVariant, letterSpacing: 2 },

  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    flexShrink: 0,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.onSurfaceVariant, includeFontPadding: false },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.onSurface,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.surfaceContainer },
  sendBtnPressed: { opacity: 0.75 },
  sendBtnText: { color: '#fff', fontSize: 20, lineHeight: 24 },
});
