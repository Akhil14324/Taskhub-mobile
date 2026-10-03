import { useEffect, useMemo, useRef, useState } from 'react';
import { hintText as hint, useShortcutVersion } from '../utils/shortcutRegistry';
import { View, Text, TextInput, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { navigationRef, openNotificationTarget } from '../navigation/navigationRef';
import { openQuickAdd, openTemplates, openShortcuts } from '../utils/events';
import { formatDue } from '../utils/dates';
import useBackClose from '../hooks/useBackClose';

const go = (name, params) => {
  if (!navigationRef.isReady()) return;
  if (['Dashboard', 'Todos', 'ChatList'].includes(name)) navigationRef.navigate('Main', { screen: name, params });
  else navigationRef.navigate(name, params);
};

/** Every word typed must appear; matches at the start of a word rank higher. */
function score(text, words) {
  const t = text.toLowerCase();
  let total = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) return -1;
    total += i === 0 || t[i - 1] === ' ' ? 3 : 1;
  }
  return total;
}

/**
 * Ctrl/Cmd + K: jump to any page, to-do or action by typing a few letters.
 * Arrow keys move, Enter opens, Escape closes.
 */
export default function CommandPalette({ visible, onClose }) {
  const shortcutVersion = useShortcutVersion();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toggleTheme, theme } = useTheme();
  const { user, logout } = useAuth();
  const { todos } = useTodos();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  useEffect(() => { if (visible) { setQuery(''); setIndex(0); } }, [visible]);

  const commands = useMemo(() => [
    { id: 'new', group: 'Actions', icon: 'add-circle-outline', label: 'New to-do', hint: hint('todo.quickAdd'), run: () => openQuickAdd() },
    { id: 'template', group: 'Actions', icon: 'copy-outline', label: 'New from template', run: () => openTemplates() },
    { id: 'theme', group: 'Actions', icon: theme === 'dark' ? 'sunny-outline' : 'moon-outline', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', run: toggleTheme },
    { id: 'progress', group: 'Go to', icon: 'sunny-outline', label: 'Progress: today, stand-up, wins, goals', hint: hint('nav.progress'), run: () => go('Progress') },
    { id: 'recap', group: 'Go to', icon: 'stats-chart-outline', label: 'Week in review', run: () => go('Recap') },
    { id: 'home', group: 'Go to', icon: 'home-outline', label: 'Home', hint: hint('nav.home'), run: () => go('Dashboard') },
    { id: 'todos', group: 'Go to', icon: 'checkbox-outline', label: 'To-do and business tasks', hint: hint('nav.todos'), run: () => go('Todos') },
    { id: 'chat', group: 'Go to', icon: 'chatbubble-outline', label: 'Chat', hint: hint('nav.chat'), run: () => go('ChatList') },
    { id: 'approvals', group: 'Go to', icon: 'shield-checkmark-outline', label: 'Approvals', hint: hint('nav.approvals'), run: () => go('Approvals') },
    ...(user?.can_monitor ? [{ id: 'monitor', group: 'Go to', icon: 'speedometer-outline', label: 'Team monitor', hint: hint('nav.monitor'), run: () => go('TeamMonitor') }] : []),
    { id: 'notifications', group: 'Go to', icon: 'notifications-outline', label: 'Notifications', hint: hint('nav.notifications'), run: () => go('Notifications') },
    { id: 'org', group: 'Go to', icon: 'git-network-outline', label: 'Organisation', hint: hint('nav.org'), run: () => go('Organization') },
    { id: 'profile', group: 'Go to', icon: 'person-outline', label: 'Profile and settings', hint: hint('nav.profile'), run: () => go('Profile') },
    { id: 'shortcuts', group: 'Actions', icon: 'keypad-outline', label: 'Keyboard shortcuts: view and change', run: () => openShortcuts() },
    { id: 'logout', group: 'Actions', icon: 'log-out-outline', label: 'Log out', run: logout },
  ], [theme, toggleTheme, user, logout, shortcutVersion]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return commands.slice(0, 9);
    const cmds = commands.map((c) => ({ c, s: score(c.label, words) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.c);
    const tasks = todos
      .map((t) => ({ t, s: score(`${t.title} ${t.business_name || ''}`, words) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || Number(a.t.is_done) - Number(b.t.is_done))
      .slice(0, 8)
      .map(({ t }) => ({
        id: `todo-${t.id}`,
        group: 'To-dos',
        icon: t.is_done ? 'checkmark-circle' : 'ellipse-outline',
        label: t.title,
        detail: [t.business_name, t.due_date ? `due ${formatDue(t.due_date)}` : null, t.is_done ? 'done' : null].filter(Boolean).join(' · '),
        run: () => openNotificationTarget({ todoId: t.id }),
      }));
    const add = [{ id: 'add-typed', group: 'Actions', icon: 'add', label: `Add "${query.trim()}" as a to-do`, run: () => openQuickAdd({ text: query.trim() }) }];
    return [...cmds, ...tasks, ...add];
  }, [query, commands, todos]);

  useEffect(() => { setIndex(0); }, [query]);

  const choose = (item) => {
    onClose();
    setTimeout(() => item?.run?.(), 60);
  };

  const onKeyPress = (e) => {
    const key = e.nativeEvent?.key;
    if (key === 'ArrowDown') { e.preventDefault?.(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
    else if (key === 'ArrowUp') { e.preventDefault?.(); setIndex((i) => Math.max(0, i - 1)); }
    else if (key === 'Escape') onClose();
  };

  useBackClose(visible, onClose);

  if (!visible) return null;
  let lastGroup = null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.inputRow}>
            <Ionicons name="search" size={18} color={colors.gray[400]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onKeyPress={onKeyPress}
              onSubmitEditing={() => choose(results[index])}
              placeholder="Search to-dos, or type a command"
              placeholderTextColor={colors.gray[400]}
              style={styles.input}
              autoFocus
              blurOnSubmit={false}
            />
            {Platform.OS === 'web' && <Text style={styles.esc}>Esc</Text>}
          </View>
          <ScrollView ref={listRef} style={{ maxHeight: 380 }} keyboardShouldPersistTaps="always">
            {results.map((r, i) => {
              const header = r.group !== lastGroup;
              lastGroup = r.group;
              return (
                <View key={r.id}>
                  {header && <Text style={styles.group}>{r.group}</Text>}
                  <Pressable onPress={() => choose(r)} onHoverIn={() => setIndex(i)} style={[styles.item, i === index && styles.itemOn]}>
                    <Ionicons name={r.icon} size={18} color={i === index ? colors.brand[700] : colors.gray[500]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemLabel, i === index && { color: colors.brand[700] }]} numberOfLines={1}>{r.label}</Text>
                      {!!r.detail && <Text style={styles.itemDetail} numberOfLines={1}>{r.detail}</Text>}
                    </View>
                    {!!r.hint && <Text style={styles.hint}>{r.hint}</Text>}
                    {i === index && <Ionicons name="return-down-back" size={14} color={colors.brand[600]} />}
                  </Pressable>
                </View>
              );
            })}
            {results.length === 0 && <Text style={styles.none}>Nothing found</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', paddingTop: '12%', paddingHorizontal: spacing.lg },
  card: {
    width: '100%', maxWidth: 620, borderRadius: radius.xl, backgroundColor: colors.white, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
  input: { flex: 1, fontSize: fontSize.md, color: colors.gray[900], paddingVertical: 16, outlineStyle: 'none' },
  esc: { fontSize: 11, fontWeight: '700', color: colors.gray[400], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[300], borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  group: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[400], paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  itemOn: { backgroundColor: colors.brand[50] },
  itemLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  itemDetail: { fontSize: 11, color: colors.gray[500], marginTop: 1 },
  hint: { fontSize: 11, color: colors.gray[400], fontWeight: '700' },
  none: { padding: spacing.xl, textAlign: 'center', color: colors.gray[400] },
});
