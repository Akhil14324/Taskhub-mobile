import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import BottomSheet from './BottomSheet';
import { Avatar } from './kit';
import useDirectory, { filterPeople } from '../hooks/useDirectory';
import { showToast } from '../utils/events';

/**
 * Pick chats (existing conversations or any colleague) and send something to them.
 * onSend({ conversationIds, note }) must perform the actual share.
 */
export default function ShareToChatSheet({ visible, onClose, heading, subheading, onSend }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { conversations, createConversation, fetchConversations } = useChat();
  const { people } = useDirectory();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]); // [{ key, conversationId?, userId?, label }]
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelected([]);
      setNote('');
      fetchConversations();
    }
  }, [visible, fetchConversations]);

  const convLabel = (c) => {
    if (c.type === 'group') return c.name || 'Group';
    const other = c.participants?.find((p) => String(p.id) !== String(user?.id));
    return other?.name || 'Chat';
  };

  const q = query.trim().toLowerCase();
  const convItems = conversations
    .filter((c) => !q || convLabel(c).toLowerCase().includes(q))
    .slice(0, 30);
  // People without an existing direct chat can be picked too — a chat is created on send.
  const directWith = new Set(
    conversations.filter((c) => c.type === 'direct')
      .map((c) => c.participants?.find((p) => String(p.id) !== String(user?.id))?.id)
      .filter(Boolean)
      .map(Number)
  );
  const peopleItems = q ? filterPeople(people, q, { excludeIds: [user?.id, ...directWith], limit: 6 }) : [];

  const toggle = (item) => {
    setSelected((prev) => (prev.some((s) => s.key === item.key) ? prev.filter((s) => s.key !== item.key) : [...prev, item]));
  };

  const send = async () => {
    if (!selected.length || sending) return;
    setSending(true);
    try {
      const conversationIds = [];
      for (const s of selected) {
        if (s.conversationId) conversationIds.push(s.conversationId);
        else if (s.userId) {
          const conv = await createConversation('direct', [s.userId]);
          conversationIds.push(conv.id);
        }
      }
      await onSend({ conversationIds, note: note.trim() || null });
      showToast({ message: `Shared to ${selected.length === 1 ? selected[0].label : `${selected.length} chats`}`, tone: 'success', icon: 'paper-plane' });
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not share', tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const Row = ({ item, title, subtitle, avatarName, avatarUri, icon }) => {
    const isOn = selected.some((s) => s.key === item.key);
    return (
      <AnimatedPressable style={styles.row} onPress={() => toggle(item)} haptic="light">
        {icon ? (
          <View style={styles.groupIcon}><Ionicons name={icon} size={18} color={colors.brand[600]} /></View>
        ) : (
          <Avatar name={avatarName} uri={avatarUri} size={36} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <Ionicons name={isOn ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isOn ? colors.brand[600] : colors.gray[300]} />
      </AnimatedPressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640} avoidKeyboard>
      <View style={styles.header}>
        <Text style={styles.heading}>{heading || 'Share to chat'}</Text>
        {!!subheading && <Text style={styles.subheading} numberOfLines={2}>{subheading}</Text>}
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.gray[400]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats or people"
          placeholderTextColor={colors.gray[400]}
          style={styles.searchInput}
        />
      </View>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        {convItems.map((c) => {
          const other = c.participants?.find((p) => String(p.id) !== String(user?.id));
          return (
            <Row
              key={`c${c.id}`}
              item={{ key: `c${c.id}`, conversationId: c.id, label: convLabel(c) }}
              title={convLabel(c)}
              subtitle={c.type === 'group' ? `${c.participants?.length || 0} members` : 'Direct message'}
              avatarName={other?.name}
              avatarUri={other?.profile_picture}
              icon={c.type === 'group' ? 'people' : null}
            />
          );
        })}
        {peopleItems.map((p) => (
          <Row
            key={`u${p.id}`}
            item={{ key: `u${p.id}`, userId: p.id, label: p.name }}
            title={p.name}
            subtitle={`@${p.username} · start a chat`}
            avatarName={p.name}
            avatarUri={p.profile_picture}
          />
        ))}
        {convItems.length === 0 && peopleItems.length === 0 && (
          <Text style={styles.empty}>{q ? 'No matches' : 'No chats yet — search for a colleague'}</Text>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a message (optional)"
          placeholderTextColor={colors.gray[400]}
          style={styles.note}
        />
        <AnimatedPressable
          onPress={send}
          disabled={!selected.length || sending}
          haptic="medium"
          style={[styles.send, (!selected.length || sending) && { opacity: 0.4 }]}
        >
          <Ionicons name="paper-plane" size={18} color={colors.white} />
          <Text style={styles.sendText}>{selected.length > 1 ? `Send (${selected.length})` : 'Send'}</Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  header: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  heading: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] },
  subheading: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  groupIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  rowSub: { fontSize: fontSize.sm, color: colors.gray[500] },
  empty: { textAlign: 'center', color: colors.gray[400], paddingVertical: spacing.xl },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
  },
  note: {
    flex: 1,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  send: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand[600],
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.lg,
  },
  sendText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
