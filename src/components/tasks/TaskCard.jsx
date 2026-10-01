import { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Avatar, DueChip, PRIORITY, TodoCheckbox, accent, tint } from '../kit';
import { statusMeta } from '../../utils/taskMeta';

function TaskCard({ task, currentUserId, onPress, onToggle }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const status = statusMeta(task.status);
  const done = task.status === 'completed';
  const priorityColor = PRIORITY[task.priority]?.color || PRIORITY[4].color;
  const bizColor = accent(task.business_color);
  const canTick = task.permissions?.can_change_status && task.status !== 'in_review' && task.status !== 'on_hold';

  const flow = task.assigned_user_id
    ? `${task.created_by === currentUserId ? 'You' : task.created_by_name?.split(' ')[0]} → ${task.assigned_user_id === currentUserId ? 'you' : task.assigned_user_name?.split(' ')[0]}`
    : `${task.created_by === currentUserId ? 'You' : task.created_by_name?.split(' ')[0]} → whole team`;

  return (
    <AnimatedPressable onPress={() => onPress(task)} style={styles.card} haptic="light" scale={0.98}>
      <View style={[styles.stripe, { backgroundColor: task.priority < 4 ? priorityColor : 'transparent' }]} />
      <View style={styles.checkCol}>
        {canTick || done ? (
          <TodoCheckbox checked={done} priority={task.priority} onPress={() => onToggle(task)} />
        ) : (
          <Ionicons name={status.icon} size={22} color={status.color} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>{task.title}</Text>
        </View>
        <View style={styles.bizRow}>
          <View style={[styles.bizDot, { backgroundColor: bizColor }]} />
          <Text style={styles.bizText} numberOfLines={1}>
            {task.business_name}
            {task.source_business_name ? ` · from ${task.source_business_name}` : ''}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.statusPill, { backgroundColor: tint(status.color, 0.12) }]}>
            <Ionicons name={status.icon} size={11} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          <DueChip date={task.due_date} done={done} compact />
          {task.comment_count > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="chatbubble-outline" size={11} color={colors.gray[500]} />
              <Text style={styles.metaText}>{task.comment_count}</Text>
            </View>
          )}
          {task.is_warned && <Ionicons name="warning" size={13} color={colors.red[500]} />}
          {task.pending_delete_request_id && <Ionicons name="trash-bin-outline" size={12} color={colors.red[500]} />}
          <View style={{ flex: 1 }} />
          <Text style={styles.flow} numberOfLines={1}>{flow}</Text>
          {task.assigned_user_id ? (
            <Avatar name={task.assigned_user_name} uri={task.assigned_user_picture} size={22} />
          ) : (
            <View style={styles.teamIcon}><Ionicons name="people" size={12} color={colors.gray[500]} /></View>
          )}
        </View>
        {task.permissions?.can_approve && (
          <View style={styles.reviewBanner}>
            <Ionicons name="shield-checkmark" size={13} color="#b91c1c" />
            <Text style={styles.reviewText}>Waiting for your review</Text>
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  stripe: { width: 3, alignSelf: 'stretch', marginRight: spacing.sm, borderRadius: 2 },
  checkCol: { paddingTop: 1, paddingRight: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.gray[900], lineHeight: 21 },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  bizDot: { width: 8, height: 8, borderRadius: 4 },
  bizText: { fontSize: fontSize.xs, color: colors.gray[500], fontWeight: '500', flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  flow: { fontSize: 11, color: colors.gray[400], maxWidth: 130 },
  teamIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: tint('#b91c1c', 0.1),
    alignSelf: 'flex-start',
  },
  reviewText: { fontSize: 11, fontWeight: '700', color: '#b91c1c' },
});

export default memo(TaskCard);
