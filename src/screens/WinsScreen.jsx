import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
import BadgeMedal from '../components/engage/BadgeMedal';
import KudosSheet from '../components/engage/KudosSheet';
import { parseYmd, WEEKDAYS_SHORT, MONTHS_SHORT, timeAgo } from '../utils/dates';
import { openNotificationTarget } from '../navigation/navigationRef';

const FAMILY_TITLE = { tasks: 'Finishing', streak: 'Streaks', clean_month: 'On time', kudos: 'Thanks' };

const rangeText = (a, b) => {
  const x = parseYmd(a); const y = parseYmd(b);
  return x.getMonth() === y.getMonth()
    ? `${x.getDate()} – ${y.getDate()} ${MONTHS_SHORT[y.getMonth()]}`
    : `${x.getDate()} ${MONTHS_SHORT[x.getMonth()]} – ${y.getDate()} ${MONTHS_SHORT[y.getMonth()]}`;
};

function Stat({ icon, value, label }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, minWidth: 90, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 2 }}>
      <Ionicons name={icon} size={16} color={colors.brand[600]} />
      <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.gray[500], fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Bar({ label, value, max, right }) {
  const colors = useColors();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[700] }}>{right ?? value}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
        <View style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%`, height: 7, backgroundColor: colors.brand[500] }} />
      </View>
    </View>
  );
}

function WeekTab({ week, setWeek, data, onCheer }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!data) return <SkeletonList count={3} type="notification" />;
  const maxDay = Math.max(1, ...data.days.map((d) => d.count));
  const maxBiz = Math.max(1, ...data.businesses.map((b) => b.count));
  const maxTop = Math.max(1, ...data.top.map((p) => p.count));
  return (
    <View>
      <View style={styles.weekNav}>
        <AnimatedPressable style={styles.navIcon} onPress={() => setWeek(week + 1)} accessibilityLabel="Previous week">
          <Ionicons name="chevron-back" size={18} color={colors.gray[600]} />
        </AnimatedPressable>
        <Text style={styles.weekTitle}>{week === 0 ? 'This week' : week === 1 ? 'Last week' : `${week} weeks ago`} · {rangeText(data.week_start, data.week_end)}</Text>
        <AnimatedPressable style={[styles.navIcon, week === 0 && { opacity: 0.3 }]} disabled={week === 0} onPress={() => setWeek(week - 1)} accessibilityLabel="Next week">
          <Ionicons name="chevron-forward" size={18} color={colors.gray[600]} />
        </AnimatedPressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroNum}>{data.totals.done}</Text>
        <Text style={styles.heroLabel}>tasks finished across the company</Text>
        <View style={styles.bars}>
          {data.days.map((d) => {
            const dt = parseYmd(d.day);
            return (
              <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ height: 54, justifyContent: 'flex-end' }}>
                  <View style={{ width: 16, height: d.count ? Math.max(6, (d.count / maxDay) * 54) : 3, borderRadius: 4, backgroundColor: d.count ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)' }} />
                </View>
                <Text style={styles.barLabel}>{WEEKDAYS_SHORT[dt.getDay()][0]}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat icon="people" value={data.totals.people} label="people finished work" />
        <Stat icon="time" value={data.totals.on_time_pct == null ? '-' : `${data.totals.on_time_pct}%`} label="on time" />
        <Stat icon="heart" value={data.totals.kudos} label="kudos sent" />
      </View>

      {!data.totals.done && <EmptyHero icon="trophy" title="Nothing finished yet" message="Finished business work shows up here for everyone in the business to see." />}

      {data.top.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top finishers</Text>
          {data.top.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={p.name} uri={p.profile_picture} size={30} />
              <View style={{ flex: 1 }}><Bar label={p.name} value={p.count} max={maxTop} /></View>
            </View>
          ))}
        </View>
      )}

      {data.businesses.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By business</Text>
          {data.businesses.map((b) => <Bar key={b.id} label={b.name} value={b.count} max={maxBiz} />)}
        </View>
      )}

      {data.feed.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Just finished</Text>
          {data.feed.map((f) => (
            <View key={f.id} style={styles.feedRow}>
              <Avatar name={f.name} uri={f.profile_picture} size={30} />
              <AnimatedPressable style={{ flex: 1 }} onPress={() => f.todo_id && openNotificationTarget({ todoId: f.todo_id })} disabled={!f.todo_id}>
                <Text style={styles.feedTitle} numberOfLines={2}>{f.title}</Text>
                <Text style={styles.feedMeta} numberOfLines={1}>{f.name} · {f.business_name} · {timeAgo(f.at)}{f.on_time === false ? ' · late' : ''}</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.cheer} onPress={() => onCheer(f)} accessibilityLabel={`Say thanks to ${f.name}`}>
                <Ionicons name="heart-outline" size={15} color={colors.brand[600]} />
              </AnimatedPressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BadgesTab({ data }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [picked, setPicked] = useState(null);
  if (!data) return <SkeletonList count={3} type="notification" />;
  const families = [...new Set(data.badges.map((b) => b.family))];
  const earned = data.badges.filter((b) => b.earned).length;
  return (
    <View>
      <View style={styles.statsRow}>
        <Stat icon="ribbon" value={data.stats.total} label="tasks finished" />
        <Stat icon="flame" value={data.stats.currentStreak} label="day streak" />
        <Stat icon="trophy" value={`${earned}/${data.badges.length}`} label="badges" />
      </View>
      {families.map((fam) => (
        <View key={fam} style={styles.card}>
          <Text style={styles.cardTitle}>{FAMILY_TITLE[fam] || fam}</Text>
          <View style={styles.medals}>
            {data.badges.filter((b) => b.family === fam).map((b) => (
              <AnimatedPressable key={b.key} style={styles.medalCell} onPress={() => setPicked(picked === b.key ? null : b.key)} scale={0.96}>
                <BadgeMedal badge={b} size={58} />
                <Text style={[styles.medalName, !b.earned && { color: colors.gray[400] }]} numberOfLines={2}>{b.title}</Text>
              </AnimatedPressable>
            ))}
          </View>
          {data.badges.filter((b) => b.family === fam && b.key === picked).map((b) => (
            <View key={b.key} style={styles.detail}>
              <Text style={styles.detailText}>{b.description}</Text>
              {!b.earned && (
                <View style={{ gap: 4 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
                    <View style={{ width: `${(b.progress / b.target) * 100}%`, height: 6, backgroundColor: colors.brand[500] }} />
                  </View>
                  <Text style={styles.feedMeta}>{b.progress} of {b.target}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function WinsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('week');
  const [week, setWeek] = useState(0);
  const [wall, setWall] = useState(null);
  const [badges, setBadges] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cheer, setCheer] = useState(null);

  const loadWall = useCallback(async (w) => {
    try {
      setWall(null);
      const res = await api.get('/engage/wall', { params: { week: w }, __skipOops: true });
      setWall(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this week');
    }
  }, []);
  const loadBadges = useCallback(async () => {
    try {
      const res = await api.get('/engage/badges', { __skipOops: true });
      setBadges(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your badges');
    }
  }, []);

  useFocusEffect(useCallback(() => { loadWall(week); loadBadges(); }, [loadWall, loadBadges, week]));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Wins" style={styles.title} />
        <Text style={styles.subtitle}>What the company finished, and the milestones you have earned</Text>
      </View>
      <View style={styles.tabs}>
        <Chip icon="trophy" label="Done this week" active={tab === 'week'} onPress={() => setTab('week')} />
        <Chip icon="ribbon" label="My badges" active={tab === 'badges'} onPress={() => setTab('badges')} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([loadWall(week), loadBadges()]); setRefreshing(false); }} />}
      >
        {!!error && <EmptyHero icon="alert-circle" title="Could not load" message={error} />}
        {tab === 'week' ? <WeekTab week={week} setWeek={setWeek} data={wall} onCheer={(f) => setCheer({ id: f.user_id, name: f.name, profile_picture: f.profile_picture, todo_id: f.todo_id })} /> : <BadgesTab data={badges} />}
      </ScrollView>
      <KudosSheet visible={!!cheer} onClose={() => setCheer(null)} toUser={cheer ? { id: cheer.id, name: cheer.name, profile_picture: cheer.profile_picture } : null} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  navIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.xl, padding: spacing.xl, backgroundColor: colors.brand[600], gap: 2 },
  heroNum: { fontSize: 56, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  heroLabel: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  bars: { flexDirection: 'row', marginTop: spacing.lg },
  barLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.md },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  feedTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  feedMeta: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 },
  cheer: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[50] },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingTop: spacing.sm },
  medalCell: { width: 78, alignItems: 'center', gap: 8 },
  medalName: { fontSize: 11, fontWeight: '700', color: colors.gray[700], textAlign: 'center' },
  detail: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.gray[100], gap: spacing.sm },
  detailText: { fontSize: fontSize.sm, color: colors.gray[700] },
});
