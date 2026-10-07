import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useColors, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import { Avatar, ListGlyph } from '../components/kit';
import useTodoCounts from '../hooks/useTodoCounts';
import { openTodoView } from '../utils/todoView';
import { openPalette, openTemplates } from '../utils/events';

function Row({ icon, glyph, label, count, badge, onPress, last, destructive }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} water style={[rowStyle.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] }]}>
      <View style={rowStyle.icon}>
        {glyph || <Ionicons name={icon} size={21} color={destructive ? colors.red[600] : colors.gray[600]} />}
      </View>
      <Text style={[rowStyle.label, { color: destructive ? colors.red[600] : colors.gray[900] }]} numberOfLines={1}>{label}</Text>
      {badge > 0 ? (
        <View style={[rowStyle.badge, { backgroundColor: colors.brand[600] }]}>
          <Text style={rowStyle.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : count > 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.gray[400] }}>{count}</Text>
      ) : null}
    </AnimatedPressable>
  );
}

const rowStyle = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 13, paddingHorizontal: spacing.md },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

/**
 * Todoist's "Browse" tab: everything that is not Inbox / Today / Upcoming / Chat. Projects (lists),
 * businesses, filters and labels open in the To-do screen; the rest are the app's other pages.
 */
export default function BrowseScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { lists, businesses } = useTodos();
  const { unreadCount, approvalCount } = useNotifications();
  const counts = useTodoCounts();
  const [showLists, setShowLists] = useState(true);
  const [showBiz, setShowBiz] = useState(true);

  const group = (rows) => <View {...glass('card')} style={styles.group}>{rows}</View>;
  const heading = (label, open, setOpen, right) => (
    <View style={styles.heading}>
      <Text style={styles.headingText}>{label}</Text>
      {right}
      {setOpen && (
        <AnimatedPressable onPress={() => setOpen((v) => !v)} hitSlop={10} accessibilityLabel={open ? 'Collapse' : 'Expand'}>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.me} onPress={() => navigation.navigate('Profile')}>
          <Avatar name={user?.name} uri={user?.profile_picture} size={34} />
          <Text style={styles.meName} numberOfLines={1}>{user?.name}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => navigation.navigate('Notifications')} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Notifications">
          <Ionicons name="notifications-outline" size={23} color={colors.gray[700]} />
          {unreadCount > 0 && <View style={[styles.dot, { backgroundColor: colors.brand[600] }]} />}
        </AnimatedPressable>
        <AnimatedPressable onPress={() => navigation.navigate('Profile')} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={22} color={colors.gray[700]} />
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {group(<>
          <Row icon="search-outline" label="Search" onPress={openPalette} />
          <Row icon="grid-outline" label="Filters & Labels" onPress={() => openTodoView('filters')} />
          <Row icon="checkmark-circle-outline" label="Completed" onPress={() => openTodoView('done')} />
          <Row icon="home-outline" label="Home" onPress={() => navigation.navigate('Dashboard')} />
          <Row icon="pulse-outline" label="Progress" onPress={() => navigation.navigate('Progress')} last />
        </>)}

        {heading('My Projects', showLists, setShowLists, (
          <AnimatedPressable onPress={() => navigation.navigate('Todos', { newList: Date.now() })} hitSlop={10} accessibilityLabel="New project" style={{ marginRight: spacing.md }}>
            <Ionicons name="add" size={22} color={colors.gray[500]} />
          </AnimatedPressable>
        ))}
        {showLists && group(<>
          <Row icon="file-tray-outline" label="Inbox" count={counts.inbox} onPress={() => openTodoView('inbox')} last={lists.length === 0} />
          {lists.map((l, i) => (
            <Row
              key={l.id}
              glyph={<ListGlyph list={l} size={19} color={colors.brand[600]} />}
              label={l.name}
              count={counts.lists[l.id]}
              onPress={() => openTodoView(`list:${l.id}`)}
              last={i === lists.length - 1}
            />
          ))}
        </>)}

        {businesses.length > 0 && heading('Businesses', showBiz, setShowBiz)}
        {businesses.length > 0 && showBiz && group(businesses.map((b, i) => (
          <Row key={b.id} icon="briefcase-outline" label={b.name} count={counts.biz[b.id]} onPress={() => openTodoView(`biz:${b.id}`)} last={i === businesses.length - 1} />
        )))}

        {heading('Workspace')}
        {group(<>
          <Row icon="shield-checkmark-outline" label="Approvals" badge={approvalCount} onPress={() => navigation.navigate('Approvals')} />
          {user?.can_monitor && <Row icon="speedometer-outline" label="Team monitor" onPress={() => navigation.navigate('TeamMonitor')} />}
          <Row icon="copy-outline" label="Templates" onPress={() => openTemplates({})} />
          <Row icon="git-network-outline" label={user?.is_portal ? 'Organisation & people' : 'Organisation'} onPress={() => navigation.navigate('Organization')} last />
        </>)}

        {heading('Settings')}
        {group(<>
          <Row icon="person-outline" label="Profile" onPress={() => navigation.navigate('Profile')} />
          <Row icon={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onPress={toggleTheme} />
          <Row icon="log-out-outline" label="Log out" destructive onPress={logout} last />
        </>)}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  me: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  headerBtn: { padding: 8 },
  dot: { position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: 5 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  group: {
    borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  heading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  headingText: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.gray[700] },
});
