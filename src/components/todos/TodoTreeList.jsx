import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import useReducedMotion from '../../hooks/useReducedMotion';
import { SPRING } from '../../theme/motion';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { SectionHeader } from '../kit';
import TodoItem from './TodoItem';
import { AddSectionLine } from './SectionTools';
import { buildTree, subtaskProgress } from '../../utils/todoMeta';

// Rows spring in when they are added, spring away when they leave, and their neighbours glide into the gap.
// Everything is the same spring family (SPRING.layout) so the list moves as one material.
const { mass, stiffness, damping } = SPRING.layout;
const ENTER = FadeInDown.springify().mass(mass).stiffness(stiffness).damping(damping);
const EXIT = FadeOutLeft.springify().mass(mass).stiffness(stiffness).damping(damping + 4);
const SHIFT = LinearTransition.springify().mass(mass).stiffness(stiffness).damping(damping);

/**
 * To-dos grouped in sections, each to-do followed by its sub-tasks at any depth.
 * sections = [{ key, title?, items, color?, right?, empty? }]. Rows share the callbacks in `row`.
 */
function TodoTreeList({
  sections, todos, listById, collapsed, onToggleCollapse, dragHandle, row, groupKey = (s) => s.key, hideDone = false,
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reduced = useReducedMotion();

  // Only to-dos that were not here before animate in. The first render (opening a view) and rows that
  // were merely filtered back in stay still, so a long list never cascades.
  const known = useRef(null);
  if (known.current === null) known.current = new Set(todos.map((t) => t.id));
  useEffect(() => { todos.forEach((t) => known.current.add(t.id)); }, [todos]);

  const renderNode = useCallback((node, depth, section) => {
    const t = node.todo;
    const isCollapsed = collapsed.has(t.id);
    const visibleChildren = hideDone ? node.children.filter((c) => !c.todo.is_done) : node.children;
    const fresh = !reduced && !known.current.has(t.id);
    return (
      <Animated.View
        key={t.id}
        dataSet={{ todoRow: String(t.id), group: groupKey(section) }}
        entering={fresh ? ENTER : undefined}
        exiting={reduced ? undefined : EXIT}
        layout={reduced ? undefined : SHIFT}
      >
        <TodoItem
          todo={t}
          list={listById?.get(t.list_id)}
          showList={row.showList}
          showBusiness={row.showBusiness}
          currentUserId={row.currentUserId}
          highlighted={row.highlightId === t.id}
          active={row.activeId === t.id}
          onToggle={row.onToggle}
          onOpen={row.onOpen}
          onDelete={row.onDelete}
          progress={subtaskProgress(t, todos)}
          depth={depth}
          hasChildren={node.children.length > 0}
          parentTitle={depth === 0 ? node.parent?.title : undefined}
          selectMode={row.selectMode}
          selected={row.selected?.has(t.id)}
          onSelect={row.onSelect}
          collapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          dragHandle={depth === 0 ? dragHandle : null}
          now={row.now}
        />
        {!isCollapsed && visibleChildren.map((child) => renderNode(child, depth + 1, section))}
      </Animated.View>
    );
  }, [collapsed, hideDone, groupKey, listById, row, todos, onToggleCollapse, dragHandle, reduced]);

  return (
    <View>
      {sections.map((section) => (
        <View key={section.key}>
          {!!section.addAbove && <AddSectionLine onPress={section.addAbove} />}
          {!!section.title && (
            <SectionHeader
              title={section.title}
              count={section.count ?? (section.items.length || undefined)}
              color={section.color}
              right={section.right}
            />
          )}
          {!!section.description && <Text style={styles.sectionNote}>{section.description}</Text>}
          {buildTree(section.items, todos).map((node) => renderNode(node, 0, section))}
          {section.items.length === 0 && !!section.empty && <Text style={styles.empty}>{section.empty}</Text>}
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  sectionNote: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: -4, marginBottom: spacing.sm, paddingLeft: spacing.xs },
  empty: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: spacing.sm, paddingLeft: spacing.xs },
});

export default memo(TodoTreeList);
