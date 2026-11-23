import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import SlidingSegment from '../components/SlidingSegment';
import AssistantDashboard from '../components/assistant/AssistantDashboard';
import AssistantChat from '../components/assistant/AssistantChat';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import useAi from '../hooks/useAi';
import useIsDesktop from '../hooks/useBreakpoint';

/**
 * AI Assistant: a dashboard of the person's real work (overview, insights, AI suggestions, deadlines, team,
 * reports, recent activity) next to a chat that answers from the same data and changes nothing without a yes.
 * Desktop: dashboard and chat side by side. Phones and tablets: an Overview / Chat switch.
 */
export default function AssistantScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const enabled = useAi();
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [openId, setOpenId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const chatRef = useRef(null);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Coming back to the screen shows fresh numbers.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    refresh();
  }, [refresh]));

  const ask = useCallback((text) => {
    if (!desktop) setTab('chat');
    // Let the chat mount on phones before the question goes in.
    setTimeout(() => chatRef.current?.ask(text), desktop ? 0 : 50);
  }, [desktop]);

  const dashboard = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.dash, { paddingBottom: desktop ? spacing.xxxl : 120 + insets.bottom }]}>
      <AssistantDashboard name={user?.name} onOpen={setOpenId} onAsk={ask} refreshKey={refreshKey} wide={desktop} />
    </ScrollView>
  );
  const chat = (
    <AssistantChat ref={chatRef} enabled={enabled} onChanged={refresh} bottomInset={desktop ? spacing.md : insets.bottom + 66} />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, paddingTop: desktop ? spacing.lg : insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <BackTitle title="AI Assistant" style={{ flex: 1 }} />
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark-outline" size={13} color={colors.gray[600]} />
          <Text style={styles.badgeText}>Changes only with your OK</Text>
        </View>
        <AnimatedPressable onPress={refresh} style={styles.iconBtn} accessibilityLabel="Refresh the overview">
          <Ionicons name="refresh" size={19} color={colors.gray[600]} />
        </AnimatedPressable>
      </View>

      {desktop ? (
        <View style={styles.split}>
          <View style={{ flex: 1, minWidth: 0 }}>{dashboard}</View>
          <View style={styles.chatPane}>{chat}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <SlidingSegment
            style={styles.segment}
            pillStyle={{ top: 3, bottom: 3, borderRadius: radius.md }}
            value={tab}
            items={[['overview', 'Overview', 'grid-outline'], ['chat', 'Chat', 'chatbubbles-outline']].map(([key, label, icon]) => ({
              key,
              style: { flex: 1 },
              content: (
                <AnimatedPressable style={styles.segBtn} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
                  <Ionicons name={icon} size={15} color={tab === key ? colors.brand[700] : colors.gray[500]} />
                  <Text style={[styles.segText, tab === key && styles.segTextOn]}>{label}</Text>
                </AnimatedPressable>
              ),
            }))}
          />
          {/* Both stay mounted, so switching keeps the chat and the scroll position. */}
          <View style={[{ flex: 1 }, tab !== 'overview' && styles.hidden]}>{dashboard}</View>
          <View style={[{ flex: 1 }, tab !== 'chat' && styles.hidden]}>{chat}</View>
        </View>
      )}
      <TodoDetailSheet todoId={openId} onClose={() => { setOpenId(null); refresh(); }} />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.gray[100] },
  badgeText: { fontSize: fontSize.sm, color: colors.gray[600], fontWeight: '600' },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  split: { flex: 1, flexDirection: 'row', minHeight: 0 },
  dash: { padding: spacing.lg, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  chatPane: { width: 420, borderLeftWidth: 1, borderColor: colors.gray[200], minHeight: 0 },
  segment: { flexDirection: 'row', gap: 4, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 3, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.md },
  segText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[500] },
  segTextOn: { color: colors.brand[700], fontWeight: '700' },
  hidden: { display: 'none' },
});
