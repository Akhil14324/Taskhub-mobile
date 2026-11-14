import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path, Circle } from 'react-native-svg';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import BottomSheet from '../BottomSheet';
import Chart from '../dashboard/Charts';
import { paletteHex } from './model';
import { showToast, confirmDialog } from '../../utils/events';
import { formatDue } from '../../utils/dates';
import {
  computeWidget, generateWidgets, cleanWidgets, dimensionsOf, numericColumns, AGGS, FILTERS, CHARTS,
} from '../../utils/boardDashboard';

// The Dashboard tab of a board: widgets worked out from the board's own columns, editable by hand or by asking the AI.
// The widget list is the view's `settings.widgets`, so it is saved with the tab like any other view setting.

const TYPES = [['number', 'Number', 'calculator-outline'], ['chart', 'Chart', 'bar-chart-outline'], ['table', 'Table', 'grid-outline'],
  ['progress', 'Progress', 'battery-half-outline'], ['list', 'List', 'list-outline'], ['text', 'Note', 'document-text-outline']];
const CHART_LABELS = { column: 'Column', bar: 'Bar', line: 'Line', smooth_line: 'Smooth line', stacked_column: 'Stacked column', stacked_bar: 'Stacked bar', pct_stacked_column: '100% stacked', pie: 'Pie', donut: 'Donut' };
const SIZES = ['S', 'M', 'L'];
const FALLBACK = ['blue', 'green', 'orange', 'purple', 'red', 'aquamarine', 'pink', 'yellow', 'indigo', 'grass'];

