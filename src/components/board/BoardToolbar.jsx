import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import Popover, { anchorOf } from './Popover';
import Hint from './Hint';
import { Avatar } from '../kit';
import { filterOptions, NAME_FILTER, paletteHex, valueKeysOf } from './model';

// The quick filters a view can save (applied in BoardScreen's applyQuick).
export const QUICK_FILTERS = [['mine', 'My tasks'], ['overdue', 'Late'], ['week', 'Due this week'], ['hide_done', 'Hide done']];

export const COLOR_OPS = [['is', 'is'], ['is_not', 'is not'], ['empty', 'is empty'], ['not_empty', 'is not empty']];
const RULE_COLORS = ['green', 'orange', 'red', 'blue', 'purple', 'yellow', 'pink', 'grey'];

function Tool({ icon, label, active, count, onPress, hint, caret }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.md,
        backgroundColor: active ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent',
      })}
    >
      {!!icon && <Ionicons name={icon} size={16} color={active ? BRAND : colors.gray[700]} />}
      {!!label && <Text style={{ fontSize: 14, color: active ? BRAND : colors.gray[800] }}>{label}</Text>}
      {count > 0 && (
        <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{count}</Text>
        </View>
      )}
      {caret && <Ionicons name="chevron-down" size={12} color={active ? BRAND : colors.gray[500]} />}
    </Pressable>
  );
}

function Item({ icon, label, active, onPress, right, danger, disabled }) {
  const colors = useColors();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, opacity: disabled ? 0.5 : 1, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      {!!icon && <Ionicons name={icon} size={16} color={danger ? colors.red[600] : active ? BRAND : colors.gray[600]} />}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: danger ? colors.red[600] : colors.gray[900] }}>{label}</Text>
      {active ? <Ionicons name="checkmark" size={16} color={BRAND} /> : right}
    </Pressable>
  );
}

function Check({ on, onPress, label, sub, count, color, icon, indent = 0 }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 6, marginLeft: indent, borderRadius: radius.sm, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: on ? BRAND : colors.gray[400], backgroundColor: on ? BRAND : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      {!!color && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: paletteHex(color) }} />}
      {!!icon && <Ionicons name={icon} size={14} color={colors.gray[500]} />}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.gray[900] }}>{label}</Text>
      {!!sub && <Text style={{ fontSize: 11, color: colors.gray[500] }}>{sub}</Text>}
      {count !== undefined && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{count}</Text>}
    </Pressable>
  );
}

/** A small drop-down that opens its list right under itself, inside the panel. */
export function Select({ value, options, onChange, placeholder = 'Choose', width, flex }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <View style={{ width, flex, zIndex: open ? 20 : 1 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: open ? BRAND : colors.gray[300], borderRadius: radius.sm, paddingHorizontal: 8, height: 32, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: cur ? colors.gray[900] : colors.gray[500] }}>{cur ? cur.label : placeholder}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.gray[500]} />
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: 34, left: 0, right: 0, maxHeight: 220, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.sm, backgroundColor: colors.white, zIndex: 30, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8 }}>
          <ScrollView>
            {options.map((o) => (
              <Pressable key={String(o.value)} onPress={() => { onChange(o.value); setOpen(false); }} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: o.value === value ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}>
                {!!o.color && <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: paletteHex(o.color) }} />}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.gray[900] }}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function PanelHead({ title, hint, right }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, paddingBottom: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
      {!!hint && <Hint text={hint} size={14} />}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

function SmallBtn({ label, onPress, primary, disabled }) {
  const colors = useColors();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ hovered }) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, borderWidth: primary ? 0 : 1, borderColor: colors.gray[300], opacity: disabled ? 0.45 : 1, backgroundColor: primary ? BRAND : hovered ? colors.gray[100] : 'transparent' })}>
      <Text style={{ fontSize: 12, color: primary ? '#fff' : colors.gray[700] }}>{label}</Text>
    </Pressable>
  );
}

