import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay } from 'react-native-reanimated';
import { useColors, useTheme } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import SmartImage from './SmartImage';
import { formatDue, formatTime, daysFromToday, RECURRENCE_LABELS } from '../utils/dates';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const NAMED = {
  indigo: '#6366f1', red: '#ef4444', orange: '#f97316', amber: '#f59e0b', green: '#22c55e',
  teal: '#14b8a6', blue: '#3b82f6', purple: '#a855f7', pink: '#ec4899', gray: '#94a3b8',
};
export const COLOR_NAMES = Object.keys(NAMED);

export function accent(name) {
  return NAMED[name] || NAMED.indigo;
}

/** Translucent tint of a hex colour for backgrounds that work in both themes. */
export function tint(hex, alpha = 0.14) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Todoist-style priority colours.
export const PRIORITY = {
  1: { label: 'Priority 1', short: 'P1', color: '#dc4c3e' },
  2: { label: 'Priority 2', short: 'P2', color: '#eb8909' },
  3: { label: 'Priority 3', short: 'P3', color: '#246fe0' },
  4: { label: 'Priority 4', short: 'P4', color: '#94a3b8' },
};

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6', '#0ea5e9', '#22c55e', '#ef4444', '#eab308'];

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function colorFor(key) {
  const s = String(key || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------
export const Avatar = memo(function Avatar({ name, uri, size = 36, online, ring }) {
  const colors = useColors();
  const bg = colorFor(name);
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <SmartImage source={uri} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }} />
      ) : (
        <View style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: ring ? 2 : 0,
          borderColor: colors.white,
        }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: Math.max(10, size * 0.38) }}>{initials(name)}</Text>
        </View>
      )}
      {online && (
        <View style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: size * 0.15,
          backgroundColor: colors.green[500],
          borderWidth: 2,
          borderColor: colors.white,
        }}
        />
      )}
    </View>
  );
});

export const AvatarStack = memo(function AvatarStack({ people = [], size = 22, max = 3 }) {
  const colors = useColors();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View key={p.id ?? i} style={{ marginLeft: i === 0 ? 0 : -size * 0.35, borderRadius: size, borderWidth: 1.5, borderColor: colors.white }}>
          <Avatar name={p.name} uri={p.profile_picture} size={size} />
        </View>
      ))}
      {extra > 0 && (
        <Text style={{ marginLeft: 4, fontSize: fontSize.xs, color: colors.gray[500], fontWeight: '600' }}>+{extra}</Text>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Chips & badges
// ---------------------------------------------------------------------------
export const Chip = memo(function Chip({ label, icon, color, active, onPress, onRemove, small, style }) {
  const colors = useColors();
  const tone = color || colors.brand[600];
  const content = (
    <View style={[
      chipStyles.chip,
      small && chipStyles.small,
      {
        backgroundColor: active ? tone : tint(tone.startsWith('#') ? tone : '#6366f1', 0.12),
        borderColor: active ? tone : 'transparent',
      },
      style,
    ]}
    >
      {icon && <Ionicons name={icon} size={small ? 12 : 14} color={active ? colors.white : tone} />}
      <Text style={[chipStyles.label, small && chipStyles.labelSmall, { color: active ? colors.white : tone }]} numberOfLines={1}>{label}</Text>
      {onRemove && (
        <AnimatedPressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close" size={14} color={active ? colors.white : tone} />
        </AnimatedPressable>
      )}
    </View>
  );
  if (!onPress) return content;
  return <AnimatedPressable onPress={onPress} haptic="light">{content}</AnimatedPressable>;
});

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 8, paddingVertical: 3 },
  label: { fontSize: fontSize.sm, fontWeight: '600', maxWidth: 180 },
  labelSmall: { fontSize: 11 },
});

/** Due date chip: red when overdue, green for today, purple for tomorrow/this week. */
export const DueChip = memo(function DueChip({ date, time, recurrence, done, compact }) {
  const colors = useColors();
  if (!date) return null;
  const diff = daysFromToday(date);
  const color = done ? colors.gray[400]
    : diff < 0 ? '#dc4c3e'
      : diff === 0 ? '#058527'
        : diff === 1 ? '#ad6200'
          : diff < 7 ? '#692ec2' : colors.gray[500];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name={recurrence ? 'repeat' : 'calendar-clear-outline'} size={compact ? 11 : 12} color={color} />
      <Text style={{ fontSize: compact ? 11 : 12, color, fontWeight: '500' }}>
        {formatDue(date)}{time ? ` ${formatTime(time)}` : ''}
      </Text>
      {recurrence && !compact && (
        <Text style={{ fontSize: 11, color: colors.gray[400] }}>· {RECURRENCE_LABELS[recurrence]}</Text>
      )}
    </View>
  );
});

export const PriorityFlag = memo(function PriorityFlag({ priority, size = 14 }) {
  if (!priority || priority === 4) return null;
  return <Ionicons name="flag" size={size} color={PRIORITY[priority].color} />;
});

