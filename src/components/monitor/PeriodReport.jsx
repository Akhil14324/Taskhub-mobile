import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { glass } from '../../theme/glass';
import { EmptyHero } from '../kit';
import { longDate } from './DateFilterBar';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const rangeParams = (value) => (value.preset === 'custom' ? { preset: 'custom', from: value.from, to: value.to } : { preset: value.preset });

function Stat({ label, value, hint, tone }) {
  const colors = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: 150, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.md, gap: 2 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tone || colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] }}>{label}</Text>
      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{hint}</Text>
    </View>
  );
}

function DaySection({ d, today }) {
  const colors = useColors();
  const rel = d.day === today ? ' – Today' : d.day === shiftYmd(today, -1) ? ' – Yesterday' : '';
  return (
    <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: d.day === today ? colors.brand[200] : colors.gray[200] }}>
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: d.day === today ? colors.brand[50] : colors.gray[50], borderBottomWidth: 1, borderColor: colors.gray[200] }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }}>{longDate(d.day)}{rel}</Text>
      </View>
      <View style={{ padding: spacing.md, gap: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.green[700] }}>Tasks completed: <Text style={{ fontWeight: '700' }}>{d.completed}</Text></Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.gray[800] }}>Tasks pending: <Text style={{ fontWeight: '700' }}>{d.pending}</Text></Text>
          <Text style={{ fontSize: fontSize.sm, color: d.overdue ? colors.red[600] : colors.gray[800] }}>Tasks overdue: <Text style={{ fontWeight: '700' }}>{d.overdue}</Text></Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.gray[500] }}>Created {d.created} · Assigned {d.assigned} · Due {d.due}. Pending and overdue are counted at the end of this day.</Text>
        {d.activity.length > 0 ? (
          <View style={{ marginTop: 6, gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase' }}>Team activity</Text>
            {d.activity.map((e) => (
              <Text key={e.id} style={{ fontSize: fontSize.sm, color: colors.gray[800] }}>
                <Text style={{ fontWeight: '600' }}>{e.person || 'Someone'}</Text> · {e.text}
              </Text>
            ))}
            {d.activity_more > 0 && <Text style={{ fontSize: 12, color: colors.gray[500] }}>and {d.activity_more} more updates</Text>}
          </View>
        ) : <Text style={{ fontSize: fontSize.sm, color: colors.gray[400], marginTop: 4 }}>No updates on this day.</Text>}
      </View>
    </View>
  );
}

function shiftYmd(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The selected period, in numbers and day by day. Every number is for the chosen days only (the "right now" tiles
 * of the screen are labelled separately). `personId` narrows everything to one member; the day sections are paged.
 */
export default function PeriodReport({ value, personId, people, onResolved }) {
  const colors = useColors();
  const [data, setData] = useState(null);
  const [days, setDays] = useState([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify([value, personId]);

  const fetchPage = useCallback(async (pg, replace) => {
    setLoading(true);
    try {
      const res = await api.get('/monitor/report', { params: { ...rangeParams(value), person_id: personId || undefined, page: pg, limit: 14 }, __skipOops: true });
      setData(res.data);
      setDays((cur) => (replace ? res.data.days : [...cur, ...res.data.days]));
      setPage(pg);
      setError('');
      onResolved?.(res.data.period);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this period');
    } finally { setLoading(false); }
  }, [value, personId, onResolved]);

  // Any change of date or member reloads everything for the new selection.
  useEffect(() => { setDays([]); fetchPage(1, true); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = useMemo(() => new Map((people || []).map((p) => [p.id, p.name])), [people]);
  if (error) return <EmptyHero icon="alert-circle" title="Could not load this period" message={error} />;
  if (!data) return null;
  const { period, totals, pagination } = data;
  const who = personId ? (nameOf.get(personId) || 'this member') : 'the whole team';
  const nothing = !totals.created && !totals.assigned && !totals.completed && !totals.pending_end && days.every((d) => d.empty);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] }}>{period.label}: {period.from === period.to ? longDate(period.from) : `${longDate(period.from)} to ${longDate(period.to)}`}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.gray[600] }}>{plural(pagination.total_days, 'day')} · showing {who}. Numbers below are for this period only.</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Stat label="Tasks created" value={totals.created} hint="created in this period" />
        <Stat label="Tasks assigned" value={totals.assigned} hint="assigned in this period" />
        <Stat label="Tasks completed" value={totals.completed} hint="finished in this period" tone={colors.green[600]} />
        <Stat label="Pending at the end" value={totals.pending_end} hint={`still open on ${longDate(period.to)}`} />
        <Stat label="Overdue at the end" value={totals.overdue_end} hint={`open and past due on ${longDate(period.to)}`} tone={totals.overdue_end ? colors.red[600] : undefined} />
        <Stat label="Completion" value={totals.completion_pct === null ? '–' : `${totals.completion_pct}%`} hint="completed ÷ (completed + pending at the end)" />
      </View>

      {!personId && data.people.length > 0 && (
        <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
          <Text style={{ padding: spacing.md, fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }}>Team member performance (this period)</Text>
          {[...data.people].sort((a, b) => b.completed - a.completed || a.user_id - b.user_id).map((p) => (
            <View key={p.user_id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.gray[200] }}>
              <Text numberOfLines={1} style={{ flexGrow: 1, flexBasis: 140, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[900] }}>{nameOf.get(p.user_id) || `Member ${p.user_id}`}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[700] }}>Created {p.created} · Assigned {p.assigned} · Completed {p.completed} · Pending {p.pending_end} · Overdue {p.overdue_end}</Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900], minWidth: 40, textAlign: 'right' }}>{p.completion_pct === null ? '–' : `${p.completion_pct}%`}</Text>
            </View>
          ))}
        </View>
      )}

      {nothing ? (
        <EmptyHero icon="calendar-outline" title="Nothing in this period" message={`No tasks were created, assigned or completed for ${who} from ${longDate(period.from)} to ${longDate(period.to)}. Try another date range.`} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {days.map((d) => <DaySection key={d.day} d={d} today={data.today} />)}
          {page < pagination.total_pages && (
            <AnimatedPressable onPress={() => fetchPage(page + 1, false)} disabled={loading} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <Text style={{ color: colors.brand[600], fontWeight: '700' }}>{loading ? 'Loading' : 'Show older days'}</Text>
            </AnimatedPressable>
          )}
        </View>
      )}
    </View>
  );
}