/** One column of the Excel-style filter: its title and a checkable list of every value in use, with counts. */
function FilterColumn({ title, options, picked, onToggle, onAll }) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={{ width: 188, borderRightWidth: 1, borderColor: colors.gray[200], paddingHorizontal: 6 }}>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: colors.gray[600], paddingHorizontal: 6, paddingBottom: 4 }}>{title}</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.gray[400]} style={{ marginHorizontal: 4, marginBottom: 4, height: 28, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.sm, paddingHorizontal: 8, fontSize: 12, color: colors.gray[900], outlineStyle: 'none' }} />
      <ScrollView style={{ maxHeight: 220 }}>
        <Check on={options.length > 0 && options.every((o) => picked.includes(o.key))} onPress={onAll} label="Select all" />
        {shown.map((o) => <Check key={o.key} on={picked.includes(o.key)} onPress={() => onToggle(o.key)} label={o.label} count={o.count} color={o.color} />)}
        {!shown.length && <Text style={{ fontSize: 12, color: colors.gray[500], padding: 8 }}>Nothing here</Text>}
      </ScrollView>
    </View>
  );
}

/**
 * The bar under the view tabs: New task (its drop-down adds a group), Search, Person, Filter, Sort, Hide, Group by
 * and the "..." menu. `vs` is the view's state; `onChange(patch)` saves a part of it.
 */