// ---------------------------------------------------------------------------
// Animated Todoist-style checkbox
// ---------------------------------------------------------------------------
export const TodoCheckbox = memo(function TodoCheckbox({ checked, priority = 4, onPress, size = 22 }) {
  const colors = useColors();
  const tone = PRIORITY[priority]?.color || PRIORITY[4].color;
  const fill = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    fill.value = withTiming(checked ? 1 : 0, { duration: 180 });
    if (checked) {
      pop.value = 0.7;
      pop.value = withSpring(1, { damping: 8, stiffness: 320, mass: 0.5 });
    }
  }, [checked, fill, pop]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: fill.value > 0.5 ? tone : tint(tone, priority === 4 ? 0 : 0.1),
    transform: [{ scale: pop.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.6 + fill.value * 0.4 }] }));

  return (
    <AnimatedPressable onPress={onPress} haptic="medium" hitSlop={10} scale={0.85}>
      <Animated.View style={[{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: tone,
        alignItems: 'center',
        justifyContent: 'center',
      }, boxStyle]}
      >
        <Animated.View style={checkStyle}>
          <Ionicons name="checkmark" size={size * 0.7} color={colors.white} />
        </Animated.View>
      </Animated.View>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Buttons / layout bits
// ---------------------------------------------------------------------------
export function Fab({ onPress, icon = 'add', bottom = 24, color, label }) {
  const { theme } = useTheme();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(150, withSpring(1, { damping: 12, stiffness: 180, mass: 0.7 }));
  }, [enter]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: enter.value }] }));
  const bg = color || (theme === 'dark' ? '#e05a4f' : '#dc4c3e');
  return (
    <Animated.View style={[{ position: 'absolute', right: spacing.xl, bottom }, style]}>
      <AnimatedPressable
        onPress={onPress}
        haptic="medium"
        style={{
          height: 56,
          minWidth: 56,
          paddingHorizontal: label ? spacing.xl : 0,
          borderRadius: 28,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          shadowColor: bg,
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Ionicons name={icon} size={28} color="#fff" />
        {label && <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.md }}>{label}</Text>}
      </AnimatedPressable>
    </Animated.View>
  );
}

export function IconButton({ icon, onPress, color, size = 22, badge, style, accessibilityLabel }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      hitSlop={6}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Ionicons name={icon} size={size} color={color || colors.gray[600]} />
      {badge > 0 && (
        <View style={{
          position: 'absolute', top: 4, right: 2, minWidth: 16, height: 16, borderRadius: 8,
          backgroundColor: colors.red[500], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
        }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

export function SectionHeader({ title, count, right, color, style }) {
  const colors = useColors();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.lg, paddingBottom: spacing.sm }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: color || colors.gray[800] }}>{title}</Text>
        {count !== undefined && <Text style={{ fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '600' }}>{count}</Text>}
      </View>
      {right}
    </View>
  );
}

/** Friendly empty state with a bouncing icon. */
export function EmptyHero({ icon = 'sparkles', title, message, color, action }) {
  const colors = useColors();
  const bounce = useSharedValue(0.6);
  useEffect(() => {
    bounce.value = withSpring(1, { damping: 7, stiffness: 140, mass: 0.8 });
  }, [bounce]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }], opacity: Math.min(1, bounce.value) }));
  const tone = color || colors.brand[500];
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl }}>
      <Animated.View style={[{
        width: 88, height: 88, borderRadius: 44, backgroundColor: tint(tone.startsWith('#') ? tone : '#6366f1', 0.14),
        alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
      }, iconStyle]}
      >
        <Ionicons name={icon} size={40} color={tone} />
      </Animated.View>
      {!!title && <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], textAlign: 'center' }}>{title}</Text>}
      {!!message && <Text style={{ fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 }}>{message}</Text>}
      {action && <View style={{ marginTop: spacing.lg }}>{action}</View>}
    </View>
  );
}

/** Circular progress ring built from two half-circles (no SVG needed). */
export function ProgressRing({ percent = 0, size = 44, stroke = 5, color, children }) {
  const colors = useColors();
  const tone = color || colors.brand[600];
  const p = Math.max(0, Math.min(100, percent));
  const deg = (p / 100) * 360;
  const half = size / 2;
  const styles = useMemo(() => ({
    base: { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: colors.gray[200], position: 'absolute' },
    halfWrap: { width: half, height: size, position: 'absolute', overflow: 'hidden' },
    halfCircle: { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: tone, position: 'absolute' },
  }), [size, half, stroke, colors.gray, tone]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={styles.base} />
      {/* right half */}
      <View style={[styles.halfWrap, { left: half }]}>
        <View style={[styles.halfCircle, {
          left: -half,
          borderLeftColor: 'transparent',
          borderBottomColor: 'transparent',
          transform: [{ rotate: `${Math.min(deg, 180) - 135}deg` }],
          opacity: p > 0 ? 1 : 0,
        }]}
        />
      </View>
      {/* left half */}
      <View style={[styles.halfWrap, { left: 0 }]}>
        <View style={[styles.halfCircle, {
          left: 0,
          borderRightColor: 'transparent',
          borderTopColor: 'transparent',
          transform: [{ rotate: `${Math.max(deg - 180, 0) - 135}deg` }],
          opacity: p > 50 ? 1 : 0,
        }]}
        />
      </View>
      {children}
    </View>
  );
}
