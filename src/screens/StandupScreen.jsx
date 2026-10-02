import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, EmptyHero } from '../components/kit';
import { addDays, formatDayHeader } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

const SECTIONS = [
  { key: 'done', title: 'Done since the last working day', icon: 'checkmark-done', empty: 'Nothing finished yet.' },
  { key: 'doing', title: 'Working on today', icon: 'play-circle-outline', empty: 'Nothing planned. Add a line.' },
  { key: 'blockers', title: 'Blocked or waiting', icon: 'hand-left-outline', empty: 'No blockers. Keep it that way.' },
];

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** One section of a stand-up: lines you can remove, and a box to add your own. */
function Section({ def, items, onChange, readOnly }) {
  const colors = useColors();
  const [draft, setDraft] = useState('');
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onChange([...items, { id: null, title }]);
    setDraft('');
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={def.icon} size={16} color={colors.brand[600]} />
        <Text style={{ fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] }}>{def.title}</Text>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.gray[400] }}>{items.length || ''}</Text>
      </View>
      {!items.length && <Text style={{ fontSize: fontSize.sm, color: colors.gray[500], paddingLeft: 24 }}>{def.empty}</Text>}
      {items.map((it, i) => (
        <View key={`${it.id ?? 'x'}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 24 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gray[400] }} />
          <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.gray[800] }}>{it.title}</Text>
          {!readOnly && (
            <AnimatedPressable onPress={() => onChange(items.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove this line">
              <Ionicons name="close" size={16} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </View>
      ))}
      {!readOnly && (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          placeholder="Add a line"
          placeholderTextColor={colors.gray[400]}
          style={{
            marginLeft: 24, height: 34, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.gray[100],
            fontSize: fontSize.sm, color: colors.gray[900], outlineStyle: 'none',
          }}
        />
      )}
    </View>
  );
}

function PostCard({ post, onNudge }) {
  const colors = useColors();
  return (
    <View style={{
      marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.md,
    }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={post.name} uri={post.profile_picture} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900] }}>{post.name}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>Posted {timeOf(post.created_at)}</Text>
        </View>
      </View>
      {SECTIONS.map((s) => (post[s.key] || []).length > 0 && <Section key={s.key} def={s} items={post[s.key]} readOnly />)}
      {!!post.note && <Text style={{ fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 19 }}>{post.note}</Text>}
    </View>
  );
}

export default function StandupScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('mine');
  const [today, setToday] = useState(null);
  const [lists, setLists] = useState({ done: [], doing: [], blockers: [] });
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [feed, setFeed] = useState(null);
  const [feedDay, setFeedDay] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMine = useCallback(async () => {
    try {
      const res = await api.get('/standup/today', { __skipOops: true });
      setToday(res.data);
      const src = res.data.posted || res.data.draft;
      setLists({ done: src.done || [], doing: src.doing || [], blockers: src.blockers || [] });
      setNote(res.data.posted?.note || '');
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your stand-up');
    }
  }, []);

  const loadFeed = useCallback(async (day) => {
    try {
      const res = await api.get('/standup/feed', { params: day ? { day } : undefined, __skipOops: true });
      setFeed(res.data);
      setFeedDay(res.data.day);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the team stand-ups');
    }
  }, []);

  useFocusEffect(useCallback(() => { loadMine(); loadFeed(); }, [loadMine, loadFeed]));

  const edit = (key) => (items) => { setLists((l) => ({ ...l, [key]: items })); setDirty(true); };

  const post = async () => {
    setSaving(true);
    try {
      const res = await api.post('/standup', { ...lists, note });
      setToday((t) => ({ ...t, posted: res.data.standup }));
      setDirty(false);
      showToast({ message: today?.posted ? 'Stand-up updated' : 'Stand-up posted', icon: 'checkmark-circle' });
      loadFeed(feedDay);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not post', icon: 'alert-circle' });
    } finally {
      setSaving(false);
    }
  };

  const takeBack = async () => {
    const ok = await confirmDialog({ title: 'Take back today\'s stand-up?', confirmLabel: 'Take back', destructive: true });
    if (!ok) return;
    try {
      await api.delete('/standup/today');
      await loadMine();
      loadFeed(feedDay);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not take it back', icon: 'alert-circle' });
    }
  };

  const nudge = async (p) => {
    try {
      const res = await api.post('/standup/nudge', { user_id: p.id });
      showToast({ message: res.data.nudged ? `Reminder sent to ${p.name}` : `${p.name} has just posted`, icon: 'alarm' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not send the reminder', icon: 'alert-circle' });
    }
  };

  const posted = today?.posted;
  const empty = !lists.done.length && !lists.doing.length && !lists.blockers.length && !note.trim();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Stand-up" style={styles.title} />
        <Text style={styles.subtitle}>What got done, what is next, what is in the way. One tap.</Text>
      </View>
      <View style={styles.tabs}>
        <Chip icon="person" label="My stand-up" active={tab === 'mine'} onPress={() => setTab('mine')} />
        <Chip icon="people" label={`Team${feed?.posts?.length ? ` · ${feed.posts.length}` : ''}`} active={tab === 'team'} onPress={() => setTab('team')} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([loadMine(), loadFeed(feedDay)]); setRefreshing(false); }} />}
      >
        {!!error && <EmptyHero icon="alert-circle" title="Could not load" message={error} />}
        {!today && !error && tab === 'mine' && <SkeletonList count={2} type="notification" />}

        {tab === 'mine' && today && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{formatDayHeader(today.day)}</Text>
              {posted ? (
                <View style={styles.postedPill}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.brand[600]} />
                  <Text style={styles.postedText}>Posted {timeOf(posted.updated_at || posted.created_at)}</Text>
                </View>
              ) : (
                <Text style={styles.hint}>Drafted from your work</Text>
              )}
            </View>
            {SECTIONS.map((s) => <Section key={s.key} def={s} items={lists[s.key]} onChange={edit(s.key)} />)}
            <TextInput
              value={note}
              onChangeText={(v) => { setNote(v); setDirty(true); }}
              placeholder="Anything else? (optional)"
              placeholderTextColor={colors.gray[400]}
              multiline
              style={styles.note}
            />
            <AnimatedPressable
              onPress={post}
              disabled={saving || empty || (posted && !dirty)}
              haptic="medium"
              style={[styles.postBtn, (saving || empty || (posted && !dirty)) && { opacity: 0.45 }]}
            >
              <Ionicons name={posted ? 'refresh' : 'send'} size={17} color="#fff" />
              <Text style={styles.postText}>{saving ? 'Posting...' : posted ? (dirty ? 'Update stand-up' : 'Posted') : 'Post stand-up'}</Text>
            </AnimatedPressable>
            {!!posted && (
              <AnimatedPressable onPress={takeBack} style={{ alignSelf: 'center', padding: 4 }}>
                <Text style={styles.takeBack}>Take it back</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {tab === 'team' && (
          <View>
            <View style={styles.dayNav}>
              <AnimatedPressable style={styles.navIcon} onPress={() => loadFeed(addDays(feedDay, -1))} accessibilityLabel="Previous day">
                <Ionicons name="chevron-back" size={18} color={colors.gray[600]} />
              </AnimatedPressable>
              <Text style={styles.dayTitle}>{feedDay ? formatDayHeader(feedDay) : ''}</Text>
              <AnimatedPressable style={styles.navIcon} onPress={() => loadFeed(addDays(feedDay, 1))} accessibilityLabel="Next day">
                <Ionicons name="chevron-forward" size={18} color={colors.gray[600]} />
              </AnimatedPressable>
            </View>
            {!feed && !error && <SkeletonList count={3} type="notification" />}
            {feed?.can_see_missing && feed.missing.length > 0 && (
              <View style={[styles.card, { marginTop: 0 }]}>
                <Text style={styles.cardTitle}>Not posted yet · {feed.missing.length}</Text>
                {feed.missing.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Avatar name={p.name} uri={p.profile_picture} size={28} />
                    <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.gray[800] }} numberOfLines={1}>{p.name}</Text>
                    {feedDay === today?.day && (
                      <AnimatedPressable onPress={() => nudge(p)} style={styles.nudge}>
                        <Ionicons name="alarm-outline" size={14} color={colors.brand[600]} />
                        <Text style={styles.nudgeText}>Remind</Text>
                      </AnimatedPressable>
                    )}
                  </View>
                ))}
              </View>
            )}
            {feed?.posts.map((p) => <PostCard key={p.id} post={p} />)}
            {feed && !feed.posts.length && (
              <EmptyHero icon="people" title={feed.weekend ? 'A day off' : 'No stand-ups yet'} message="Stand-ups from the people you work with show up here as they are posted." />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.lg,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: fontSize.xs, color: colors.gray[500] },
  postedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: colors.brand[50] },
  postedText: { fontSize: 11, fontWeight: '800', color: colors.brand[700] },
  note: { minHeight: 56, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.gray[100], fontSize: fontSize.sm, color: colors.gray[900], outlineStyle: 'none', textAlignVertical: 'top' },
  postBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.lg, backgroundColor: colors.brand[600] },
  postText: { fontSize: fontSize.base, fontWeight: '800', color: '#fff' },
  takeBack: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingBottom: spacing.sm },
  dayTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900], minWidth: 150, textAlign: 'center' },
  navIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: colors.brand[50] },
  nudgeText: { fontSize: 11, fontWeight: '800', color: colors.brand[700] },
});