export default function BoardToolbar({
  data, vs, onChange, people, search, onSearch, searchCols, onSearchCols, word, onNew, onNewGroup, onImport, desktop, canAdd,
  kind = 'table', shownCount, totalCount, onSaveAsView, items = [], canManage,
}) {
  const colors = useColors();
  const [pop, setPop] = useState(null); // { type, anchor }
  const [searchOpen, setSearchOpen] = useState(!!search);
  const [hideQ, setHideQ] = useState('');
  const [personQ, setPersonQ] = useState('');
  const inputRef = useRef(null);
  const open = (type) => (e) => { setHideQ(''); setPersonQ(''); setPop({ type, anchor: anchorOf(e) }); };
  const close = () => setPop(null);
  const lower = word.toLowerCase();

  const filters = vs.filters || {};
  const colFilters = filters.cols || {};
  const quickCount = QUICK_FILTERS.filter(([k]) => filters[k]).length;
  const colCount = Object.values(colFilters).filter((a) => a?.length).length;
  const filterCount = quickCount + colCount;
  const sortCols = [{ id: 'name', title: word }, ...data.columns.filter((c) => !['files', 'button'].includes(c.kind))];
  const owners = people.filter((p) => data.items.some((t) => t.assignee_id === p.id || (t.members || []).some((m) => m.id === p.id)));
  const top = useMemo(() => data.items.filter((t) => !t.parent_id), [data.items]);
  const groupable = data.columns.filter((c) => !['files', 'button', 'long_text'].includes(c.kind));
  const setCols = (id, keys) => onChange({ filters: { ...filters, cols: { ...colFilters, [id]: keys } } });

  const filterColumns = useMemo(() => {
    if (pop?.type !== 'filter') return [];
    const base = [{ id: NAME_FILTER, title: word, col: NAME_FILTER }, ...data.columns.map((c) => ({ id: c.id, title: c.title, col: c }))];
    return base.map((b) => ({ ...b, options: filterOptions(top, b.col, data.values, people) }));
  }, [pop?.type, top, data.columns, data.values, people, word]);

  const sortDir = vs.sort?.dir || 'asc';
  const rules = vs.color_rules || [];
  const setRules = (next) => onChange({ color_rules: next });
  const defaults = vs.defaults || {};

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2 }} style={{ flexGrow: 0 }}>
        {canAdd && (
          <View style={{ flexDirection: 'row', marginRight: spacing.sm }}>
            <Pressable
              onPress={(e) => onNew(anchorOf(e))}
              accessibilityLabel={`New ${lower}. Adds a ${lower} to the first group.`}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND, paddingHorizontal: spacing.md, paddingVertical: 8, borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>New {lower}</Text>
            </Pressable>
            <Pressable
              onPress={open('new')}
              accessibilityLabel="More ways to add"
              style={{ justifyContent: 'center', paddingHorizontal: 8, backgroundColor: BRAND, borderLeftWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderTopRightRadius: radius.md, borderBottomRightRadius: radius.md }}
            >
              <Ionicons name="chevron-down" size={14} color="#fff" />
            </Pressable>
          </View>
        )}
        {searchOpen || search ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: BRAND, borderRadius: radius.md, paddingHorizontal: spacing.sm, width: 250 }}>
            <Ionicons name="search" size={15} color={colors.gray[500]} />
            <TextInput
              ref={inputRef} autoFocus value={search} onChangeText={onSearch} placeholder="Search this board" placeholderTextColor={colors.gray[400]}
              onBlur={() => { if (!search && pop?.type !== 'searchcols') setSearchOpen(false); }}
              style={{ flex: 1, paddingVertical: 6, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
            />
            {!!search && <Pressable onPress={() => { onSearch(''); setSearchOpen(false); }} hitSlop={6} accessibilityLabel="Clear search"><Ionicons name="close" size={15} color={colors.gray[500]} /></Pressable>}
            <Pressable onPress={open('searchcols')} hitSlop={6} accessibilityLabel="Choose columns to search"><Ionicons name="options-outline" size={16} color={searchCols ? BRAND : colors.gray[500]} /></Pressable>
          </View>
        ) : <Tool icon="search-outline" label="Search" onPress={() => setSearchOpen(true)} hint="Find a task by its name or anything in its columns." />}
        <Tool icon="person-circle-outline" label="Person" active={(vs.people || []).length > 0} count={(vs.people || []).length} onPress={open('person')} hint="Show only the tasks of some people." />
        <Tool icon="funnel-outline" label="Filter" caret active={filterCount > 0} count={filterCount} onPress={open('filter')} hint="Narrow the board down by any column, like in a spreadsheet." />
        {kind === 'table' && <Tool icon="swap-vertical-outline" label="Sort" active={!!vs.sort} onPress={open('sort')} hint="Order the tasks inside each group by a column." />}
        {kind === 'table' && <Tool icon="eye-off-outline" label="Hide" active={(vs.hidden || []).length > 0} count={(vs.hidden || []).length} onPress={open('hide')} hint="Hide columns you do not need on this view. The data is not deleted." />}
        {desktop && kind === 'table' && <Tool icon="albums-outline" label="Group by" active={!!vs.group_by} onPress={open('group')} hint="Group the tasks by any column instead of by the board's groups." />}
        {desktop && kind === 'table' && <Tool icon="ellipsis-horizontal" label="" active={!!(vs.pinned || vs.header_height || vs.item_height || rules.length || Object.keys(defaults).length)} onPress={open('more')} />}
      </ScrollView>

      {pop?.type === 'new' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={260}>
          <Item icon="add-circle-outline" label={`New ${lower}`} onPress={() => { const a = pop.anchor; close(); onNew(a); }}
            right={<Hint text={`Adds a ${lower} to the first group and lets you type its name at once.`} />} />
          <Item icon="layers-outline" label="New group" onPress={() => { close(); onNewGroup(); }}
            right={<Hint text="A group is a section of the board, like To-Do or Completed. It is made at once; click its name to rename it." />} />
          <Item icon="cloud-upload-outline" label={`Import ${lower}s from a file`} onPress={() => { close(); onImport(); }}
            right={<Hint text="Bring many tasks in from a CSV file. You see what will happen before anything is added." />} />
        </Popover>
      )}

      {pop?.type === 'searchcols' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={280}>
          <PanelHead title="Choose columns to search" right={<SmallBtn label="All" onPress={() => onSearchCols(null)} />} />
          <ScrollView style={{ maxHeight: 300 }}>
            <Check on={!searchCols || searchCols.includes('name')} label={word} onPress={() => { const cur = searchCols || ['name', ...data.columns.map((c) => c.id)]; onSearchCols(cur.includes('name') ? cur.filter((x) => x !== 'name') : [...cur, 'name']); }} />
            {data.columns.map((c) => {
              const on = !searchCols || searchCols.includes(c.id);
              return <Check key={c.id} on={on} label={c.title} onPress={() => { const cur = searchCols || ['name', ...data.columns.map((x) => x.id)]; onSearchCols(on ? cur.filter((x) => x !== c.id) : [...cur, c.id]); }} />;
            })}
          </ScrollView>
        </Popover>
      )}

      {pop?.type === 'person' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={300}>
          <PanelHead title="Filter this board by person" hint="Shows only the tasks that person owns or is part of." right={(vs.people || []).length > 0 ? <SmallBtn label="Clear" onPress={() => onChange({ people: [] })} /> : null} />
          <TextInput value={personQ} onChangeText={setPersonQ} placeholder="Search for a person" placeholderTextColor={colors.gray[400]} style={{ marginHorizontal: 8, marginBottom: 6, height: 32, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.sm, paddingHorizontal: 8, fontSize: 13, color: colors.gray[900], outlineStyle: 'none' }} />
          <ScrollView style={{ maxHeight: 300 }}>
            {owners.filter((p) => p.name.toLowerCase().includes(personQ.trim().toLowerCase())).map((p) => {
              const on = (vs.people || []).includes(p.id);
              return (
                <Pressable key={p.id} onPress={() => onChange({ people: on ? vs.people.filter((x) => x !== p.id) : [...(vs.people || []), p.id] })}
                  style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 7, borderRadius: radius.md, backgroundColor: on ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}>
                  <Avatar name={p.name} uri={p.profile_picture} size={24} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{p.name}</Text>
                  {on && <Ionicons name="checkmark" size={16} color={BRAND} />}
                </Pressable>
              );
            })}
            {!owners.length && <Text style={{ padding: 8, color: colors.gray[500] }}>Nobody has a task here yet.</Text>}
          </ScrollView>
        </Popover>
      )}

      {pop?.type === 'filter' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={820}>
          <PanelHead
            title="Quick filters" hint="Tick the values you want to see in any column. A task stays when it matches every column you filtered."
            right={(
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 12, color: colors.gray[500] }}>Showing {shownCount} of {totalCount} {lower}s</Text>
                <SmallBtn label="Clear all" disabled={!filterCount} onPress={() => onChange({ filters: {} })} />
                {!!onSaveAsView && <SmallBtn label="Save as new view" onPress={() => { onSaveAsView(); close(); }} />}
              </View>
            )}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 8 }}>
            {QUICK_FILTERS.map(([k, l]) => (
              <Pressable key={k} onPress={() => onChange({ filters: { ...filters, [k]: !filters[k] } })} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: filters[k] ? BRAND : colors.gray[300], backgroundColor: filters[k] ? colors.brand[50] : 'transparent' }}>
                <Text style={{ fontSize: 12, color: filters[k] ? BRAND : colors.gray[700] }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal style={{ borderTopWidth: 1, borderColor: colors.gray[200], paddingTop: 8 }}>
            {filterColumns.map((fc) => {
              const picked = colFilters[fc.id] || [];
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

      {pop?.type === 'sort' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={380}>
          <PanelHead title="Sort by" hint="Orders the tasks inside each group by one column." right={!!vs.sort && <SmallBtn label="Clear" onPress={() => { onChange({ sort: null }); close(); }} />} />
          <View style={{ flexDirection: 'row', gap: 8, padding: 8, paddingTop: 2, minHeight: 250, alignItems: 'flex-start' }}>
            <Select
              flex={1.4} placeholder="Choose column" value={vs.sort?.column_id}
              options={sortCols.map((c) => ({ value: c.id, label: c.title }))}
              onChange={(id) => onChange({ sort: { column_id: id, dir: sortDir } })}
            />
            <Select
              flex={1} value={sortDir}
              options={[{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }]}
              onChange={(dir) => vs.sort?.column_id && onChange({ sort: { column_id: vs.sort.column_id, dir } })}
            />
          </View>
        </Popover>
      )}

      {pop?.type === 'hide' && (() => {
        const allOn = (vs.hidden || []).length === 0;
        return (
          <Popover visible anchor={pop.anchor} onClose={close} width={290}>
            <PanelHead title="Display columns" hint="Hides columns on this view only. The data is not deleted." />
            <TextInput value={hideQ} onChangeText={setHideQ} placeholder="Find columns to show/hide" placeholderTextColor={colors.gray[400]} style={{ marginHorizontal: 8, marginBottom: 6, height: 32, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.sm, paddingHorizontal: 8, fontSize: 13, color: colors.gray[900], outlineStyle: 'none' }} />
            <ScrollView style={{ maxHeight: 320 }}>
              <Check on={allOn} label="All columns" sub={`${data.columns.length - (vs.hidden || []).length} selected`} onPress={() => onChange({ hidden: allOn ? data.columns.map((c) => c.id) : [] })} />
              {data.columns.filter((c) => c.title.toLowerCase().includes(hideQ.trim().toLowerCase())).map((c) => {
                const hidden = (vs.hidden || []).includes(c.id);
                return <Check key={c.id} indent={14} on={!hidden} label={c.title} onPress={() => onChange({ hidden: hidden ? vs.hidden.filter((x) => x !== c.id) : [...(vs.hidden || []), c.id] })} />;
              })}
            </ScrollView>
          </Popover>
        );
      })()}

      {pop?.type === 'group' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={420}>
          <PanelHead title="Group items by" hint="Groups the tasks by the values of a column instead of by the board's own groups." right={!!vs.group_by && <SmallBtn label="Clear" onPress={() => { onChange({ group_by: null }); close(); }} />} />
          <View style={{ flexDirection: 'row', gap: 8, padding: 8, paddingTop: 2, minHeight: 250, alignItems: 'flex-start' }}>
            <Select
              flex={1.4} placeholder="Select a column to group by" value={vs.group_by || undefined}
              options={groupable.map((c) => ({ value: String(c.id), label: c.title }))}
              onChange={(id) => onChange({ group_by: id })}
            />
            <Select
              flex={1} placeholder="Select sorting option" value={vs.group_dir || 'asc'}
              options={[{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }]}
              onChange={(dir) => onChange({ group_dir: dir })}
            />
          </View>
        </Popover>
      )}

      {pop?.type === 'more' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={250}>
          <Item icon="pin-outline" label="Pin columns" right={<Ionicons name="chevron-forward" size={14} color={colors.gray[500]} />} onPress={() => setPop({ ...pop, type: 'pin' })} />
          <Item icon="resize-outline" label="Header height" right={<Ionicons name="chevron-forward" size={14} color={colors.gray[500]} />} onPress={() => setPop({ ...pop, type: 'header' })} />
          <Item icon="reorder-three-outline" label="Item height" right={<Ionicons name="chevron-forward" size={14} color={colors.gray[500]} />} onPress={() => setPop({ ...pop, type: 'itemh' })} />
          <Item icon="color-palette-outline" label="Conditional coloring" right={<Ionicons name="chevron-forward" size={14} color={colors.gray[500]} />} onPress={() => setPop({ ...pop, type: 'colors' })} />
          <Item icon="create-outline" label="Default item values" onPress={() => setPop({ ...pop, type: 'defaults' })} />
        </Popover>
      )}
      {pop?.type === 'pin' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={260}>
          <PanelHead title="Pin columns" hint="Pinned columns stay in place while you scroll the table sideways." />
          {[0, 1, 2, 3].map((n) => (
            <Item key={n} label={n === 0 ? `Only the ${lower} name` : `${word} name and ${n} column${n > 1 ? 's' : ''}`} active={(vs.pinned || 0) === n} onPress={() => { onChange({ pinned: n }); close(); }} />
          ))}
        </Popover>
      )}
      {pop?.type === 'header' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={220}>
          <PanelHead title="Header height" />
          {[['single', 'Single'], ['double', 'Double'], ['triple', 'Triple']].map(([k, l]) => (
            <Item key={k} label={l} active={(vs.header_height || 'single') === k} onPress={() => { onChange({ header_height: k }); close(); }} />
          ))}
        </Popover>
      )}
      {pop?.type === 'itemh' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={220}>
          <PanelHead title="Item height" />
          {[['compact', 'Compact'], ['normal', 'Normal'], ['tall', 'Tall']].map(([k, l]) => (
            <Item key={k} label={l} active={(vs.item_height || 'normal') === k} onPress={() => { onChange({ item_height: k }); close(); }} />
          ))}
        </Popover>
      )}

      {pop?.type === 'colors' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={620}>
          <PanelHead title="Conditional coloring" hint="Colours the left edge and name of every task that matches a rule. The first rule that matches wins." />
          <View style={{ padding: 8, paddingTop: 2, gap: 8, minHeight: 260 }}>
            {rules.map((r, i) => {
              const col = data.columns.find((c) => c.id === r.column_id);
              const opts = col ? filterOptions(top, col, data.values, people) : [];
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 50 - i }}>
                  <Pressable onPress={() => setRules(rules.map((x) => (x.id === r.id ? { ...x, color: RULE_COLORS[(RULE_COLORS.indexOf(x.color) + 1) % RULE_COLORS.length] } : x)))} accessibilityLabel="Change colour" style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: paletteHex(r.color), borderWidth: 1, borderColor: colors.gray[300] }} />
                  <Text style={{ fontSize: 13, color: colors.gray[600] }}>Set when</Text>
                  <Select flex={1.2} placeholder="Column" value={r.column_id} options={data.columns.map((c) => ({ value: c.id, label: c.title }))} onChange={(v) => setRules(rules.map((x) => (x.id === r.id ? { ...x, column_id: v, value: null } : x)))} />
                  <Select flex={1} value={r.op} options={COLOR_OPS.map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => setRules(rules.map((x) => (x.id === r.id ? { ...x, op: v } : x)))} />
                  {(r.op === 'is' || r.op === 'is_not') && <Select flex={1.2} placeholder="Value" value={r.value} options={opts.map((o) => ({ value: o.key, label: o.label, color: o.color }))} onChange={(v) => setRules(rules.map((x) => (x.id === r.id ? { ...x, value: v } : x)))} />}
                  <Pressable onPress={() => setRules(rules.filter((x) => x.id !== r.id))} hitSlop={6} accessibilityLabel="Remove rule"><Ionicons name="trash-outline" size={16} color={colors.gray[500]} /></Pressable>
                </View>
              );
            })}
            <Pressable onPress={() => setRules([...rules, { id: Math.random().toString(36).slice(2, 8), color: RULE_COLORS[rules.length % RULE_COLORS.length], column_id: data.columns.find((c) => c.kind === 'status')?.id || data.columns[0]?.id, op: 'is', value: null }])} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, color: BRAND }}>+ New condition</Text>
            </Pressable>
          </View>
        </Popover>
      )}

      {pop?.type === 'defaults' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={420}>
          <PanelHead title="Set default values for new tasks" hint="Every new task made on this view starts with these values." right={<SmallBtn label="Clear all" onPress={() => onChange({ defaults: {} })} />} />
          <View style={{ padding: 8, paddingTop: 2, gap: 8, minHeight: 280 }}>
            {data.columns.filter((c) => ['person', 'status', 'date', 'long_text', 'text'].includes(c.kind)).map((c, i) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 40 - i }}>
                <Text numberOfLines={1} style={{ width: 110, fontSize: 13, color: colors.gray[700] }}>{c.title}</Text>
                {c.kind === 'person' && <Select flex={1} placeholder="Nobody" value={defaults[c.id]} options={[{ value: null, label: 'Nobody' }, ...owners.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => onChange({ defaults: { ...defaults, [c.id]: v } })} />}
                {c.kind === 'status' && <Select flex={1} placeholder="First label" value={defaults[c.id]} options={[{ value: null, label: 'Not set' }, ...(c.labels || []).map((l) => ({ value: l.id, label: l.label, color: l.color }))]} onChange={(v) => onChange({ defaults: { ...defaults, [c.id]: v } })} />}
                {c.kind === 'date' && <Select flex={1} placeholder="No date" value={defaults[c.id]} options={[{ value: null, label: 'No date' }, { value: 0, label: 'Today' }, { value: 1, label: 'Tomorrow' }, { value: 7, label: 'In a week' }]} onChange={(v) => onChange({ defaults: { ...defaults, [c.id]: v } })} />}
                {(c.kind === 'long_text' || c.kind === 'text') && (
                  <TextInput value={defaults[c.id] || ''} onChangeText={(v) => onChange({ defaults: { ...defaults, [c.id]: v } })} placeholder="Nothing" placeholderTextColor={colors.gray[400]} style={{ flex: 1, height: 32, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.sm, paddingHorizontal: 8, fontSize: 13, color: colors.gray[900], outlineStyle: 'none' }} />
                )}
              </View>
            ))}
          </View>
        </Popover>
      )}
    </View>
  );
}

// Does a rule match an item? Used by the table to colour a row.
export function ruleMatches(rule, item, data, people) {
  const col = data.columns.find((c) => c.id === rule.column_id);
  if (!col) return false;
  const keys = valueKeysOf(item, col, data.values, people).map((o) => o.key);
  const blank = keys.length === 1 && keys[0] === 'none';
  if (rule.op === 'empty') return blank;
  if (rule.op === 'not_empty') return !blank;
  if (!rule.value) return false;
  const has = keys.includes(rule.value);
  return rule.op === 'is_not' ? !has : has;
}

