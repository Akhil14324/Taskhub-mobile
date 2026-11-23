import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import SlidingSegment from '../SlidingSegment';
import { PriorityFlag, ProgressRing } from '../kit';
import { STATUS } from '../../utils/timeline';
import { formatDue } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import api from '../../api/client';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const TONE = {
  urgent: { icon: 'alert-circle', color: 'red' },
  warn: { icon: 'warning', color: 'yellow' },
  info: { icon: 'information-circle', color: 'brand' },
  good: { icon: 'checkmark-circle', color: 'green' },
};
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
/** "T Vinod Kumar" -> "Vinod": the first part of a name that is not an initial. */
const shortName = (name = '') => name.split(' ').find((p) => p.replace('.', '').length > 1) || name;
const ACTIVITY_ICON ={ question: 'chatbubble-ellipses-outline', action: 'checkmark-done-outline', suggestions: 'bulb-outline', report: 'document-text-outline' };

/** A section card with a title row. */
function Card({ title, icon, right, children, styles, colors, style }) {
  return (
    <View {...glass('card')} style={[styles.card, style]}>
      {!!title && (
        <View style={styles.cardHead}>
          {!!icon && <Ionicons name={icon} size={16} color={colors.brand[600]} />}
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={{ flex: 1 }} />
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/** One to-do in a list: title, then date, person, status and progress. Tapping opens it. */
function TaskLine({ t, why, onOpen, styles, colors, showPerson }) {
  const st = STATUS[t.status] || STATUS.todo;
  const date = t.deadline_date || t.due_date;
  return (
    <AnimatedPressable onPress={() => onOpen(t.id)} style={styles.line} accessibilityLabel={`Open ${t.title}`}>
      <PriorityFlag priority={t.priority} size={13} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lineTitle} numberOfLines={1}>{t.title}</Text>
        <View style={styles.lineMeta}>
          {!!date && <Text style={styles.metaText}>{formatDue(date)}</Text>}
          {showPerson && !!t[showPerson] && <Text style={styles.metaText} numberOfLines={1}>· {shortName(t[showPerson])}</Text>}
          <Text style={styles.metaText}>· {st.label}</Text>
          {t.steps ? <Text style={styles.metaText}>· {t.progress}%</Text> : null}
          {t.updated_days_ago >= 3 && t.status !== 'done' && <Text style={[styles.metaText, { color: colors.yellow[600] }]}>· no update {t.updated_days_ago}d</Text>}
        </View>
        {!!why && <Text style={styles.why} numberOfLines={2}>{why}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.gray[300]} />
    </AnimatedPressable>
  );
}

/**
 * The AI Assistant dashboard. The numbers, lists and insights come from GET /assistant/overview (the person's
 * real to-dos, no AI); the suggestions and report summaries come from GPT on the server, checked against the
 * same to-dos. `onOpen(id)` opens a to-do, `onAsk(text)` puts a question in the chat. Bump `refreshKey` to reload.
 */
export default function AssistantDashboard({ name, onOpen, onAsk, refreshKey = 0, wide }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ov, setOv] = useState(null);
  const [ovError, setOvError] = useState(null);
  const [sug, setSug] = useState({ data: null, loading: false, error: null });
  const [period, setPeriod] = useState('day');
  const [report, setReport] = useState({ day: null, week: null });
  const [summary, setSummary] = useState({ day: null, week: null, loading: false, error: null });
  const [activity, setActivity] = useState([]);
  const loading = useRef(false);
  const sugAsked = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return; // no duplicate requests while one is on its way
    loading.current = true;
    try {
      const [o, a, d, w] = await Promise.all([
        api.get('/assistant/overview', { __skipOops: true }),
        api.get('/assistant/activity', { __skipOops: true }).catch(() => ({ data: { activity: [] } })),
        api.get('/assistant/report', { params: { period: 'day' }, __skipOops: true }).catch(() => ({ data: null })),
        api.get('/assistant/report', { params: { period: 'week' }, __skipOops: true }).catch(() => ({ data: null })),
      ]);
      setOv(o.data);
      setOvError(null);
      setActivity(a.data.activity || []);
      setReport({ day: d.data, week: w.data });
    } catch (err) {
      setOvError(err.response?.data?.error || 'Could not load your overview.');
    } finally {
      loading.current = false;
    }
  }, []);

  const loadSuggestions = useCallback(async (force = false) => {
    setSug((s) => (s.loading ? s : { ...s, loading: true, error: null }));
    try {
      const res = await api.post('/assistant/suggestions', { force }, { timeout: 90000, __skipOops: true });
      setSug({ data: res.data, loading: false, error: null });
      if (force) load();
    } catch (err) {
      setSug({ data: null, loading: false, error: err.response?.data?.error || 'The AI could not make suggestions right now. Try again.' });
    }
  }, [load]);

  const loadSummary = async () => {
    setSummary((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.post('/assistant/report/summary', { period }, { timeout: 90000, __skipOops: true });
      setSummary((s) => ({ ...s, [period]: res.data, loading: false }));
      load();
    } catch (err) {
      setSummary((s) => ({ ...s, loading: false, error: err.response?.data?.error || 'Could not write the summary. Try again.' }));
    }
  };

  useEffect(() => { load(); }, [load, refreshKey]);
  // Suggestions are asked for once the overview says AI is on (the server keeps them a while, so this is cheap).
  useEffect(() => {
    if (ov?.ai && !sugAsked.current) { sugAsked.current = true; loadSuggestions(false); }
  }, [ov?.ai, loadSuggestions]);

  const applyPriority = async (p) => {
    const ok = await confirmDialog({ title: 'Change the priority?', message: `Set "${p.title}" from priority ${p.from} to priority ${p.priority}.`, confirmLabel: 'Change it' });
    if (!ok) return;
    try {
      const res = await api.post('/assistant/execute', { actions: [{ tool: 'set_priority', args: { id: p.id, priority: p.priority } }] });
      const r = res.data.results[0];
      showToast({ message: r.message, tone: r.ok ? 'success' : 'error' });
      if (r.ok) {
        setSug((s) => ({ ...s, data: { ...s.data, priority_changes: s.data.priority_changes.filter((x) => x.id !== p.id) } }));
        load();
      }
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change it', tone: 'error' });
    }
  };

  if (!ov) {
    return (
      <View style={styles.center}>
        {ovError ? (
          <>
            <Ionicons name="cloud-offline-outline" size={30} color={colors.gray[400]} />
            <Text style={styles.muted}>{ovError}</Text>
            <AnimatedPressable onPress={load} style={styles.smallBtn}><Text style={styles.smallBtnText}>Try again</Text></AnimatedPressable>
          </>
        ) : <ActivityIndicator color={colors.brand[600]} />}
      </View>
    );
  }

  const c = ov.counts;
  const first = (name || ov.name || '').split(' ')[0];
  const lineProps = { onOpen, styles, colors };
  const s = sug.data;
  const rep = report[period];
  const sum = summary[period];
  const tile = (label, value, icon, tone, onPress) => (
    <AnimatedPressable key={label} onPress={onPress} {...glass('card')} style={styles.tile} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.tileIcon, { backgroundColor: colors[tone][50] }]}><Ionicons name={icon} size={17} color={colors[tone][600]} /></View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </AnimatedPressable>
  );

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Welcome */}
      <View style={styles.welcome}>
        <View style={styles.welcomeIcon}><Ionicons name="sparkles" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{greeting()}, {first}</Text>
          <Text style={styles.welcomeSub}>
            {s?.headline || (c.due_today || c.overdue
              ? `You have ${c.due_today} to-do${c.due_today === 1 ? '' : 's'} due today${c.overdue ? ` and ${c.overdue} overdue` : ''}.`
              : c.pending ? `Nothing is due today. ${c.pending} to-do${c.pending === 1 ? ' is' : 's are'} open.` : 'Your list is clear.')}
          </Text>
        </View>
      </View>

      {/* Daily overview */}
      <View style={styles.tiles}>
        {tile('Due today', c.due_today, 'today-outline', 'brand', () => onAsk('What should I do today?'))}
        {tile('Pending', c.pending, 'list-outline', 'yellow', () => onAsk('Show my pending tasks'))}
        {tile('Completed today', c.completed_today, 'checkmark-done-outline', 'green', () => onAsk('Summarize my progress today'))}
        {tile('Overdue', c.overdue, 'alert-circle-outline', 'red', () => onAsk('Show my overdue tasks'))}
      </View>
      <View style={styles.chips}>
        {[
          ['Assigned to me', c.assigned_to_me, 'Show tasks assigned to me'],
          ['Assigned by me', c.assigned_by_me, 'Show tasks I assigned to others'],
          ['Waiting on others', c.waiting_on_others, 'Which of my tasks are waiting on other people?'],
          ['Not updated', c.stale, 'Find tasks I haven\'t updated'],
          ['No date', c.no_date, 'Which tasks have no deadline?'],
        ].map(([label, n, q]) => (
          <AnimatedPressable key={label} onPress={() => onAsk(q)} style={styles.chip}>
            <Text style={styles.chipNum}>{n}</Text>
            <Text style={styles.chipLabel}>{label}</Text>
          </AnimatedPressable>
        ))}
      </View>

      <View style={[styles.cols, wide && styles.colsWide]}>
        {/* Proactive insights: rule-based, from the data only */}
        <Card title="Needs your attention" icon="notifications-outline" styles={styles} colors={colors} style={wide && styles.col}>
          {ov.insights.length === 0 && <Text style={styles.muted}>Nothing stands out right now. Deadlines, overdue work, clashes and stalled tasks show up here.</Text>}
          {ov.insights.map((i, k) => {
            const tone = TONE[i.tone] || TONE.info;
            return (
              <AnimatedPressable key={k} style={styles.insight} onPress={() => (i.todo_ids.length ? onOpen(i.todo_ids[0]) : undefined)} disabled={!i.todo_ids.length}>
                <Ionicons name={tone.icon} size={17} color={colors[tone.color][600]} />
                <Text style={styles.insightText}>{i.text}</Text>
              </AnimatedPressable>
            );
          })}
        </Card>

        {/* AI suggestions and recommended next actions */}
        <Card
          title="AI suggestions"
          icon="bulb-outline"
          styles={styles}
          colors={colors}
          style={wide && styles.col}
          right={ov.ai && (
            <AnimatedPressable onPress={() => loadSuggestions(true)} disabled={sug.loading} style={styles.iconBtn} accessibilityLabel="Refresh suggestions">
              {sug.loading ? <ActivityIndicator size="small" color={colors.brand[600]} /> : <Ionicons name="refresh" size={16} color={colors.gray[500]} />}
            </AnimatedPressable>
          )}
        >
          {!ov.ai && <Text style={styles.muted}>AI suggestions are not switched on yet. The owner needs to add the OpenAI key on the server.</Text>}
          {ov.ai && sug.loading && !s && <Text style={styles.muted}>Looking at your to-dos…</Text>}
          {!!sug.error && (
            <View style={{ gap: 6 }}>
              <Text style={[styles.muted, { color: colors.red[600] }]}>{sug.error}</Text>
              <AnimatedPressable onPress={() => loadSuggestions(true)} style={styles.smallBtn}><Text style={styles.smallBtnText}>Try again</Text></AnimatedPressable>
            </View>
          )}
          {s?.empty && <Text style={styles.muted}>{s.headline}</Text>}
          {s && !s.empty && (
            <View style={{ gap: spacing.md }}>
              {!!s.do_today?.length && (
                <View>
                  <Text style={styles.sub}>Recommended next actions</Text>
                  {s.do_today.map((x, k) => {
                    const t = findTodo(ov, x.id) || { id: x.id, title: x.title, priority: 4, status: 'todo' };
                    return (
                      <View key={x.id} style={styles.stepRow}>
                        <Text style={styles.stepNum}>{k + 1}</Text>
                        <View style={{ flex: 1 }}><TaskLine t={t} why={x.why} {...lineProps} /></View>
                      </View>
                    );
                  })}
                </View>
              )}
              {[
                ['Most important', s.most_important],
                ['Needs immediate attention', s.needs_attention],
                ['Finish before the deadline', s.before_deadline],
                ['Taking longer than expected', s.running_long],
                ['Can wait', s.can_postpone],
              ].filter(([, l]) => l?.length).map(([label, list]) => (
                <View key={label}>
                  <Text style={styles.sub}>{label}</Text>
                  {list.map((x) => <TaskLine key={x.id} t={findTodo(ov, x.id) || { id: x.id, title: x.title, priority: 4, status: 'todo' }} why={x.why} {...lineProps} />)}
                </View>
              ))}
              {!!s.priority_changes?.length && (
                <View>
                  <Text style={styles.sub}>Suggested priority changes</Text>
                  {s.priority_changes.map((p) => (
                    <View key={p.id} style={styles.prioRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lineTitle} numberOfLines={1}>{p.title}</Text>
                        <Text style={styles.why}>P{p.from} → P{p.priority} · {p.why}</Text>
                      </View>
                      <AnimatedPressable onPress={() => applyPriority(p)} style={styles.smallBtn}><Text style={styles.smallBtnText}>Apply</Text></AnimatedPressable>
                    </View>
                  ))}
                </View>
              )}
              {[['Organise your workload', s.organize, 'git-network-outline'], ['Productivity coach', s.coach, 'fitness-outline']].filter(([, l]) => l?.length).map(([label, list, icon]) => (
                <View key={label}>
                  <Text style={styles.sub}>{label}</Text>
                  {list.map((tip, k) => (
                    <View key={k} style={styles.tip}>
                      <Ionicons name={icon} size={14} color={colors.brand[600]} />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              ))}
              {!!s.generated_at && <Text style={styles.foot}>Made {ago(s.generated_at)}{s.cached ? ' (saved)' : ''} from your current to-dos.</Text>}
            </View>
          )}
        </Card>

        {/* Deadlines */}
        <Card title="Upcoming deadlines" icon="calendar-outline" styles={styles} colors={colors} style={wide && styles.col}>
          {!ov.upcoming.length && !ov.overdue.length && <Text style={styles.muted}>Nothing due in the next 7 days.</Text>}
          {ov.overdue.slice(0, 3).map((t) => <TaskLine key={`o${t.id}`} t={t} why="Overdue" {...lineProps} />)}
          {ov.upcoming.map((t) => <TaskLine key={t.id} t={t} {...lineProps} />)}
          {ov.conflicts.map((cf) => (
            <View key={cf.day} style={styles.tip}>
              <Ionicons name="git-compare-outline" size={14} color={colors.yellow[600]} />
              <Text style={styles.tipText}>{cf.count} to-dos land on {formatDue(cf.day)}. Consider moving one.</Text>
            </View>
          ))}
        </Card>

        {/* Team and assignments */}
        <Card title="Team and assignments" icon="people-outline" styles={styles} colors={colors} style={wide && styles.col}>
          <Text style={styles.sub}>Assigned to me · {c.assigned_to_me}</Text>
          {ov.assigned_to_me.length ? ov.assigned_to_me.slice(0, 4).map((t) => <TaskLine key={t.id} t={t} showPerson="created_by" {...lineProps} />) : <Text style={styles.muted}>Nothing open was given to you.</Text>}
          <Text style={[styles.sub, { marginTop: spacing.sm }]}>Assigned by me · {c.assigned_by_me}</Text>
          {ov.assigned_by_me.length ? ov.assigned_by_me.slice(0, 4).map((t) => <TaskLine key={t.id} t={t} showPerson="assignee" {...lineProps} />) : <Text style={styles.muted}>You have not given out open work.</Text>}
          {ov.team_overdue.length > 0 && (
            <>
              <Text style={[styles.sub, { marginTop: spacing.sm }]}>Overdue in the team · {c.team_overdue}</Text>
              {ov.team_overdue.slice(0, 4).map((t) => <TaskLine key={t.id} t={t} showPerson="assignee" {...lineProps} />)}
            </>
          )}
          {ov.workload.people.length > 1 && (
            <>
              <Text style={[styles.sub, { marginTop: spacing.sm }]}>Workload (open to-dos)</Text>
              {ov.workload.people.slice(0, 8).map((p) => {
                const max = Math.max(...ov.workload.people.map((x) => x.open), 1);
                return (
                  <View key={p.id} style={styles.loadRow}>
                    <Text style={styles.loadName} numberOfLines={1}>{p.is_me ? 'You' : shortName(p.name)}</Text>
                    <View style={styles.loadTrack}>
                      <View style={[styles.loadFill, { width: `${(p.open / max) * 100}%`, backgroundColor: p.overloaded ? colors.red[500] : colors.brand[500] }]} />
                    </View>
                    <Text style={styles.loadNum}>{p.open}{p.overdue ? ` · ${p.overdue} late` : ''}</Text>
                  </View>
                );
              })}
              {ov.workload.uneven && <Text style={[styles.why, { marginTop: 4 }]}>Work is uneven: {ov.workload.people.filter((p) => p.overloaded).map((p) => shortName(p.name)).join(', ')} {ov.workload.people.filter((p) => p.overloaded).length === 1 ? 'carries' : 'carry'} much more than others.</Text>}
              <AnimatedPressable onPress={() => onAsk('How should I distribute the team workload?')} style={[styles.smallBtn, { alignSelf: 'flex-start', marginTop: spacing.sm }]}>
                <Text style={styles.smallBtnText}>Ask how to share the work</Text>
              </AnimatedPressable>
            </>
          )}
        </Card>

        {/* Reports */}
        <Card title="Reports" icon="stats-chart-outline" styles={styles} colors={colors} style={wide && styles.col}>
          <SlidingSegment
            style={styles.segment}
            pillStyle={{ top: 3, bottom: 3, borderRadius: radius.md }}
            value={period}
            items={[['day', 'Daily'], ['week', 'Weekly']].map(([key, label]) => ({
              key,
              style: { flex: 1 },
              content: (
                <AnimatedPressable style={styles.segBtn} onPress={() => setPeriod(key)} accessibilityRole="tab" accessibilityState={{ selected: period === key }}>
                  <Text style={[styles.segText, period === key && styles.segTextOn]}>{label}</Text>
                </AnimatedPressable>
              ),
            }))}
          />
          {!rep && <Text style={styles.muted}>The report could not be loaded.</Text>}
          {rep && period === 'day' && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.repNums}>
                <Num label="Completed today" value={rep.completed} styles={styles} />
                <Num label="Still due" value={rep.pending} styles={styles} />
                <Num label="Delayed" value={rep.delayed.length} styles={styles} />
              </View>
              {!!rep.tomorrow.length && <Text style={styles.sub}>Important for tomorrow</Text>}
              {rep.tomorrow.slice(0, 4).map((t) => <TaskLine key={t.id} t={t} {...lineProps} />)}
              {!!rep.delayed.length && <Text style={styles.sub}>Delayed</Text>}
              {rep.delayed.slice(0, 3).map((t) => <TaskLine key={t.id} t={t} {...lineProps} />)}
            </View>
          )}
          {rep && period === 'week' && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.repNums}>
                <Num label="Completed" value={rep.completed} styles={styles} />
                <Num label="Pending" value={rep.pending} styles={styles} />
                <View style={styles.num}>
                  <ProgressRing percent={rep.progress_pct || 0} size={42} stroke={4} color={colors.brand[600]}>
                    <Text style={styles.ringText}>{rep.progress_pct == null ? '–' : `${rep.progress_pct}%`}</Text>
                  </ProgressRing>
                  <Text style={styles.numLabel}>Progress</Text>
                </View>
              </View>
              <View style={styles.bars}>
                {rep.per_day.map((d) => {
                  const max = Math.max(...rep.per_day.map((x) => x.completed), 1);
                  return (
                    <View key={d.day} style={styles.barCol} accessibilityLabel={`${d.day}: ${d.completed} completed`}>
                      <View style={styles.barTrack}><View style={[styles.barFill, { height: `${(d.completed / max) * 100}%` }]} /></View>
                      <Text style={styles.barLabel}>{new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.why}>
                {rep.trend === 'up' ? `Up from ${rep.previous_week_completed} the week before.` : rep.trend === 'down' ? `Down from ${rep.previous_week_completed} the week before.` : `Same as the week before (${rep.previous_week_completed}).`}
              </Text>
              {!!rep.accomplishments.length && <Text style={styles.sub}>Major accomplishments</Text>}
              {rep.accomplishments.slice(0, 4).map((t) => <TaskLine key={t.id} t={t} {...lineProps} />)}
            </View>
          )}
          {ov.ai && (
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {sum ? (
                <View style={styles.summary}>
                  <Text style={styles.summaryText}>{sum.summary}</Text>
                  {sum.highlights.map((h, k) => <Text key={`h${k}`} style={styles.tipText}>• {h}</Text>)}
                  {!!sum.recommendations.length && <Text style={[styles.sub, { marginTop: 4 }]}>{period === 'week' ? 'For next week' : 'For tomorrow'}</Text>}
                  {sum.recommendations.map((h, k) => <Text key={`r${k}`} style={styles.tipText}>• {h}</Text>)}
                </View>
              ) : (
                <AnimatedPressable onPress={loadSummary} disabled={summary.loading} style={[styles.smallBtn, { alignSelf: 'flex-start' }]}>
                  {summary.loading ? <ActivityIndicator size="small" color={colors.brand[700]} /> : <Text style={styles.smallBtnText}>Write an AI summary</Text>}
                </AnimatedPressable>
              )}
              {!!summary.error && <Text style={[styles.why, { color: colors.red[600] }]}>{summary.error}</Text>}
            </View>
          )}
        </Card>

        {/* Recent AI activity */}
        <Card title="Recent AI activity" icon="time-outline" styles={styles} colors={colors} style={wide && styles.col}>
          {!activity.length && <Text style={styles.muted}>Questions you ask, suggestions and reports, and changes you confirm show up here.</Text>}
          {activity.slice(0, 8).map((a) => (
            <View key={a.id} style={styles.tip}>
              <Ionicons name={ACTIVITY_ICON[a.kind] || 'ellipse-outline'} size={14} color={colors.gray[500]} />
              <Text style={[styles.tipText, { flex: 1 }]} numberOfLines={2}>{a.summary}</Text>
              <Text style={styles.metaText}>{ago(a.created_at)}</Text>
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
}

function Num({ label, value, styles }) {
  return (
    <View style={styles.num}>
      <Text style={styles.numValue}>{value}</Text>
      <Text style={styles.numLabel}>{label}</Text>
    </View>
  );
}

/** The overview's own copy of a to-do (status, date, progress), when it has one. */
function findTodo(ov, id) {
  for (const key of ['due_today', 'overdue', 'upcoming', 'stale', 'assigned_to_me', 'assigned_by_me', 'waiting_on_others', 'team_overdue']) {
    const t = (ov[key] || []).find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

const createStyles = (colors) => StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 60 },
  muted: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 18 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  welcomeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  welcomeSub: { fontSize: fontSize.base, color: colors.gray[600], marginTop: 2, lineHeight: 20 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 140, borderRadius: radius.xl, padding: spacing.md, gap: 4 },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], marginTop: 4 },
  tileLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[500] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.gray[100] },
  chipNum: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] },
  chipLabel: { fontSize: fontSize.sm, color: colors.gray[600] },
  cols: { gap: spacing.lg },
  colsWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  col: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  card: { borderRadius: radius.xl, padding: spacing.md, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  insight: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 6 },
  insightText: { flex: 1, fontSize: fontSize.base, color: colors.gray[800], lineHeight: 20 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 4, borderRadius: radius.lg },
  lineTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  lineMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 1 },
  metaText: { fontSize: fontSize.sm, color: colors.gray[500] },
  why: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 2, lineHeight: 17 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand[100], color: colors.brand[700], fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 20 },
  prioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  tip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 },
  tipText: { fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 18, flexShrink: 1 },
  foot: { fontSize: 11, color: colors.gray[400] },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.brand[50], borderWidth: 1, borderColor: colors.brand[100], alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  smallBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  loadName: { width: 80, fontSize: fontSize.sm, color: colors.gray[700] },
  loadTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray[100], overflow: 'hidden' },
  loadFill: { height: 8, borderRadius: 4 },
  loadNum: { minWidth: 64, fontSize: fontSize.sm, color: colors.gray[500], textAlign: 'right' },
  segment: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.lg, backgroundColor: colors.gray[100], marginBottom: spacing.sm },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: radius.md },
  segText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[500] },
  segTextOn: { color: colors.brand[700], fontWeight: '700' },
  repNums: { flexDirection: 'row', gap: spacing.sm },
  num: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: radius.lg, backgroundColor: colors.gray[50] },
  numValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  numLabel: { fontSize: 11, color: colors.gray[500], textAlign: 'center' },
  ringText: { fontSize: 11, fontWeight: '800', color: colors.gray[900] },
  bars: { flexDirection: 'row', gap: 6, height: 70, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 3, height: '100%' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', borderRadius: 4, backgroundColor: colors.gray[100], overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: colors.brand[500], borderRadius: 4 },
  barLabel: { fontSize: 10, color: colors.gray[500] },
  summary: { gap: 4, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.brand[50] },
  summaryText: { fontSize: fontSize.base, color: colors.gray[900], lineHeight: 20 },
});
