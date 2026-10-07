import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
import TodayIcon from './TodayIcon';
import { Avatar, ListGlyph } from './kit';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { usePanel } from './Panel';
import { SlideGroup, SlideItem } from './SlideGroup';
import { useEngage } from '../context/EngageContext';
import { openPalette, openQuickAdd, emit, on } from '../utils/events';
import { navigationRef } from '../navigation/navigationRef';
import useShortcuts from '../hooks/useShortcuts';
import useTodoCounts from '../hooks/useTodoCounts';
import { useHint } from '../utils/shortcutRegistry';
import { useTodoView, openTodoView } from '../utils/todoView';

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

const TABS = new Set(['Dashboard', 'Todos', 'ChatList', 'Browse']);

function go(name) {
  if (!navigationRef.isReady()) return;
  if (TABS.has(name)) navigationRef.navigate('Main', { screen: name });
  else navigationRef.navigate(name);
}

const FULL = 260;
const RAIL = 76;

function Entry({ icon, activeIcon, glyph, label, count, badge, active, onPress, hint, p, accent }) {
  const colors = useColors();
  // Labels fade out before the sidebar is narrow enough to clip them; the badge becomes a dot on the icon.
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (p.value - 0.4) / 0.6)) }));
  const dot = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (0.6 - p.value) / 0.6)) }));
  const tone = accent ? colors.brand[600] : active ? colors.brand[700] : colors.gray[600];
  return (
    <SlideItem active={active}>
    <AnimatedPressable
      onPress={onPress}
      accessibilityLabel={label}
      water
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 7, paddingHorizontal: spacing.md,
        borderRadius: radius.md, overflow: 'hidden',
      }}
    >
      <View style={{ width: 28, alignItems: 'center', marginLeft: -4, marginRight: -4 }}>
        {glyph || <Ionicons name={active ? activeIcon || icon : icon} size={accent ? 22 : 19} color={tone} />}
        {badge > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -2, right: 2, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand[600], borderWidth: 1.5, borderColor: '#fff' }, dot]} />}
      </View>
      <Animated.Text
        style={[{ flex: 1, ...type.callout, fontSize: fontSize.base, fontWeight: accent || active ? '700' : '500', color: accent ? colors.brand[600] : active ? colors.brand[700] : colors.gray[800] }, fade]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
      <Animated.View style={fade}>
        {badge > 0 ? (
          <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : count > 0 ? (
          <Text style={{ fontSize: 12, fontWeight: '500', color: active ? colors.brand[700] : colors.gray[400] }}>{count}</Text>
        ) : !!hint && (
          <Text style={{ ...type.label, color: colors.gray[400] }}>{hint}</Text>
        )}
      </Animated.View>
    </AnimatedPressable>
    </SlideItem>
  );
}

function Heading({ children, right, p }) {
  const colors = useColors();
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (p.value - 0.5) / 0.5)) }));
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md, paddingRight: spacing.sm, paddingTop: spacing.lg, paddingBottom: 4 }, fade]}>
      <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] }} numberOfLines={1}>{children}</Text>
      {right}
    </Animated.View>
  );
}

/**
 * Desktop navigation, laid out like Todoist: the person on top, Add task, then the to-do views
 * (Inbox, Today, Upcoming, Filters & Labels, Completed), "My Projects" (lists), the businesses, and
 * the rest of the app. It also owns the "go to" keyboard shortcuts and the "?" help.
 */
