import { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { SectionHeader } from '../kit';
import TodoItem from './TodoItem';
import { buildTree, subtaskProgress } from '../../utils/todoMeta';

/**
 * To-dos grouped in sections, each to-do followed by its sub-tasks at any depth.
 * sections = [{ key, title?, items, color?, right?, empty? }]. Rows share the callbacks in `row`.
 */
function TodoTreeList({
  sections, todos, listById, collapsed, onToggleCollapse, dragHandle, row, groupKey = (s) => s.key, hideDone = false,
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderNode = useCallback((node, depth, section) => {
    const t = node.todo;
    const isCollapsed = collapsed.has(t.id);
    const visibleChildren = hideDone ? node.children.filter((c) => !c.todo.is_done) : node.children;
    return (
      <View key={t.id} dataSet={{ todoRow: String(t.id), group: groupKey(section) }}>
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
      </View>
    );
  }, [collapsed, hideDone, groupKey, listById, row, todos, onToggleCollapse, dragHandle]);

  return (
    <View>
      {sections.map((section) => (
        <View key={section.key}>
          {!!section.title && (
            <SectionHeader
              title={section.title}
              count={section.count ?? (section.items.length || undefined)}
              color={section.color}
              right={section.right}
            />
          )}
          {buildTree(section.items, todos).map((node) => renderNode(node, 0, section))}
          {section.items.length === 0 && !!section.empty && <Text style={styles.empty}>{section.empty}</Text>}
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  empty: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: spacing.sm, paddingLeft: spacing.xs },
});

export default memo(TodoTreeList);
