import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { glass } from '../../theme/glass';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { SlideGroup, SlideItem } from '../SlideGroup';
import { ListGlyph } from '../kit';
import { BUILTIN_FILTERS } from '../../utils/todoMeta';

function Item({ icon, glyph, label, count, active, onPress, indent, urgent, onMenu }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <SlideItem active={active}>
    <AnimatedPressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      water
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 7, paddingHorizontal: spacing.md,
        borderRadius: radius.md, marginLeft: indent ? spacing.md : 0,
      }}
    >
      {glyph || <Ionicons name={icon} size={17} color={active ? colors.brand[700] : colors.gray[500]} />}
      <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: active ? '700' : '500', color: active ? colors.brand[700] : colors.gray[700] }} numberOfLines={1}>
        {label}
      </Text>
      {count > 0 && !hover && (
        <Text style={{ fontSize: 12, fontWeight: '600', color: urgent ? colors.brand[600] : colors.gray[400] }}>{count}</Text>
      )}
      {!!onMenu && (hover || active) && (
        <AnimatedPressable onPress={onMenu} hitSlop={8} accessibilityLabel={`${label} options`}>
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </AnimatedPressable>
    </SlideItem>
  );
}

function Heading({ children, right }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: 4 }}>
      <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.8 }}>{children}</Text>
      {right}
    </View>
  );
}

/**
 * Left pane of the desktop to-do screen: personal views, lists, filters, labels, then one entry per
 * business (the business to-dos everyone in it can see).
 */
