import { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { PRIORITY } from './kit';
import { STATUS } from '../utils/timeline';
import { formatDue } from '../utils/dates';

/**
 * Card for tasks shared into a chat (message.meta.kind === 'task'). It is a snapshot taken
 * when the task was shared; "Open task" loads the live task, and the server decides whether
 * the reader may see it.
 */
function SharedTaskCard({ meta, isOwn }) {
  const colors = useColors();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);
  const tasks = meta.tasks?.length ? meta.tasks : (meta.task ? [meta.task] : []);
  const subtle = isOwn ? 'rgba(255,255,255,0.8)' : colors.gray[500];

  return (
    <View style={{ gap: spacing.xs }}>
      {tasks.map((task) => {
        // Cards shared before tasks became to-dos carry the old status names.
        const key = task.status === 'pending' ? 'todo' : task.status === 'completed' ? 'done' : task.status;
        const status = { ...(STATUS[key] || STATUS.todo), color: colors.brand[600] };
        const priority = PRIORITY[task.priority];
        return (
          <View key={task.id} style={styles.card}>
            <View style={styles.header}>
              <Ionicons name="clipboard-outline" size={16} color={isOwn ? colors.white : colors.brand[600]} />
              <Text style={[styles.kind, { color: subtle }]} numberOfLines={1}>Task{task.business_name ? ` · ${task.business_name}` : ''}</Text>
              {priority && task.priority < 4 && <Ionicons name="flag" size={13} color={isOwn ? colors.white : priority.color} />}
            </View>
            <Text style={styles.title} numberOfLines={3}>{task.title}</Text>
            {!!task.description && <Text style={[styles.desc, { color: subtle }]} numberOfLines={3}>{task.description}</Text>}
            <View style={styles.facts}>
              <View style={styles.fact}>
                <Ionicons name={status.icon} size={13} color={isOwn ? colors.white : status.color} />
                <Text style={[styles.factText, { color: isOwn ? colors.white : status.color }]}>{status.label}</Text>
              </View>
              {!!task.due_date && (
                <View style={styles.fact}>
                  <Ionicons name="calendar-clear-outline" size={13} color={subtle} />
                  <Text style={[styles.factText, { color: subtle }]}>{formatDue(task.due_date)}</Text>
                </View>
              )}
              {!!task.assigned_user_name && (
                <View style={styles.fact}>
                  <Ionicons name="person-outline" size={13} color={subtle} />
                  <Text style={[styles.factText, { color: subtle }]} numberOfLines={1}>{task.assigned_user_name}</Text>
                </View>
              )}
            </View>
            <AnimatedPressable onPress={() => navigation.navigate('Main', { screen: 'Todos', params: { highlightId: task.id } })} haptic="medium" style={styles.openBtn}>
              <Text style={styles.openText}>Open task</Text>
              <Ionicons name="arrow-forward" size={14} color={isOwn ? colors.brand[600] : colors.white} />
            </AnimatedPressable>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors, isOwn) => StyleSheet.create({
  card: {
    minWidth: 240,
    maxWidth: 320,
    marginTop: 2,
    marginBottom: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: isOwn ? 'rgba(255,255,255,0.14)' : colors.gray[50],
    borderWidth: isOwn ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  kind: { flex: 1, fontSize: 11, fontWeight: '700' },
  title: { fontSize: fontSize.base, fontWeight: '800', color: isOwn ? colors.white : colors.gray[900] },
  desc: { fontSize: fontSize.sm, marginTop: 3 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 },
  factText: { fontSize: 11, fontWeight: '600' },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: isOwn ? colors.white : colors.brand[600],
  },
  openText: { fontWeight: '700', fontSize: fontSize.sm, color: isOwn ? colors.brand[600] : colors.white },
});

export default memo(SharedTaskCard);
