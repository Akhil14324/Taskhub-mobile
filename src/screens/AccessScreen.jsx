import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, EmptyHero } from '../components/kit';
import { PickerSheet } from '../components/todos/Pickers';
import { showToast } from '../utils/events';

/**
 * Who can do what. Every module has a switch per person. A switch that was never touched follows the
 * default for the person's level (shown in grey); one that was set by hand shows "set by you".
 */
export default function AccessScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // person id with the switches showing
  const [watchFor, setWatchFor] = useState(null); // person being given "can watch" people

  const load = useCallback(async () => {
    try {
      const res = await api.get('/access/people', { __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load');
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setPermission = async (person, key, allowed) => {
    // Show the change at once; the server answers with what is really in force.
    setData((d) => ({
      ...d,
      people: d.people.map((p) => (p.id === person.id
        ? { ...p, permissions: { ...p.permissions, [key]: { allowed: allowed === null ? p.permissions[key].allowed : allowed, overridden: allowed !== null } } }
        : p)),
    }));
    try {
      const res = await api.put(`/access/people/${person.id}/permissions`, { permission: key, allowed });
      setData((d) => ({
        ...d,
        people: d.people.map((p) => (p.id === person.id
          ? { ...p, permissions: { ...p.permissions, [key]: { allowed: res.data.allowed, overridden: res.data.overridden } } }
          : p)),
      }));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change it', tone: 'error' });
      load();
    }
  };

  const saveWatch = async (person, ids) => {
    setData((d) => ({ ...d, people: d.people.map((p) => (p.id === person.id ? { ...p, can_watch: ids } : p)) }));
    try {
      await api.put(`/access/people/${person.id}/watch`, { target_ids: ids });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save', tone: 'error' });
      load();
    }
  };

  const people = (data?.people || []).filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q);
  });
  const watcher = watchFor ? data.people.find((p) => p.id === watchFor) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Who can do what" style={styles.title} />
        <Text style={styles.subtitle}>Switch each part of the app on or off for each person</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        keyboardShouldPersistTaps="handled"
      >
        {!data && !error && <SkeletonList count={5} type="notification" />}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}
        {!!data && (
          <View {...glass('card')} style={styles.search}>
            <Ionicons name="search" size={16} color={colors.gray[400]} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.gray[400]} style={styles.searchInput} />
          </View>
        )}
        {people.map((p) => {
          const isOpen = open === p.id;
          const custom = Object.values(p.permissions).filter((v) => v.overridden).length;
          return (
            <View key={p.id} {...glass('card')} style={styles.card}>
              <AnimatedPressable style={styles.cardHead} onPress={() => setOpen(isOpen ? null : p.id)}>
                <Avatar name={p.name} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>@{p.username}{custom ? ` · ${custom} changed` : ''}</Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray[400]} />
              </AnimatedPressable>
              {isOpen && (
                <View style={styles.switches}>
                  {data.catalog.map((c) => {
                    const state = p.permissions[c.key];
                    return (
                      <View key={c.key} style={styles.switchRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.switchLabel}>{c.label}</Text>
                          <Text style={styles.switchHint}>
                            {c.description}{state.overridden ? ' · set by hand' : ''}
                          </Text>
                          {c.key === 'monitor' && state.allowed && (
                            <AnimatedPressable onPress={() => setWatchFor(p.id)} style={{ marginTop: 4 }}>
                              <Text style={styles.link}>
                                {p.can_watch.length ? `Also watches ${p.can_watch.length} other ${p.can_watch.length === 1 ? 'person' : 'people'}` : 'Choose extra people to watch'}
                              </Text>
                            </AnimatedPressable>
                          )}
                        </View>
                        {state.overridden && (
                          <AnimatedPressable onPress={() => setPermission(p, c.key, null)} hitSlop={8} accessibilityLabel="Back to default">
                            <Ionicons name="refresh-outline" size={18} color={colors.gray[400]} />
                          </AnimatedPressable>
                        )}
                        <Switch
                          value={state.allowed}
                          disabled={!c.grantable}
                          onValueChange={(v) => setPermission(p, c.key, v)}
                          trackColor={{ true: colors.brand[600], false: colors.gray[300] }}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
        {!!data && people.length === 0 && <EmptyHero icon="people-outline" title="Nobody here" message="Only people below you in the chain can be changed." />}
      </ScrollView>

      <PickerSheet
        visible={!!watcher}
        onClose={() => setWatchFor(null)}
        title={watcher ? `${watcher.name.split(' ')[0]} can also watch` : ''}
        options={(data?.people || []).filter((p) => p.id !== watchFor).map((p) => ({
          key: p.id, label: p.name, icon: watcher?.can_watch.includes(p.id) ? 'checkbox' : 'square-outline', active: watcher?.can_watch.includes(p.id),
        }))}
        onPick={(id) => watcher && saveWatch(watcher, watcher.can_watch.includes(id) ? watcher.can_watch.filter((x) => x !== id) : [...watcher.can_watch, id])}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.xl, backgroundColor: colors.white, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  meta: { fontSize: 12, color: colors.gray[500] },
  switches: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  switchLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  switchHint: { fontSize: 12, color: colors.gray[500], marginTop: 1, lineHeight: 16 },
  link: { fontSize: 12, fontWeight: '700', color: colors.brand[600] },
});
