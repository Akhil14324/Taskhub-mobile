import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import BackTitle from '../components/BackTitle';
import { timeAgo } from '../utils/dates';
import { showToast } from '../utils/events';

/**
 * Recycle bin (F-BRD-11): to-dos deleted in the last 90 days that you may bring back (you made it, you run its
 * company, or you are in leadership). Bringing one back restores it with its sub-tasks, people, comments, files,
 * column values and time, and never overwrites anything that exists.
 */
export default function RecycleBinScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { refresh } = useTodos();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/work/recycle', { __skipOops: true });
      setItems(res.data.items);
    } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const restore = async (it) => {
    setBusy(it.id);
    try {
      await api.post(`/work/recycle/${it.id}/restore`);
      setItems((list) => list.filter((x) => x.id !== it.id));
      showToast({ message: `"${it.title}" is back${it.with_subtasks ? ` with ${it.with_subtasks} sub-task${it.with_subtasks === 1 ? '' : 's'}` : ''}`, tone: 'success', icon: 'arrow-undo' });
      refresh?.();
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not bring it back', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingVertical: spacing.md, gap: 2 }}>
        <BackTitle title="Recycle bin" style={{ fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }} />
        <Text style={{ fontSize: 14, color: colors.gray[600] }}>Deleted to-dos from the last 90 days. Bring one back and everything that was in it comes too.</Text>
      </View>
      {items === null ? <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} /> : (
        <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.md, paddingTop: 0, paddingBottom: 140, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
          <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
            {!items.length && (
              <View style={{ alignItems: 'center', gap: 6, padding: spacing.xl }}>
                <Ionicons name="trash-outline" size={30} color={colors.gray[400]} />
                <Text style={{ color: colors.gray[600] }}>Nothing here.</Text>
              </View>
            )}
            {items.map((it, i) => (
              <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderColor: colors.gray[100] }}>
                <Ionicons name="document-outline" size={17} color={colors.gray[500]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: colors.gray[900] }}>{it.title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>
                    {[it.business_name || 'Personal', `deleted ${timeAgo(it.deleted_at)}`, it.with_subtasks ? `${it.with_subtasks} sub-task${it.with_subtasks === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {busy === it.id ? <ActivityIndicator color={BRAND} /> : (
                  <Pressable onPress={() => restore(it)} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.brand[50] : 'transparent' })}>
                    <Ionicons name="arrow-undo-outline" size={15} color={BRAND} />
                    <Text style={{ color: BRAND, fontWeight: '600' }}>Bring back</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