export default function AppSidebar({ routeName }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { totalUnread } = useChat();
  const { lists, businesses } = useTodos();
  const counts = useTodoCounts();
  const { unreadCount, approvalCount } = useNotifications();
  const { myDay } = useEngage();
  const dayBadge = (myDay?.waiting_on_you || []).length;
  const [help, setHelp] = useState(false);
  const [showBiz, setShowBiz] = useState(true);
  const [showLists, setShowLists] = useState(true);
  const panel = usePanel('app.sidebar');
  const p = panel.p;
  const hint = useHint();
  const todoView = useTodoView();
  useEffect(() => on('shortcuts:open', () => setHelp(true)), []);
  const section = SECTION_OF[routeName] || null;
  const onTodos = section === 'todos';
  const isView = (v) => onTodos && todoView === v;

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

  // Add task: the To-do screen adds into the view it shows; anywhere else it is a quick add for today.
  const addTask = () => (onTodos ? emit('todos:add') : openQuickAdd());

  // The sidebar narrows to an icon rail (not away: it is how you move around) and widens again, as one spring.
  const widthStyle = useAnimatedStyle(() => ({ width: RAIL + (FULL - RAIL) * Math.min(1.02, p.value) }));
  const navWidth = useAnimatedStyle(() => ({ width: (RAIL - 24) + (FULL - RAIL) * Math.min(1.02, p.value), overflow: 'hidden' }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (p.value - 0.4) / 0.6)) }));

  const iconColor = (active) => (active ? colors.brand[700] : colors.gray[600]);
  const toggle = (open, set) => (
    <AnimatedPressable onPress={() => set((v) => !v)} hitSlop={8} accessibilityLabel={open ? 'Collapse' : 'Expand'}>
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.gray[400]} />
    </AnimatedPressable>
  );

  return (
    <Animated.View style={[{ zIndex: 6 }, widthStyle]}>
    <View {...glass('bar')} style={styles.wrap}>
    <View style={styles.inner}>
      <View style={styles.top}>
        <AnimatedPressable style={styles.me} onPress={() => go('Profile')} accessibilityLabel="Profile">
          <Avatar name={user?.name} uri={user?.profile_picture} size={28} />
          <Animated.View style={[styles.meText, fadeStyle]}>
            <Text style={styles.meName} numberOfLines={1}>{user?.name?.split(' ')[0]}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.gray[500]} />
          </Animated.View>
        </AnimatedPressable>
        <Animated.View style={[styles.topIcons, fadeStyle]}>
          <AnimatedPressable onPress={() => go('Notifications')} hitSlop={6} accessibilityLabel="Notifications" style={styles.topBtn}>
            <Ionicons name={section === 'notifications' ? 'notifications' : 'notifications-outline'} size={19} color={colors.gray[600]} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </AnimatedPressable>
          <AnimatedPressable onPress={panel.toggle} hitSlop={6} accessibilityLabel="Collapse sidebar" style={styles.topBtn}>
            <Ionicons name="browsers-outline" size={19} color={colors.gray[600]} />
          </AnimatedPressable>
        </Animated.View>
      </View>

      <Animated.View style={[{ flex: 1 }, navWidth]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg }}>
      <SlideGroup style={styles.group} pillStyle={{ borderRadius: radius.md }}>
        <Entry p={p} accent icon="add-circle" label="Add task" hint={hint('todo.quickAdd')} onPress={addTask} />
        <Entry p={p} icon="search-outline" label="Search" hint={hint('app.palette')} onPress={openPalette} />
        <Entry p={p} icon="file-tray-outline" activeIcon="file-tray" label="Inbox" count={counts.inbox} active={isView('inbox')} onPress={() => openTodoView('inbox')} />
        <Entry p={p} glyph={<TodayIcon size={19} color={iconColor(isView('today'))} active={isView('today')} />} label="Today" count={counts.today} active={isView('today')} onPress={() => openTodoView('today')} />
        <Entry p={p} icon="calendar-outline" activeIcon="calendar" label="Upcoming" active={isView('upcoming')} onPress={() => openTodoView('upcoming')} />
        <Entry p={p} icon="grid-outline" activeIcon="grid" label="Filters & Labels" active={onTodos && (todoView === 'filters' || /^(filter|label):|^(shared|assigned)$/.test(todoView || ''))} onPress={() => openTodoView('filters')} />
        <Entry p={p} icon="checkmark-circle-outline" activeIcon="checkmark-circle" label="Completed" active={isView('done')} onPress={() => openTodoView('done')} />
        <Entry p={p} icon="pulse-outline" activeIcon="pulse" label="Progress" badge={dayBadge} active={section === 'progress'} onPress={() => go('Progress')} hint={hint('nav.progress')} />

        <Heading p={p} right={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AnimatedPressable onPress={() => navigationRef.isReady() && navigationRef.navigate('Main', { screen: 'Todos', params: { newList: Date.now() } })} hitSlop={8} accessibilityLabel="New project">
              <Ionicons name="add" size={18} color={colors.gray[400]} />
            </AnimatedPressable>
            {toggle(showLists, setShowLists)}
          </View>
        )}
        >
          My Projects
        </Heading>
        {showLists && lists.map((l) => (
          <Entry
            key={l.id}
            p={p}
            glyph={<ListGlyph list={l} size={17} color={isView(`list:${l.id}`) ? colors.brand[700] : colors.gray[500]} />}
            label={l.name}
            count={counts.lists[l.id]}
            active={isView(`list:${l.id}`)}
            onPress={() => openTodoView(`list:${l.id}`)}
          />
        ))}
        {showLists && lists.length === 0 && (
          <Animated.Text style={[styles.hint, fadeStyle]}>Projects group your to-dos, like Home or Finance.</Animated.Text>
        )}

        {businesses.length > 0 && (
          <>
            <Heading p={p} right={toggle(showBiz, setShowBiz)}>Businesses</Heading>
            {showBiz && businesses.map((b) => (
              <Entry
                key={b.id}
                p={p}
                icon="briefcase-outline"
                activeIcon="briefcase"
                label={b.name}
                count={counts.biz[b.id]}
                active={isView(`biz:${b.id}`)}
                onPress={() => openTodoView(`biz:${b.id}`)}
              />
            ))}
          </>
        )}

        <Heading p={p}>Workspace</Heading>
        <Entry p={p} icon="home-outline" activeIcon="home" label="Home" active={section === 'home'} onPress={() => go('Dashboard')} hint={hint('nav.home')} />
        <Entry p={p} icon="chatbubble-outline" activeIcon="chatbubble" label="Chat" badge={totalUnread} active={section === 'chat'} onPress={() => go('ChatList')} />
        <Entry p={p} icon="shield-checkmark-outline" activeIcon="shield-checkmark" label="Approvals" badge={approvalCount} active={section === 'approvals'} onPress={() => go('Approvals')} />
        {user?.can_monitor && (
          <Entry p={p} icon="speedometer-outline" activeIcon="speedometer" label="Team monitor" active={section === 'monitor'} onPress={() => go('TeamMonitor')} />
        )}
        <Entry p={p} icon="git-network-outline" activeIcon="git-network" label="Organisation" active={section === 'org'} onPress={() => go('Organization')} />
      </SlideGroup>
      </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.group, navWidth]}>
        <Entry p={p} icon="help-circle-outline" label="Help & shortcuts" hint={hint('app.help')} onPress={() => setHelp(true)} />
        <Entry p={p} icon={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onPress={toggleTheme} />
        <Entry p={p} icon={panel.open ? 'chevron-back-outline' : 'chevron-forward-outline'} label={panel.open ? 'Collapse sidebar' : 'Expand sidebar'} hint={hint('app.sidebar')} onPress={panel.toggle} />
        <Entry p={p} icon="log-out-outline" label="Log out" onPress={logout} />
      </Animated.View>
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
  inner: { width: FULL, flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.md },
  me: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, paddingHorizontal: 6, borderRadius: radius.md },
  meText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  meName: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  topIcons: { flexDirection: 'row', alignItems: 'center' },
  topBtn: { padding: 6, borderRadius: radius.md },
  bellDot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[600] },
  group: { gap: 1 },
  hint: { fontSize: 12, color: colors.gray[400], paddingHorizontal: spacing.md, paddingVertical: 4, lineHeight: 17 },
});
