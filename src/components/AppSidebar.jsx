import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { spacing, radius, fontSize, type } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from './AnimatedPressable';
import ShortcutsSheet from './ShortcutsSheet';
import { Avatar } from './kit';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { usePanel } from './Panel';
import { SlideGroup, SlideItem } from './SlideGroup';
import { useEngage } from '../context/EngageContext';
import { openPalette, on } from '../utils/events';
import { navigationRef } from '../navigation/navigationRef';
import useShortcuts from '../hooks/useShortcuts';
import { useHint } from '../utils/shortcutRegistry';
import { todayYmd } from '../utils/dates';

// Which sidebar entry owns which route.
const SECTION_OF = {
  Dashboard: 'home',
  Progress: 'progress',
  Recap: 'progress',
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

const FULL = 232;
const RAIL = 76;

function Entry({ icon, activeIcon, label, badge, active, onPress, hint, p }) {
  const colors = useColors();
  // Labels fade out before the sidebar is narrow enough to clip them; the badge becomes a dot on the icon.
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (p.value - 0.4) / 0.6)) }));
  const dot = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (0.6 - p.value) / 0.6)) }));
  return (
    <SlideItem active={active}>
    <AnimatedPressable
      onPress={onPress}
      accessibilityLabel={label}
      water
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, paddingHorizontal: spacing.md,
        borderRadius: radius.lg, overflow: 'hidden',
      }}
    >
      <View style={{ width: 28, alignItems: 'center', marginLeft: -4, marginRight: -4 }}>
        <Ionicons name={active ? activeIcon || icon : icon} size={19} color={active ? colors.brand[700] : colors.gray[500]} />
        {badge > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -2, right: 2, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand[600], borderWidth: 1.5, borderColor: '#fff' }, dot]} />}
      </View>
      <Animated.Text style={[{ flex: 1, ...type.callout, fontSize: fontSize.base, fontWeight: active ? '700' : '600', color: active ? colors.brand[700] : colors.gray[700] }, fade]} numberOfLines={1}>
        {label}
      </Animated.Text>
      <Animated.View style={fade}>
        {badge > 0 ? (
          <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : !!hint && (
          <Text style={{ ...type.label, color: colors.gray[500] }}>{hint}</Text>
        )}
      </Animated.View>
    </AnimatedPressable>
    </SlideItem>
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
  const { myDay } = useEngage();
  const dayBadge = (myDay?.waiting_on_you || []).length;
  const [help, setHelp] = useState(false);
  const panel = usePanel('app.sidebar');
  const p = panel.p;
  const hint = useHint();
  useEffect(() => on('shortcuts:open', () => setHelp(true)), []);
  const section = SECTION_OF[routeName] || null;

  const today = todayYmd();
  const dueCount = todos.filter((t) => !t.is_done && t.due_date && t.due_date <= today && (!t.business_id || t.assignee_id === user?.id)).length;

  useShortcuts({
    'nav.home': () => go('Dashboard'),
    'nav.progress': () => go('Progress'),
    'nav.todos': () => go('Todos'),
    'nav.chat': () => go('ChatList'),
    'nav.approvals': () => go('Approvals'),
    'nav.monitor': () => (user?.can_monitor ? go('TeamMonitor') : false),
    'nav.notifications': () => go('Notifications'),
    'nav.org': () => go('Organization'),
    'nav.profile': () => go('Profile'),
    'app.help': () => setHelp(true),
    'app.sidebar': () => panel.toggle(),
  }, true);

  // The sidebar narrows to an icon rail (not away: it is how you move around) and widens again, as one spring.
  const widthStyle = useAnimatedStyle(() => ({ width: RAIL + (FULL - RAIL) * Math.min(1.02, p.value) }));
  const navWidth = useAnimatedStyle(() => ({ width: (RAIL - 24) + (FULL - RAIL) * Math.min(1.02, p.value), overflow: 'hidden' }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (p.value - 0.4) / 0.6)) }));

  return (
    <Animated.View style={[{ zIndex: 6 }, widthStyle]}>
    <View {...glass('bar')} style={styles.wrap}>
    <View style={styles.inner}>
      <View style={styles.brand}>
        <View style={styles.logo}><Ionicons name="checkmark" size={18} color="#fff" /></View>
        <Animated.Text style={[styles.brandText, fadeStyle]} numberOfLines={1}>TaskHub</Animated.Text>
      </View>

      <Animated.View style={navWidth}>
      <SlideGroup style={styles.group} pillStyle={{ borderRadius: radius.lg }}>
        <Entry p={p} icon="search-outline" label="Search" hint={hint('app.palette')} onPress={openPalette} />
        <Entry p={p} icon="home-outline" activeIcon="home" label="Home" active={section === 'home'} onPress={() => go('Dashboard')} hint={hint('nav.home')} />
        <Entry p={p} icon="sunny-outline" activeIcon="sunny" label="Progress" badge={dayBadge} active={section === 'progress'} onPress={() => go('Progress')} hint={hint('nav.progress')} />
        <Entry p={p} icon="checkbox-outline" activeIcon="checkbox" label="To-do" badge={dueCount} active={section === 'todos'} onPress={() => go('Todos')} />
        <Entry p={p} icon="chatbubble-outline" activeIcon="chatbubble" label="Chat" badge={totalUnread} active={section === 'chat'} onPress={() => go('ChatList')} />
        <Entry p={p} icon="shield-checkmark-outline" activeIcon="shield-checkmark" label="Approvals" badge={approvalCount} active={section === 'approvals'} onPress={() => go('Approvals')} />
        {user?.can_monitor && (
          <Entry p={p} icon="speedometer-outline" activeIcon="speedometer" label="Team monitor" active={section === 'monitor'} onPress={() => go('TeamMonitor')} />
        )}
        <Entry p={p} icon="notifications-outline" activeIcon="notifications" label="Notifications" badge={unreadCount} active={section === 'notifications'} onPress={() => go('Notifications')} />
        <Entry p={p} icon="git-network-outline" activeIcon="git-network" label="Organisation" active={section === 'org'} onPress={() => go('Organization')} />
      </SlideGroup>
      </Animated.View>

      <View style={{ flex: 1 }} />

      <View style={styles.group}>
        <Entry p={p} icon={panel.open ? 'chevron-back-outline' : 'chevron-forward-outline'} label={panel.open ? 'Collapse sidebar' : 'Expand sidebar'} hint={hint('app.sidebar')} onPress={panel.toggle} />
        <Entry p={p} icon="keypad-outline" label="Keyboard shortcuts" hint={hint('app.help')} onPress={() => setHelp(true)} />
        <Entry p={p} icon={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onPress={toggleTheme} />
      </View>
      <AnimatedPressable style={styles.me} onPress={() => go('Profile')} {...glass('inset')}>
        <Avatar name={user?.name} uri={user?.profile_picture} size={34} />
        <Animated.View style={[{ flex: 1 }, fadeStyle]}>
          <Text style={styles.meName} numberOfLines={1}>{user?.name}</Text>
          <Text style={styles.meRole} numberOfLines={1}>{user?.display_title || `@${user?.username}`}</Text>
        </Animated.View>
        <Animated.View style={fadeStyle}>
          <AnimatedPressable onPress={logout} hitSlop={8} accessibilityLabel="Log out">
            <Ionicons name="log-out-outline" size={19} color={colors.gray[400]} />
          </AnimatedPressable>
        </Animated.View>
      </AnimatedPressable>
      <ShortcutsSheet visible={help} onClose={() => setHelp(false)} />
    </View>
    </View>
    </Animated.View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    flex: 1, overflow: 'hidden',
    backgroundColor: colors.white, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
  },
  inner: { width: FULL, flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 11, paddingBottom: spacing.xl },
  logo: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 14px -4px rgba(220,38,38,0.55)' },
  brandText: { ...type.headline, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  group: { gap: 2 },
  me: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, marginTop: spacing.sm, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], backgroundColor: colors.gray[50],
  },
  meName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  meRole: { fontSize: 11, color: colors.gray[500] },
});
