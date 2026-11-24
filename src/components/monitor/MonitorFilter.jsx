import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { radius, BRAND } from '../../theme/theme';
import Popover, { anchorOf } from '../board/Popover';
import { FilterColumn, PanelHead, SmallBtn } from '../board/BoardToolbar';
import { filterOptions, passesColumnFilters } from '../board/model';

// The Team monitor and Person monitor use the board's own filter: the same value lists with counts, the same
// date buckets, the same "Entered date" column. These are the pseudo-columns the monitor's to-dos are read through.
const STATUS_LABELS = [
  { label: 'Not started', color: 'grey', maps_to: 'todo' },
  { label: 'Working on it', color: 'orange', maps_to: 'in_progress' },
  { label: 'Stuck', color: 'red', maps_to: 'blocked' },
  { label: 'In review', color: 'blue', maps_to: 'in_review' },
  { label: 'On hold', color: 'purple', maps_to: 'on_hold' },
  { label: 'Done', color: 'green', maps_to: 'done' },
];

const COLUMNS = {
  person: { id: 'person', title: 'Person', kind: 'person', system_key: 'person' },
  business: { id: 'business', title: 'Business', kind: 'text' },
  status: { id: 'status', title: 'Status', kind: 'status', system_key: 'status', labels: STATUS_LABELS },
  due: { id: 'due', title: 'Due date', kind: 'date', system_key: 'date' },
  entered: { id: 'entered', title: 'Entered date', kind: 'entered_date', system_key: 'entered' },
  priority: { id: 'priority', title: 'Priority', kind: 'priority', system_key: 'priority' },
};

/** The filterable columns and the per-task values (business) for a list of monitor to-dos. */
export function monitorModel(rows, { withPerson = false } = {}) {
  const columns = (withPerson ? ['person'] : []).concat(['business', 'status', 'due', 'entered', 'priority']).map((k) => COLUMNS[k]);
  const values = {};
  for (const t of rows || []) values[t.id] = { business: t.business_name || '' };
  return { columns, values };
}

/** Does a to-do pass the picked values (`cols` = { columnId: [valueKey] })? */
export const passesMonitor = (row, model, cols) => passesColumnFilters(row, model.columns, model.values, [], cols);

/** How many columns are being filtered. */
export const activeCols = (cols) => Object.values(cols || {}).filter((a) => a?.length).length;

/**
 * One Filter button for the monitor screens. `filters` is { cols, ...quick } like a board view's filters;
 * `quick` lists extra on/off filters [[key, label]] the screen understands itself.
 */
export default function MonitorFilter({ rows, model, filters, onChange, quick = [], shown, total, noun = 'task' }) {
  const colors = useColors();
  const [anchor, setAnchor] = useState(null);
  const cols = filters.cols || {};
  const count = activeCols(cols) + quick.filter(([k]) => filters[k]).length;
  const options = useMemo(
    () => (anchor ? model.columns.map((c) => ({ ...c, options: filterOptions(rows || [], c, model.values, []) })) : []),
    [anchor, model, rows],
  );
  const setCols = (id, keys) => onChange({ ...filters, cols: { ...cols, [id]: keys } });
  const clear = () => onChange({ ...Object.fromEntries(Object.entries(filters).filter(([k]) => !quick.some(([q]) => q === k))), cols: {} });

  return (
    <>
      <Pressable
        onPress={(e) => setAnchor(anchorOf(e))}
        accessibilityLabel="Filter"
        style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: count ? BRAND : colors.gray[300], backgroundColor: count ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}
      >
        <Ionicons name="funnel-outline" size={16} color={count ? BRAND : colors.gray[700]} />
        <Text style={{ fontSize: 14, color: count ? BRAND : colors.gray[800] }}>Filter</Text>
        {count > 0 && (
          <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{count}</Text>
          </View>
        )}
      </Pressable>
      {!!anchor && (
        <Popover visible anchor={anchor} onClose={() => setAnchor(null)} width={820}>
          <PanelHead
            title="Filter" hint="Tick the values you want to see in any column. A task stays when it matches every column you filtered."
            right={(
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {shown !== undefined && <Text style={{ fontSize: 12, color: colors.gray[500] }}>Showing {shown} of {total} {noun}s</Text>}
                <SmallBtn label="Clear all" disabled={!count} onPress={clear} />
              </View>
            )}
          />
          {quick.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 8 }}>
              {quick.map(([k, l]) => (
                <Pressable key={k} onPress={() => onChange({ ...filters, [k]: !filters[k] })} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: filters[k] ? BRAND : colors.gray[300], backgroundColor: filters[k] ? colors.brand[50] : 'transparent' }}>
                  <Text style={{ fontSize: 12, color: filters[k] ? BRAND : colors.gray[700] }}>{l}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <ScrollView horizontal style={{ borderTopWidth: 1, borderColor: colors.gray[200], paddingTop: 8 }}>
            {options.map((fc) => {
              const picked = cols[fc.id] || [];
              return (
                <FilterColumn
                  key={fc.id} title={fc.title} options={fc.options} picked={picked}
                  onToggle={(k) => setCols(fc.id, picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k])}
                  onAll={() => setCols(fc.id, fc.options.every((o) => picked.includes(o.key)) ? [] : fc.options.map((o) => o.key))}
                />
              );
            })}
          </ScrollView>
        </Popover>
      )}
    </>
  );
}
