import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import ShortcutsSheet from './ShortcutsSheet';
import { Avatar } from './kit';
import { navigationRef } from '../navigation/navigationRef';
import useShortcuts from '../hooks/useShortcuts';
import { todayYmd } from '../utils/dates';

// Which sidebar entry owns which route.
const SECTION_OF = {
  Dashboard: 'home',
  Todos: 'todos',
  ChatList: 'chat',
  ChatThread: 'chat',
  GroupInfo: 'chat',
  Approvals: 'approvals',
  TeamMonitor: 'monitor',
  PersonMonitor: 'monitor',
  Notifications: 'notifications',
  Organization: 'org',
  Profile: 'profile',
};

const TABS = new Set(['Dashboard', 'Todos', 'ChatList']);

function go(name) {
  if (!navigationRef.isReady()) return;
  if (TABS.has(name)) navigationRef.navigate('Main', { screen: name });
  else navigationRef.navigate(name);
}

function Entry({ icon, activeIcon, label, badge, active, onPress, hint }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, paddingHorizontal: spacing.md,
        borderRadius: radius.md, backgroundColor: active ? colors.brand[100] : 'transparent',
      }}
    >
      <Ionicons name={active ? activeIcon || icon : icon} size={19} color={active ? colors.brand[700] : colors.gray[500]} />
      <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: active ? '700' : '500', color: active ? colors.brand[700] : colors.gray[700] }} numberOfLines={1}>
        {label}
      </Text>
      {badge > 0 ? (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : !!hint && (
        <Text style={{ fontSize: 11, color: colors.gray[400], fontWeight: '600' }}>{hint}</Text>
      )}
    </AnimatedPressable>
  );
}

/**
 * Desktop navigation: one persistent column instead of the bottom tab bar. It also owns the
 * "go to" keyboard shortcuts (G then H / T / C / A / M / N / O / P) and the "?" help.
 */
export default function AppSidebar({ routeName }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { totalUnread } = useChat();
  const { todos } = useTodos();
  const { unreadCount, approvalCount } = useNotifications();
  const [help, setHelp] = useState(false);
  const section = SECTION_OF[routeName] || null;

  const today = todayYmd();
  const dueCount = todos.filter((t) => !t.is_done && t.due_date && t.due_date <= today && (!t.business_id || t.assignee_id === user?.id)).length;

  useShortcuts({
    'g h': () => go('Dashboard'),
    'g t': () => go('Todos'),
    'g c': () => go('ChatList'),
    'g a': () => go('Approvals'),
    'g m': () => (user?.can_monitor ? go('TeamMonitor') : false),
    'g n': () => go('Notifications'),
    'g o': () => go('Organization'),
    'g p': () => go('Profile'),
    '?': () => setHelp(true),
  }, true);

  return (
    <View style={styles.wrap}>
      <View style={styles.brand}>
        <View style={styles.logo}><Ionicons name="checkmark" size={18} color="#fff" /></View>
        <Text style={styles.brandText}>TaskHub</Text>
      </View>

      <View style={styles.group}>
        <Entry icon="home-outline" activeIcon="home" label="Home" active={section === 'home'} onPress={() => go('Dashboard')} hint="G H" />
        <Entry icon="checkbox-outline" activeIcon="checkbox" label="To-do" badge={dueCount} active={section === 'todos'} onPress={() => go('Todos')} />
        <Entry icon="chatbubble-outline" activeIcon="chatbubble" label="Chat" badge={totalUnread} active={section === 'chat'} onPress={() => go('ChatList')} />
        <Entry icon="shield-checkmark-outline" activeIcon="shield-checkmark" label="Approvals" badge={approvalCount} active={section === 'approvals'} onPress={() => go('Approvals')} />
        {user?.can_monitor && (
          <Entry icon="speedometer-outline" activeIcon="speedometer" label="Team monitor" active={section === 'monitor'} onPress={() => go('TeamMonitor')} />
        )}
        <Entry icon="notifications-outline" activeIcon="notifications" label="Notifications" badge={unreadCount} active={section === 'notifications'} onPress={() => go('Notifications')} />
        <Entry icon="git-network-outline" activeIcon="git-network" label="Organisation" active={section === 'org'} onPress={() => go('Organization')} />
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.group}>
        <Entry icon="keypad-outline" label="Keyboard shortcuts" hint="?" onPress={() => setHelp(true)} />
        <Entry icon={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onPress={toggleTheme} />
      </View>
      <AnimatedPressable style={styles.me} onPress={() => go('Profile')}>
        <Avatar name={user?.name} uri={user?.profile_picture} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.meName} numberOfLines={1}>{user?.name}</Text>
          <Text style={styles.meRole} numberOfLines={1}>{user?.display_title || `@${user?.username}`}</Text>
        </View>
        <AnimatedPressable onPress={logout} hitSlop={8} accessibilityLabel="Log out">
          <Ionicons name="log-out-outline" size={19} color={colors.gray[400]} />
        </AnimatedPressable>
      </AnimatedPressable>
      <ShortcutsSheet visible={help} onClose={() => setHelp(false)} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    width: 232, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: colors.white, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.xl },
  logo: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.4 },
  group: { gap: 2 },
  me: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, marginTop: spacing.sm, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], backgroundColor: colors.gray[50],
  },
  meName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  meRole: { fontSize: 11, color: colors.gray[500] },
});
