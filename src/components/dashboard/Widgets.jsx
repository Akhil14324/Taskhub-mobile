import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { paletteHex, paletteInk } from '../board/model';
import { formatDue } from '../../utils/dates';
import Chart from './Charts';

// The widget kinds a dashboard offers (backend utils/dashboard.js computes each one for the viewer).
export const WIDGET_KINDS = [
  ['numbers', 'Number', 'calculator-outline', 'A count of items, or the total of a number column'],
  ['battery', 'Progress', 'battery-half-outline', 'How much is done'],
  ['status', 'Stages', 'stats-chart-outline', 'Items in each stage'],
  ['chart', 'Chart', 'bar-chart-outline', 'Items by stage, person, board or priority'],
  ['workload', 'Workload', 'people-outline', 'Open and late items per person'],
  ['upcoming', 'Coming up', 'calendar-outline', 'The next dated items'],
  ['overdue', 'Late', 'alert-circle-outline', 'Items past their date'],
  ['text', 'Note', 'document-text-outline', 'A few lines of your own'],
];
export const FILTERS = [['all', 'All'], ['open', 'Open'], ['done', 'Done'], ['overdue', 'Overdue'], ['mine', 'Mine'], ['this_week', 'This week']];
export const BY = [
  ['status', 'Stage'], ['person', 'Person'], ['board', 'Board'], ['priority', 'Priority'],
  ['due_day', 'Due day'], ['due_week', 'Due week'], ['due_month', 'Due month'], ['created_week', 'Created week'], ['done_week', 'Finished week'],
];

const fmt = (n) => (Math.abs(n) >= 100000 ? n.toLocaleString('en-IN') : String(Math.round(n * 100) / 100));

