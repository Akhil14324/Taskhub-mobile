import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import useShortcuts from '../hooks/useShortcuts';
import { spacing, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import ChatListScreen from './ChatListScreen';
import ChatThreadScreen from './ChatThreadScreen';
import { Panel, usePanel } from '../components/Panel';
import AnimatedPressable from '../components/AnimatedPressable';

/**
 * Desktop chat: the conversation list on the left, the open conversation on the right (like a mail
 * client), instead of one stretched list. Phones keep the separate list and thread screens.
 */
export default function ChatWorkspace() {
  const colors = useColors();
  const route = useRoute();
  const fromLink = route.params?.conversationId ?? null;
  const [activeId, setActiveId] = useState(fromLink);
  const list = usePanel('chat.list');

  // Up / Down move between conversations when no text box has focus; Esc closes the open one.
  const { conversations } = useChat();
  const step = (d) => {
    const list = conversations || [];
    if (!list.length) return false;
    const i = list.findIndex((c) => String(c.id) === String(activeId));
    setActiveId(list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))].id);
    return undefined;
  };
  useShortcuts({ 'chat.next': () => step(1), 'chat.prev': () => step(-1), Escape: () => { if (activeId) { setActiveId(null); return undefined; } return false; } });

  // A notification or shared card can open a specific conversation.
  useEffect(() => { if (fromLink) setActiveId(fromLink); }, [fromLink]);

  // With the conversation list closed, this brings it back (it sits at the start of the thread's header).
  const showList = !list.open ? (
    <AnimatedPressable onPress={list.toggle} hitSlop={6} accessibilityLabel="Show conversations" dataSet={{ tip: 'Show conversations' }} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="chevron-forward" size={22} color={colors.gray[600]} />
    </AnimatedPressable>
  ) : null;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.page }}>
      <Panel p={list.p} width={380}>
        <View {...glass('bar')} style={{ flex: 1, borderRightWidth: 1, borderRightColor: colors.gray[200], backgroundColor: colors.white }}>
          <ChatListScreen onOpen={setActiveId} activeId={activeId} onCollapse={list.toggle} />
        </View>
      </Panel>
      <View style={{ flex: 1, minWidth: 0 }}>
        {activeId ? (
          <ChatThreadScreen key={activeId} conversationId={activeId} embedded leading={showList} />
        ) : (
          <View style={styles.empty}>
            {!list.open && <View style={{ position: 'absolute', top: spacing.md, left: spacing.md }}>{showList}</View>}
            <Ionicons name="chatbubbles-outline" size={56} color={colors.gray[300]} />
            <Text style={[styles.title, { color: colors.gray[700] }]}>Pick a conversation</Text>
            <Text style={[styles.sub, { color: colors.gray[500] }]}>Choose someone on the left to read and reply, or start a new chat with the pencil button.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  sub: { fontSize: fontSize.sm, textAlign: 'center', maxWidth: 320 },
});