export default function WorkSidebar({
  view, onView, counts, lists, filters, labels, businesses, bizCounts, approvalCount, canMonitor,
  onAdd, onNewList, onApprovals, onMonitor, onFilters, simple = false, favorites = [], onItemMenu, extraLinks = [],
}) {
  // Filters and labels are for people who already use the app a lot, so they start folded away.
  const [showMore, setShowMore] = useState(false);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const favoriteRows = useMemo(() => favorites.map((f) => {
    if (f.kind === 'list') {
      const l = lists.find((x) => String(x.id) === String(f.ref));
      return l && { ...f, label: l.name, view: `list:${l.id}`, glyph: <ListGlyph list={l} size={17} color={colors.gray[500]} />, item: l };
    }
    if (f.kind === 'filter') {
      const b = BUILTIN_FILTERS.find((x) => String(x.id) === String(f.ref));
      const c = filters.find((x) => String(x.id) === String(f.ref));
      const found = c || b;
      return found && { ...f, label: found.name, view: `filter:${found.id}`, icon: c ? 'funnel-outline' : `${b.icon}-outline`, item: c || { ...b, builtin: true } };
    }
    return { ...f, label: `+${f.ref}`, view: `label:${f.ref}`, icon: 'pricetag-outline', item: { name: f.ref } };
  }).filter(Boolean), [favorites, lists, filters, colors]);
  return (
    <View {...glass('bar')} style={styles.wrap}>
      <AnimatedPressable style={styles.add} onPress={onAdd}>
        <Ionicons name="add" size={19} color="#fff" />
        <Text style={styles.addText}>Add to-do</Text>
        <Text style={styles.addKey}>Q</Text>
      </AnimatedPressable>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <SlideGroup pillStyle={{ borderRadius: radius.md }}>
        <Heading>My work</Heading>
        <Item icon="today-outline" label="Today" count={counts.today} urgent active={view === 'today'} onPress={() => onView('today')} />
        <Item icon="calendar-outline" label="Upcoming" active={view === 'upcoming'} onPress={() => onView('upcoming')} />
        <Item icon="file-tray-outline" label="Inbox" count={counts.inbox} active={view === 'inbox'} onPress={() => onView('inbox')} />
        <Item icon="person-add-outline" label="Assigned" count={counts.assigned} urgent active={view === 'assigned'} onPress={() => onView('assigned')} />
        <Item icon="people-outline" label="Shared" count={counts.shared} active={view === 'shared'} onPress={() => onView('shared')} />
        <Item icon="checkmark-done-outline" label="Completed" active={view === 'done'} onPress={() => onView('done')} />

        {favoriteRows.length > 0 && (
          <>
            <Heading>Favourites</Heading>
            {favoriteRows.map((f) => (
              <Item
                key={`${f.kind}:${f.ref}`}
                icon={f.icon}
                glyph={f.glyph}
                label={f.label}
                active={view === f.view}
                onPress={() => onView(f.view)}
                onMenu={onItemMenu ? () => onItemMenu(f.kind, f.item) : undefined}
              />
            ))}
          </>
        )}

        {businesses.length > 0 && (
          <>
            <Heading>Businesses</Heading>
            {businesses.map((b) => (
              <Item
                key={b.id}
                icon="briefcase-outline"
                label={b.name}
                count={bizCounts[b.id]}
                active={view === `biz:${b.id}`}
                onPress={() => onView(`biz:${b.id}`)}
              />
            ))}
          </>
        )}

        <Heading right={(
          <AnimatedPressable onPress={onNewList} hitSlop={8} accessibilityLabel="New list">
            <Ionicons name="add" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        )}
        >
          Lists
        </Heading>
        {lists.map((l) => (
          <Item
            key={l.id}
            glyph={<ListGlyph list={l} size={17} color={view === `list:${l.id}` ? colors.brand[700] : colors.gray[500]} />}
            label={l.name}
            count={counts.lists[l.id]}
            active={view === `list:${l.id}`}
            onPress={() => onView(`list:${l.id}`)}
            onMenu={onItemMenu ? () => onItemMenu('list', l) : undefined}
          />
        ))}
        {lists.length === 0 && <Text style={styles.hint}>Group to-dos into lists like Home or Finance.</Text>}

        {!simple && (
          <AnimatedPressable style={styles.moreRow} onPress={() => setShowMore((v) => !v)}>
            <Ionicons name={showMore ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.gray[400]} />
            <Text style={styles.moreText}>Filters and labels</Text>
          </AnimatedPressable>
        )}
        {!simple && showMore && (
          <View>
        <Heading right={(
          <AnimatedPressable onPress={onFilters} hitSlop={8} accessibilityLabel="All filters">
            <Ionicons name="options-outline" size={16} color={colors.gray[400]} />
          </AnimatedPressable>
        )}
        >
          Filters
        </Heading>
        {BUILTIN_FILTERS.slice(0, 3).map((f) => (
          <Item key={f.id} icon={`${f.icon}-outline`} label={f.name} active={view === `filter:${f.id}`} onPress={() => onView(`filter:${f.id}`)} onMenu={onItemMenu ? () => onItemMenu('filter', { ...f, builtin: true }) : undefined} />
        ))}
        {filters.map((f) => (
          <Item key={f.id} icon="funnel-outline" label={f.name} active={view === `filter:${f.id}`} onPress={() => onView(`filter:${f.id}`)} onMenu={onItemMenu ? () => onItemMenu('filter', f) : undefined} />
        ))}

        {labels.length > 0 && (
          <>
            <Heading>Labels</Heading>
            {labels.slice(0, 8).map((l) => (
              <Item key={l.name} icon="pricetag-outline" label={l.name} count={l.count} active={view === `label:${l.name}`} onPress={() => onView(`label:${l.name}`)} onMenu={onItemMenu ? () => onItemMenu('label', l) : undefined} />
            ))}
          </>
        )}

          </View>
        )}

        <Heading>Oversight</Heading>
        <Item icon="shield-checkmark-outline" label="Approvals" count={approvalCount} urgent onPress={onApprovals} />
        {canMonitor && <Item icon="speedometer-outline" label="Team monitor" onPress={onMonitor} />}
        {extraLinks.map((l) => <Item key={l.key} icon={l.icon} label={l.label} onPress={l.onPress} />)}
        </SlideGroup>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    width: 252, paddingHorizontal: spacing.sm, paddingTop: spacing.lg, backgroundColor: colors.white,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
  },
  add: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.md,
    paddingVertical: 9, paddingHorizontal: spacing.md, marginBottom: spacing.xs,
  },
  addText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: fontSize.base },
  addKey: {
    color: '#fff', fontSize: 11, fontWeight: '700', opacity: 0.85, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: 4 },
  moreText: { fontSize: 11, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.8 },
  hint: { fontSize: 12, color: colors.gray[400], paddingHorizontal: spacing.md, paddingVertical: 4, lineHeight: 17 },
});