/** Pie and donut: one slice per category (all series added up). */
export function Pie({ data, donut, size = 190 }) {
  const colors = useColors();
  const cats = data.categories.map((c, i) => ({ ...c, v: data.series.reduce((n, s) => n + (s.values[i] || 0), 0) })).filter((c) => c.v > 0);
  const total = cats.reduce((n, c) => n + c.v, 0);
  if (!total) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>Nothing to show.</Text>;
  const r = size / 2 - 4;
  const c = size / 2;
  let a0 = -Math.PI / 2;
  const slices = cats.map((x, i) => {
    const frac = x.v / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (a, rr) => [c + rr * Math.cos(a), c + rr * Math.sin(a)];
    const [x0, y0] = p(a0, r);
    const [x1, y1] = p(Math.min(a1, a0 + Math.PI * 2 - 0.0001), r);
    const d = frac >= 0.9999 ? `M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}` : `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    a0 = a1;
    return { d, color: paletteHex(x.color || FALLBACK[i % FALLBACK.length]), label: x.label, v: x.v, pct: Math.round(frac * 100) };
  });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {slices.map((s, i) => <Path key={i} d={s.d} fill={s.color} stroke={colors.white} strokeWidth={1.5} />)}
        {donut && <Circle cx={c} cy={c} r={r * 0.58} fill={colors.white} />}
      </Svg>
      <View style={{ gap: 4, flexShrink: 1 }}>
        {slices.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[800], flexShrink: 1 }}>{s.label}</Text>
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>{s.v} · {s.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PivotTable({ data }) {
  const colors = useColors();
  if (!data.categories.length) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>Nothing to show.</Text>;
  const multi = data.series.length > 1;
  const cell = (t, w, bold) => <Text numberOfLines={1} style={{ width: w, fontSize: 13, fontWeight: bold ? '600' : '400', color: colors.gray[900], textAlign: bold ? 'left' : 'right' }}>{t}</Text>;
  return (
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
          <Text style={{ width: 140, fontSize: 12, fontWeight: '600', color: colors.gray[600] }}> </Text>
          {data.series.map((s) => <Text key={s.key} numberOfLines={1} style={{ width: 84, fontSize: 12, fontWeight: '600', color: colors.gray[600], textAlign: 'right' }}>{s.label}</Text>)}
          {multi && <Text style={{ width: 70, fontSize: 12, fontWeight: '600', color: colors.gray[600], textAlign: 'right' }}>Total</Text>}
        </View>
        {data.categories.map((c, i) => (
          <View key={c.key} style={{ flexDirection: 'row', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderColor: colors.gray[100] }}>
            {cell(c.label, 140, true)}
            {data.series.map((s) => <View key={s.key} style={{ width: 84 }}>{cell(s.values[i] || '', 84)}</View>)}
            {multi && cell(data.series.reduce((n, s) => n + (s.values[i] || 0), 0), 70)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function WidgetBody({ w, data, onOpenItem, height }) {
  const colors = useColors();
  if (data?.error) return <Text style={{ color: colors.red[600], fontSize: 13 }}>{data.error}</Text>;
  switch (w.type) {
    case 'number':
      return (
        <View style={{ paddingVertical: spacing.sm }}>
          <Text style={{ fontSize: 38, fontWeight: '700', color: colors.gray[900] }}>{Number(data.value).toLocaleString('en-IN')}{data.unit ? <Text style={{ fontSize: 16, color: colors.gray[500] }}> {data.unit}</Text> : null}</Text>
        </View>
      );
    case 'progress':
      return (
        <View style={{ gap: 8, paddingVertical: spacing.sm }}>
          <Text style={{ fontSize: 34, fontWeight: '700', color: colors.gray[900] }}>{data.percent}%</Text>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.gray[200] }}><View style={{ width: `${data.percent}%`, height: 10, borderRadius: 5, backgroundColor: '#00c875' }} /></View>
          <Text style={{ fontSize: 12, color: colors.gray[600] }}>{data.done} of {data.total} done</Text>
        </View>
      );
    case 'chart':
      return w.chart === 'pie' || w.chart === 'donut'
        ? <Pie data={data} donut={w.chart === 'donut'} />
        : <Chart data={data} type={w.chart || 'column'} height={height || 220} showLegend={data.series.length > 1} />;
    case 'table': return <PivotTable data={data} />;
    case 'list':
      if (!data.items.length) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>Nothing here.</Text>;
      return (
        <View style={{ gap: 2 }}>
          {data.items.map((t) => (
            <Pressable key={t.id} onPress={() => onOpenItem?.(t.id)} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.sm, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.gray[900] }}>{t.title}</Text>
              {!!t.due && <Text style={{ fontSize: 12, color: t.late ? colors.red[600] : colors.gray[500] }}>{formatDue(t.due)}</Text>}
            </Pressable>
          ))}
        </View>
      );
    case 'text': return <Text style={{ fontSize: 14, color: colors.gray[800], lineHeight: 20 }}>{data.text || 'Empty note'}</Text>;
    default: return null;
  }
}

/** A row of chips to pick one value ("none" allowed when `blank` is given). */
function Pick({ label, value, options, onChange, blank }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[600] }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {blank && <Chip active={!value} onPress={() => onChange(undefined)}>{blank}</Chip>}
        {options.map(([k, l]) => <Chip key={k} active={value === k} onPress={() => onChange(k)}>{l}</Chip>)}
      </View>
    </View>
  );
}
function Chip({ active, onPress, children }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: active ? BRAND : colors.gray[300], backgroundColor: active ? colors.brand[50] : 'transparent' }}>
      <Text style={{ fontSize: 13, color: active ? BRAND : colors.gray[800] }}>{children}</Text>
    </Pressable>
  );
}

function WidgetEditor({ widget, board, onChange, onClose, onDelete }) {
  const colors = useColors();
  const dims = dimensionsOf(board);
  const nums = numericColumns(board).map((c) => [String(c.id), c.title]);
  const set = (patch) => onChange({ ...widget, ...patch });
  const t = widget.type;
  return (
    <BottomSheet visible onClose={onClose} avoidKeyboard maxHeight={640}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.gray[900] }}>Edit widget</Text>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[600] }}>Title</Text>
          <TextInput value={widget.title} onChangeText={(v) => set({ title: v })} placeholder="Name this widget" placeholderTextColor={colors.gray[400]}
            style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.gray[900] }} />
        </View>
        <Pick label="Kind" value={t} options={TYPES.map(([k, l]) => [k, l])} onChange={(v) => set({ type: v })} />
        {['number', 'chart', 'table', 'list'].includes(t) && <Pick label="Which tasks" value={widget.filter || 'all'} options={FILTERS} onChange={(v) => set({ filter: v })} />}
        {t === 'chart' && <Pick label="Chart type" value={widget.chart || 'column'} options={CHARTS.map((k) => [k, CHART_LABELS[k]])} onChange={(v) => set({ chart: v })} />}
        {(t === 'chart' || t === 'table') && <Pick label={t === 'chart' ? 'Along the axis' : 'Rows'} value={widget.by || 'status'} options={dims} onChange={(v) => set({ by: v })} />}
        {(t === 'chart' || t === 'table') && <Pick label="Split by" value={widget.series} options={dims.filter((d) => d[0] !== widget.by)} blank="No split" onChange={(v) => set({ series: v })} />}
        {(t === 'number' || t === 'chart' || t === 'table') && !widget.formula && (
          <>
            <Pick label="Measure" value={widget.value} options={nums} blank="Count of tasks" onChange={(v) => set({ value: v })} />
            {!!widget.value && <Pick label="How to combine" value={widget.agg || 'sum'} options={AGGS} onChange={(v) => set({ agg: v })} />}
          </>
        )}
        {t === 'number' && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[600] }}>Or a formula (like Excel)</Text>
            <TextInput value={widget.formula || ''} onChangeText={(v) => set({ formula: v })} placeholder="SUM(Budget) / COUNT()" placeholderTextColor={colors.gray[400]} autoCapitalize="none" autoCorrect={false}
              style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.gray[900] }} />
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>COUNT(), OPEN(), DONE(), OVERDUE(), SUM(column), AVG(column), MIN(column), MAX(column), PERCENT(a, b), plus + - * / ( )</Text>
          </View>
        )}
        {t === 'text' && (
          <TextInput value={widget.text || ''} onChangeText={(v) => set({ text: v })} multiline placeholder="Write a note" placeholderTextColor={colors.gray[400]}
            style={{ minHeight: 90, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.gray[900], textAlignVertical: 'top' }} />
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Pressable onPress={onDelete} style={{ paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red[500] }}><Text style={{ color: colors.red[600], fontSize: 14 }}>Delete</Text></Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} style={{ paddingHorizontal: 20, paddingVertical: 11, borderRadius: radius.md, backgroundColor: BRAND }}><Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Done</Text></Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const GAP = 12;
const PANEL_H = 340;
// What a number means decides its colour and icon: late is red, finished is green, the rest take the accent.
const KPI_LOOK = {
  overdue: ['red', 'alert-circle-outline'], done: ['green', 'checkmark-done-outline'], this_week: ['amber', 'calendar-outline'],
  mine: ['purple', 'person-outline'], open: ['brand', 'albums-outline'], all: ['brand', 'layers-outline'],
};

/** One number of the strip: what it is, the number, and a line that puts it in context. */
function KpiTile({ w, data, desktop, editing, controls, total }) {
  const colors = useColors();
  const isProgress = w.type === 'progress';
  const [tone, icon] = isProgress ? ['green', 'pie-chart-outline'] : w.value || w.formula ? ['brand', 'stats-chart-outline'] : KPI_LOOK[w.filter || 'all'];
  const quiet = w.filter === 'overdue' && !data?.value; // nothing late: no alarm colour
  const hue = quiet ? colors.gray : colors[tone];
  const value = data?.error ? '!' : isProgress ? `${data.percent}%` : Number(data.value).toLocaleString('en-IN');
  const filterLabel = FILTERS.find((f) => f[0] === (w.filter || 'all'))?.[1];
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: desktop ? 190 : '46%', minWidth: 148, backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: editing ? BRAND : colors.gray[200], padding: spacing.lg, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: hue[50], alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={15} color={hue[600]} />
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.gray[600] }}>{w.title || (isProgress ? 'Progress' : 'Number')}</Text>
        {controls}
      </View>
      <Text numberOfLines={1} style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8, color: w.filter === 'overdue' && data?.value ? colors.red[600] : colors.gray[900], fontVariant: ['tabular-nums'] }}>
        {value}{!isProgress && data?.unit ? <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[500] }}> {data.unit}</Text> : null}
      </Text>
      {isProgress ? (
        <View style={{ gap: 6 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gray[100] }}><View style={{ width: `${data.percent}%`, height: 6, borderRadius: 3, backgroundColor: colors.green[500] }} /></View>
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>{data.done} of {data.total} done</Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>
          {data?.error ? data.error : w.formula ? 'Formula' : w.value ? `${AGGS.find((x) => x[0] === (w.agg || 'sum'))?.[1]} · ${filterLabel} tasks` : `of ${total} on the board`}
        </Text>
      )}
    </View>
  );
}

const SUGGESTIONS = ['Add a pie chart of tasks by person', 'Show what is overdue this week', 'Make it a weekly review dashboard'];

export default function BoardDashboard({ board, people, meId, view, canSave, onSave, onOpenItem, desktop }) {
  const colors = useColors();
  const saved = view?.settings?.widgets;
  const [widgets, setWidgets] = useState(() => (saved ? cleanWidgets(saved, board) : generateWidgets(board)));
  const [edit, setEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [request, setRequest] = useState('');
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState(null);
  const lastSaved = useRef(saved ? JSON.stringify(saved) : null);

  // A shared change (someone else edited the tab) comes in; our own save echoes back and is ignored.
  useEffect(() => {
    if (saved && JSON.stringify(saved) !== lastSaved.current) { lastSaved.current = JSON.stringify(saved); setWidgets(cleanWidgets(saved, board)); }
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback((next) => {
    setWidgets(next);
    if (canSave) { lastSaved.current = JSON.stringify(next); onSave(next); }
  }, [canSave, onSave]);

  // The first time a dashboard opens it is saved as generated, so it stays put while the data moves.
  useEffect(() => { if (!saved && canSave && widgets.length) commit(widgets); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => ({ board, people, meId }), [board, people, meId]);
  const computed = useMemo(() => widgets.map((w) => { try { return computeWidget(w, ctx); } catch { return { error: 'Could not draw this widget' }; } }), [widgets, ctx]);

  const move = (i, d) => { const j = i + d; if (j < 0 || j >= widgets.length) return; const n = [...widgets]; [n[i], n[j]] = [n[j], n[i]]; commit(n); };
  const resize = (i) => commit(widgets.map((w, k) => (k === i ? { ...w, w: (w.w % 3) + 1 } : w)));
  const addWidget = () => { const w = { id: Math.random().toString(36).slice(2, 9), type: 'chart', title: 'New chart', chart: 'column', by: 'status', w: 1 }; commit([...widgets, w]); setEditing(w.id); };
  const regenerate = async () => {
    const ok = await confirmDialog({ title: 'Rebuild from the board?', message: 'Your widgets are replaced by a fresh set made from the board\'s columns.', confirmLabel: 'Rebuild' });
    if (ok) commit(generateWidgets(board));
  };

  const ask = async (text) => {
    const q = (text ?? request).trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const r = await api.post(`/boards/${board.board.id}/dashboard/ai`, { request: q, widgets }, { timeout: 90000, __skipOops: true });
      setProposal({ widgets: cleanWidgets(r.data.widgets, board), summary: r.data.summary || 'Here is the new dashboard.', request: q });
      setRequest('');
    } catch (e) {
      showToast({ message: e.response?.data?.error || 'The AI could not do that. Try again.', tone: 'error', icon: 'alert-circle' });
    } finally { setAsking(false); }
  };

  const editingWidget = widgets.find((w) => w.id === editing);
  const cols = desktop ? 3 : 1;
  const indexed = widgets.map((w, i) => ({ w, i }));
  const kpis = indexed.filter(({ w }) => w.type === 'number' || w.type === 'progress');
  const panels = indexed.filter(({ w }) => w.type !== 'number' && w.type !== 'progress');
  const total = board.items.filter((t) => !t.parent_id).length;

  // The small tools a widget shows while the dashboard is being edited.
  const controls = (w, i, sizable) => (edit ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {desktop && sizable && <Pressable onPress={() => resize(i)} accessibilityLabel="Change width" hitSlop={6} style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.gray[100] }}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.gray[700] }}>{SIZES[(w.w || 1) - 1]}</Text></Pressable>}
      <Pressable onPress={() => move(i, -1)} accessibilityLabel="Move earlier" hitSlop={8} style={{ padding: 4 }}><Ionicons name="arrow-back" size={15} color={i ? colors.gray[700] : colors.gray[300]} /></Pressable>
      <Pressable onPress={() => move(i, 1)} accessibilityLabel="Move later" hitSlop={8} style={{ padding: 4 }}><Ionicons name="arrow-forward" size={15} color={i < widgets.length - 1 ? colors.gray[700] : colors.gray[300]} /></Pressable>
      <Pressable onPress={() => setEditing(w.id)} accessibilityLabel="Widget settings" hitSlop={8} style={{ padding: 4 }}><Ionicons name="settings-outline" size={15} color={colors.gray[700]} /></Pressable>
    </View>
  ) : null);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: desktop ? spacing.lg : spacing.sm, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 6, paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray[900], letterSpacing: -0.3 }}>{view?.name || 'Dashboard'}</Text>
            <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{total} {total === 1 ? 'task' : 'tasks'} on this board, counted live</Text>
          </View>
          {canSave && edit && (
            <>
              <Pressable onPress={addWidget} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
                <Ionicons name="add" size={16} color={colors.gray[800]} /><Text style={{ fontSize: 14, color: colors.gray[800] }}>Widget</Text>
              </Pressable>
              <Pressable onPress={regenerate} accessibilityLabel="Rebuild from the board" style={{ padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
                <Ionicons name="refresh" size={16} color={colors.gray[800]} />
              </Pressable>
            </>
          )}
          {canSave && (
            <Pressable onPress={() => setEdit((e) => !e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: edit ? BRAND : 'transparent', borderWidth: 1, borderColor: edit ? BRAND : colors.gray[300] }}>
              <Ionicons name={edit ? 'checkmark' : 'create-outline'} size={16} color={edit ? '#fff' : colors.gray[800]} />
              <Text style={{ fontSize: 14, color: edit ? '#fff' : colors.gray[800], fontWeight: edit ? '600' : '400' }}>{edit ? 'Done' : 'Edit'}</Text>
            </Pressable>
          )}
        </View>

        {proposal && (
          <View style={{ margin: 6, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: BRAND, backgroundColor: colors.brand[50], gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="sparkles" size={16} color={BRAND} /><Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{proposal.summary}</Text></View>
            <Text style={{ fontSize: 12, color: colors.gray[600] }}>{proposal.widgets.length} widgets: {proposal.widgets.map((w) => w.title || w.type).join(', ')}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable onPress={() => { commit(proposal.widgets); setProposal(null); }} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.md, backgroundColor: BRAND }}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Apply</Text></Pressable>
              <Pressable onPress={() => { setWidgets(proposal.widgets); setProposal({ ...proposal, preview: true }); }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}><Text style={{ color: colors.gray[800], fontSize: 14 }}>Preview</Text></Pressable>
              <Pressable onPress={() => { if (proposal.preview) setWidgets(cleanWidgets(view?.settings?.widgets || widgets, board)); setProposal(null); }} style={{ paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.gray[700], fontSize: 14 }}>Discard</Text></Pressable>
            </View>
          </View>
        )}

        {/* The numbers first, as one strip of equal tiles; then the charts, lists and tables in rows of equal height. */}
        {kpis.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: 6, paddingBottom: GAP }}>
            {kpis.map(({ w, i }) => (
              <KpiTile key={w.id} w={w} data={computed[i]} desktop={desktop} editing={edit} controls={controls(w, i, false)} total={total} />
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6 - GAP / 2 }}>
          {panels.map(({ w, i }) => {
            const wide = desktop ? Math.min(w.w || 1, cols) : 1;
            const fixed = w.type !== 'text';
            return (
              <View key={w.id} style={{ width: `${(wide / cols) * 100}%`, padding: GAP / 2 }}>
                <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: edit ? BRAND : colors.gray[200], height: fixed ? PANEL_H : undefined, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{w.title || TYPES.find((t) => t[0] === w.type)?.[1]}</Text>
                    {!edit && w.filter && w.filter !== 'all' && (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.gray[500] }}>{FILTERS.find((f) => f[0] === w.filter)?.[1]}</Text>
                    )}
                    {controls(w, i, true)}
                  </View>
                  {fixed ? (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexGrow: 1, justifyContent: w.type === 'chart' ? 'center' : 'flex-start' }}>
                      <WidgetBody w={w} data={computed[i]} onOpenItem={onOpenItem} height={PANEL_H - 96} />
                    </ScrollView>
                  ) : (
                    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                      <WidgetBody w={w} data={computed[i]} onOpenItem={onOpenItem} />
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
        {!widgets.length && <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>This dashboard is empty. {canSave ? 'Press Edit then Widget, or ask the AI below.' : ''}</Text>}
      </ScrollView>

      {board.ai_enabled && canSave && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: desktop ? spacing.xl : spacing.sm, paddingBottom: spacing.sm, paddingTop: 6, gap: 6, alignItems: 'center' }} pointerEvents="box-none">
          {!request && !asking && !proposal && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 720 }} contentContainerStyle={{ gap: 6 }}>
              {SUGGESTIONS.map((s) => <Pressable key={s} onPress={() => ask(s)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[300] }}><Text style={{ fontSize: 12, color: colors.gray[700] }}>{s}</Text></Pressable>)}
            </ScrollView>
          )}
          <View style={{ width: '100%', maxWidth: 720, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 24, borderWidth: 1, borderColor: colors.gray[300], paddingLeft: 14, paddingRight: 6, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}>
            <Ionicons name="sparkles" size={18} color={BRAND} />
            <TextInput value={request} onChangeText={setRequest} onSubmitEditing={() => ask()} editable={!asking} placeholder="Ask AI to change this dashboard..." placeholderTextColor={colors.gray[400]} returnKeyType="send"
              style={{ flex: 1, fontSize: 15, color: colors.gray[900], paddingVertical: 8, outlineStyle: 'none' }} />
            <Pressable onPress={() => ask()} disabled={asking || !request.trim()} accessibilityLabel="Send" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: request.trim() ? BRAND : colors.gray[200], alignItems: 'center', justifyContent: 'center' }}>
              {asking ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color={request.trim() ? '#fff' : colors.gray[500]} />}
            </Pressable>
          </View>
        </View>
      )}

      {editingWidget && (
        <WidgetEditor
          widget={editingWidget} board={board} onClose={() => setEditing(null)}
          onChange={(nw) => commit(widgets.map((w) => (w.id === nw.id ? nw : w)))}
          onDelete={() => { commit(widgets.filter((w) => w.id !== editingWidget.id)); setEditing(null); }}
        />
      )}
    </View>
  );
}