function Bars({ bars }) {
  const colors = useColors();
  const max = Math.max(1, ...bars.map((b) => b.count));
  if (!bars.length) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>Nothing to show.</Text>;
  return (
    <View style={{ gap: 6 }}>
      {bars.slice(0, 10).map((b) => (
        <View key={String(b.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ width: 110, fontSize: 13, color: colors.gray[700] }}>{b.label}</Text>
          <View style={{ flex: 1, height: 14, backgroundColor: colors.gray[100], borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${(b.count / max) * 100}%`, height: '100%', backgroundColor: paletteHex(b.color || 'blue'), borderRadius: 3 }} />
          </View>
          <Text style={{ width: 28, textAlign: 'right', fontSize: 13, color: colors.gray[900] }}>{b.count}</Text>
        </View>
      ))}
    </View>
  );
}

function ItemList({ items, onOpen, late }) {
  const colors = useColors();
  if (!items.length) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>{late ? 'Nothing is late.' : 'Nothing coming up.'}</Text>;
  return (
    <View>
      {items.map((t) => (
        <Pressable key={t.id} onPress={() => onOpen(t.id)} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.sm, backgroundColor: hovered ? colors.gray[50] : 'transparent' })}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{[t.who, t.board].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={{ fontSize: 12, color: late ? colors.red[600] : colors.gray[700] }}>{formatDue(t.due)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** What one widget draws, from the data the server computed for this viewer. */
export function WidgetBody({ widget, onOpenItem }) {
  const colors = useColors();
  const d = widget.data || {};
  switch (widget.kind) {
    case 'numbers':
      return (
        <Text style={{ fontSize: 34, fontWeight: '700', color: colors.gray[900] }}>
          {d.unit ? `${d.unit} ` : ''}{fmt(d.value || 0)}
        </Text>
      );
    case 'battery':
      return (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 30, fontWeight: '700', color: colors.gray[900] }}>{d.percent || 0}%</Text>
          <View style={{ height: 12, backgroundColor: colors.gray[100], borderRadius: 6, overflow: 'hidden' }}>
            <View style={{ width: `${d.percent || 0}%`, height: '100%', backgroundColor: paletteHex('green') }} />
          </View>
          <Text style={{ fontSize: 13, color: colors.gray[600] }}>{d.done || 0} of {d.total || 0} done</Text>
        </View>
      );
    case 'status': {
      const bars = d.bars || [];
      const total = bars.reduce((s, b) => s + b.count, 0);
      if (!total) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>No items.</Text>;
      return (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', height: 26, borderRadius: radius.sm, overflow: 'hidden' }}>
            {bars.map((b) => (
              <View key={b.key} style={{ flex: b.count, backgroundColor: paletteHex(b.color), alignItems: 'center', justifyContent: 'center' }}>
                {b.count / total > 0.08 && <Text style={{ fontSize: 12, color: paletteInk(b.color) }}>{Math.round((b.count / total) * 100)}%</Text>}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {bars.map((b) => (
              <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: paletteHex(b.color) }} />
                <Text style={{ fontSize: 12, color: colors.gray[700] }}>{b.label} {b.count}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }
    case 'chart':
      return d.categories ? (
        <Chart data={d} type={widget.config?.chart || 'bar'} height={Math.max(150, (widget.config?.h || 280) - 64)} showLegend={widget.config?.legend !== false} showLabels={widget.config?.labels !== false} />
      ) : <Bars bars={d.bars || []} />;
    case 'workload': {
      const people = d.people || [];
      const max = Math.max(1, ...people.map((p) => p.open));
      if (!people.length) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>Nobody has open items.</Text>;
      return (
        <View style={{ gap: 6 }}>
          {people.slice(0, 10).map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ width: 110, fontSize: 13, color: colors.gray[700] }}>{p.name}</Text>
              <View style={{ flex: 1, height: 14, flexDirection: 'row', backgroundColor: colors.gray[100], borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${((p.open - p.overdue) / max) * 100}%`, backgroundColor: paletteHex('blue') }} />
                <View style={{ width: `${(p.overdue / max) * 100}%`, backgroundColor: paletteHex('red') }} />
              </View>
              <Text style={{ width: 56, textAlign: 'right', fontSize: 12, color: colors.gray[700] }}>{p.open}{p.overdue ? ` · ${p.overdue} late` : ''}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'upcoming':
      return <ItemList items={d.items || []} onOpen={onOpenItem} />;
    case 'overdue':
      return <ItemList items={d.items || []} onOpen={onOpenItem} late />;
    case 'text':
      return <Text style={{ fontSize: 14, color: colors.gray[800], lineHeight: 21 }}>{d.text || 'Write something in this note.'}</Text>;
    default:
      return null;
  }
}

export function WidgetCard({ widget, mine, onEdit, onOpenItem, onRename, onGrip, minHeight }) {
  const colors = useColors();
  const kind = WIDGET_KINDS.find((k) => k[0] === widget.kind);
  const [renaming, setRenaming] = useState(false);
  const title = widget.title || kind?.[1];
  const commit = (e) => {
    const v = (e.nativeEvent?.text ?? '').trim();
    setRenaming(false);
    if (v && v !== title) onRename?.(widget, v);
  };
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.md, gap: spacing.sm, minHeight: minHeight || widget.config?.h || 140 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={kind?.[2] || 'apps-outline'} size={15} color={colors.gray[500]} />
        {renaming ? (
          <TextInput
            autoFocus selectTextOnFocus defaultValue={title} onBlur={commit} onSubmitEditing={commit}
            onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') setRenaming(false); }}
            style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.gray[900], borderWidth: 2, borderColor: '#0073ea', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1, outlineStyle: 'none' }}
          />
        ) : (
          <Pressable disabled={!mine} onPress={() => setRenaming(true)} style={{ flex: 1, cursor: mine ? 'text' : 'default' }} accessibilityLabel="Rename this widget">
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.gray[800] }}>{title}</Text>
          </Pressable>
        )}
        {mine && (
          <Pressable onPress={() => onEdit(widget)} accessibilityLabel="Widget settings" hitSlop={6}>
            <Ionicons name="settings-outline" size={16} color={colors.gray[500]} />
          </Pressable>
        )}
      </View>
      <WidgetBody widget={widget} onOpenItem={onOpenItem} />
      {mine && !!onGrip && (
        <View ref={onGrip} accessibilityLabel="Drag to resize" style={{ position: 'absolute', right: 3, bottom: 3, width: 18, height: 18, cursor: 'nwse-resize', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <Ionicons name="resize-outline" size={14} color={colors.gray[400]} />
        </View>
      )}
    </View>
  );
}
