import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import Popover, { anchorOf } from './Popover';
import Hint from './Hint';
import { Avatar } from '../kit';

// The quick filters a view can save (applied in BoardScreen's applyQuick).
export const QUICK_FILTERS = [['mine', 'My tasks'], ['overdue', 'Late'], ['week', 'Due this week'], ['hide_done', 'Hide done']];

function Tool({ icon, label, active, count, onPress, hint }) {
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
      <Ionicons name={icon} size={16} color={active ? BRAND : colors.gray[700]} />
      <Text style={{ fontSize: 14, color: active ? BRAND : colors.gray[800] }}>{label}</Text>
      {count > 0 && (
        <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Item({ icon, label, active, onPress, right, danger }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      {!!icon && <Ionicons name={icon} size={16} color={danger ? colors.red[600] : active ? BRAND : colors.gray[600]} />}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: danger ? colors.red[600] : colors.gray[900] }}>{label}</Text>
      {active ? <Ionicons name="checkmark" size={16} color={BRAND} /> : right}
    </Pressable>
  );
}

/**
 * The bar under the view tabs: New task (with its drop-down), Search, Person, Filter, Sort, Hide, Group by.
 * Each tool says what it does behind a "?". `vs` is the view's state; `onChange(patch)` saves a part of it.
 */
export default function BoardToolbar({
  data, vs, onChange, people, search, onSearch, word, onNew, onNewGroup, onImport, desktop, canAdd, kind = 'table',
}) {
  const colors = useColors();
  const [pop, setPop] = useState(null); // { type, anchor }
  const [searchOpen, setSearchOpen] = useState(!!search);
  const inputRef = useRef(null);
  const open = (type) => (e) => setPop({ type, anchor: anchorOf(e) });
  const close = () => setPop(null);
  const lower = word.toLowerCase();

  const filters = vs.filters || {};
  const filterCount = QUICK_FILTERS.filter(([k]) => filters[k]).length;
  const sortCols = data.columns.filter((c) => !['files', 'button'].includes(c.kind));
  const owners = people.filter((p) => data.items.some((t) => t.assignee_id === p.id || (t.members || []).some((m) => m.id === p.id)));

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: BRAND, borderRadius: radius.md, paddingHorizontal: spacing.sm, width: 220 }}>
            <Ionicons name="search" size={15} color={colors.gray[500]} />
            <TextInput
              ref={inputRef} autoFocus value={search} onChangeText={onSearch} placeholder={`Search ${lower}s`} placeholderTextColor={colors.gray[400]}
              onBlur={() => { if (!search) setSearchOpen(false); }}
              style={{ flex: 1, paddingVertical: 6, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
            />
            {!!search && <Pressable onPress={() => { onSearch(''); setSearchOpen(false); }} hitSlop={6} accessibilityLabel="Clear search"><Ionicons name="close" size={15} color={colors.gray[500]} /></Pressable>}
          </View>
        ) : <Tool icon="search-outline" label="Search" onPress={() => setSearchOpen(true)} hint="Find a task by its name or anything in its columns." />}
        <Tool icon="person-circle-outline" label="Person" active={(vs.people || []).length > 0} count={(vs.people || []).length} onPress={open('person')} hint="Show only the tasks of some people." />
        <Tool icon="funnel-outline" label="Filter" active={filterCount > 0} count={filterCount} onPress={open('filter')} hint="Narrow the board down: late tasks, this week, hide finished ones." />
        {kind === 'table' && <Tool icon="swap-vertical-outline" label="Sort" active={!!vs.sort} onPress={open('sort')} hint="Order the tasks inside each group by a column." />}
        {kind === 'table' && <Tool icon="eye-off-outline" label="Hide" active={(vs.hidden || []).length > 0} count={(vs.hidden || []).length} onPress={open('hide')} hint="Hide columns you do not need on this view. The data is not deleted." />}
        {desktop && kind === 'table' && <Tool icon="albums-outline" label="Group by" active={!!vs.group_by} onPress={open('group')} hint="Group the tasks by status or owner instead of by the board's groups." />}
      </ScrollView>

      {pop?.type === 'new' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={260}>
          <Item icon="add-circle-outline" label={`New ${lower}`} onPress={() => { const a = pop.anchor; close(); onNew(a); }}
            right={<Hint text={`Adds a ${lower} to the first group. Press Enter in a group's "+ Add ${lower}" line to add one there.`} />} />
          <Item icon="layers-outline" label="New group" onPress={() => { close(); onNewGroup(); }}
            right={<Hint text="A group is a section of the board, like To-Do or Completed." />} />
          <Item icon="cloud-upload-outline" label={`Import ${lower}s from a file`} onPress={() => { close(); onImport(); }}
            right={<Hint text="Bring many tasks in from a CSV file. You see what will happen before anything is added." />} />
        </Popover>
      )}
      {pop?.type === 'person' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={280}>
          <ScrollView style={{ maxHeight: 320 }}>
            {owners.map((p) => {
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
          {(vs.people || []).length > 0 && <Item icon="close-circle-outline" label="Clear" onPress={() => onChange({ people: [] })} />}
        </Popover>
      )}
      {pop?.type === 'filter' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={260}>
          {QUICK_FILTERS.map(([k, l]) => <Item key={k} label={l} active={!!filters[k]} onPress={() => onChange({ filters: { ...filters, [k]: !filters[k] } })} />)}
          {filterCount > 0 && <Item icon="close-circle-outline" label="Clear all" onPress={() => onChange({ filters: {} })} />}
        </Popover>
      )}
      {pop?.type === 'sort' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={280}>
          <ScrollView style={{ maxHeight: 320 }}>
            {sortCols.map((c) => {
              const on = vs.sort?.column_id === c.id;
              return (
                <Item key={c.id} label={c.title} active={false}
                  onPress={() => onChange({ sort: { column_id: c.id, dir: on && vs.sort.dir === 'asc' ? 'desc' : 'asc' } })}
                  right={on ? <Ionicons name={vs.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={16} color={BRAND} /> : null} />
              );
            })}
          </ScrollView>
          {!!vs.sort && <Item icon="close-circle-outline" label="Clear sort" onPress={() => { onChange({ sort: null }); close(); }} />}
        </Popover>
      )}
      {pop?.type === 'hide' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={260}>
          <ScrollView style={{ maxHeight: 320 }}>
            {data.columns.map((c) => {
              const hidden = (vs.hidden || []).includes(c.id);
              return (
                <Item key={c.id} label={c.title} icon={hidden ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => onChange({ hidden: hidden ? vs.hidden.filter((x) => x !== c.id) : [...(vs.hidden || []), c.id] })} />
              );
            })}
          </ScrollView>
          {(vs.hidden || []).length > 0 && <Item icon="close-circle-outline" label="Show all" onPress={() => onChange({ hidden: [] })} />}
        </Popover>
      )}
      {pop?.type === 'group' && (
        <Popover visible anchor={pop.anchor} onClose={close} width={240}>
          <Item label="The board's groups" active={!vs.group_by} onPress={() => { onChange({ group_by: null }); close(); }} />
          <Item label="Status" active={vs.group_by === 'status'} onPress={() => { onChange({ group_by: 'status' }); close(); }} />
          <Item label="Owner" active={vs.group_by === 'owner'} onPress={() => { onChange({ group_by: 'owner' }); close(); }} />
        </Popover>
      )}
    </View>
  );
}
