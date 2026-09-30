import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown, FadeIn, LinearTransition } from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/BottomSheet';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import PersonSheet from '../components/org/PersonSheet';
import PersonEditorSheet from '../components/org/PersonEditorSheet';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import { Avatar, Chip, IconButton, accent, tint } from '../components/kit';
import useDirectory, { filterPeople, invalidateDirectory } from '../hooks/useDirectory';
import { showToast } from '../utils/events';

const TIER_ICONS = { 1: 'diamond', 2: 'shield', 3: 'star' };
const TIER_COLORS = { 1: '#b45309', 2: '#7c3aed', 3: '#2563eb' };

export default function OrganizationScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const { onlineUsers } = useChat();
  const { people: directory } = useDirectory();

  const [structure, setStructure] = useState(null);
  const [portalPeople, setPortalPeople] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = create, object = edit
  const [addMemberFor, setAddMemberFor] = useState(null);
  const [todoFor, setTodoFor] = useState(null);
  const [query, setQuery] = useState('');

  const portal = !!structure?.me?.portal;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/org/structure', { __skipOops: true });
      setStructure(res.data);
      if (res.data.me?.portal) {
        const p = await api.get('/org/people', { __skipOops: true });
        setPortalPeople(p.data.people || []);
      }
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not load the organisation', tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const afterChange = useCallback(() => {
    invalidateDirectory();
    load();
    refreshUser?.();
  }, [load, refreshUser]);

  // Everyone with all their business positions, for the person sheet.
  const peopleById = useMemo(() => {
    const map = new Map();
    if (!structure) return map;
    const add = (p, membership) => {
      const existing = map.get(p.id) || { ...p, memberships: [] };
      if (membership) existing.memberships.push(membership);
      map.set(p.id, existing);
    };
    structure.leaders.forEach((p) => add(p));
    structure.businesses.forEach((b) => b.members.forEach((m) => add(m, {
      business_id: b.id,
      business_name: b.name,
      business_color: b.color,
      designation: m.designation,
      designation_label: m.designation_label,
      title: m.membership_title,
    })));
    structure.unplaced.forEach((p) => add(p));
    portalPeople.forEach((p) => {
      const existing = map.get(p.id);
      map.set(p.id, { ...(existing || {}), ...p, display_title: p.display_title || existing?.display_title });
    });
    return map;
  }, [structure, portalPeople]);

  const openPerson = (p) => setSelected(peopleById.get(p.id) || p);
  const portalRecord = (id) => portalPeople.find((p) => p.id === id);
  const canManage = (id) => portal && !!portalRecord(id)?.can_manage;

  const searchResults = query.trim() ? filterPeople(directory, query.trim(), { limit: 20 }) : [];

  if (!structure) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}><IconButton icon="chevron-back" onPress={() => navigation.goBack()} /></View>
        <View style={styles.center}><ActivityIndicator color={colors.brand[600]} /></View>
      </View>
    );
  }

  const tiers = [1, 2, 3].map((level) => ({
    level,
    label: structure.leadership.find((l) => l.level === level)?.label,
    people: structure.leaders.filter((p) => p.org_level === level),
  })).filter((t) => t.people.length > 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Organisation</Text>
          <Text style={styles.subtitle}>{portal ? 'Portal — you can place and manage people' : 'Who’s who across VGrand'}</Text>
        </View>
        {portal && (
          <AnimatedPressable style={styles.addBtn} onPress={() => setEditing(null)} haptic="medium">
            <Ionicons name="person-add" size={16} color={colors.white} />
            <Text style={styles.addBtnText}>Add</Text>
          </AnimatedPressable>
        )}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.gray[400]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find someone by name or @username"
          placeholderTextColor={colors.gray[400]}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 60 + insets.bottom }]}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {query.trim() ? (
          <View>
            {searchResults.map((p) => (
              <AnimatedPressable key={p.id} style={styles.searchRow} onPress={() => openPerson(p)} haptic="light">
                <Avatar name={p.name} uri={p.profile_picture} size={40} online={onlineUsers.has(p.id)} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{p.name}</Text>
                  <Text style={styles.personTitle}>@{p.username}{p.display_title ? ` · ${p.display_title}` : ''}</Text>
                </View>
              </AnimatedPressable>
            ))}
            {searchResults.length === 0 && <Text style={styles.muted}>No one matches “{query}”.</Text>}
          </View>
        ) : (
          <>
            {/* Leadership chain */}
            {tiers.map((tier, i) => (
              <Animated.View key={tier.level} entering={FadeInDown.delay(i * 90).duration(320)} style={{ alignItems: 'center' }}>
                {i > 0 && <View style={styles.connector} />}
                <View style={[styles.tierBadge, { backgroundColor: tint(TIER_COLORS[tier.level], 0.12) }]}>
                  <Ionicons name={TIER_ICONS[tier.level]} size={12} color={TIER_COLORS[tier.level]} />
                  <Text style={[styles.tierLabel, { color: TIER_COLORS[tier.level] }]}>{tier.label}</Text>
                </View>
                <View style={styles.tierRow}>
                  {tier.people.map((p) => (
                    <AnimatedPressable key={p.id} onPress={() => openPerson(p)} haptic="light" style={[styles.leaderCard, { borderColor: tint(TIER_COLORS[tier.level], 0.4) }]}>
                      <Avatar name={p.name} uri={p.profile_picture} size={tier.level === 1 ? 56 : 46} online={onlineUsers.has(p.id)} />
                      <Text style={styles.leaderName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.leaderTitle} numberOfLines={1}>{p.display_title}</Text>
                      {p.id === user?.id && <Text style={styles.youTag}>You</Text>}
                    </AnimatedPressable>
                  ))}
                </View>
              </Animated.View>
            ))}

            {tiers.length > 0 && <View style={styles.connector} />}
            <View style={styles.branch} />

            {/* Businesses */}
            <Text style={styles.sectionTitle}>Businesses</Text>
            {structure.businesses.map((b, i) => {
              const open = !!expanded[b.id];
              const groups = structure.designations
                .map((d) => ({ ...d, members: b.members.filter((m) => m.designation === d.key && d.key !== 'head') }))
                .filter((g) => g.members.length);
              const iManage = portal || (user?.manages_business_ids || []).includes(b.id);
              return (
                <Animated.View key={b.id} entering={FadeInDown.delay(200 + i * 70).duration(300)} layout={LinearTransition}>
                  <View style={[styles.bizCard, { borderLeftColor: accent(b.color) }]}>
                    <AnimatedPressable onPress={() => setExpanded((e) => ({ ...e, [b.id]: !open }))} haptic="light">
                      <View style={styles.bizHeader}>
                        <View style={[styles.bizIcon, { backgroundColor: tint(accent(b.color), 0.14) }]}>
                          <Ionicons name={b.type === 'restaurant' ? 'restaurant' : b.type === 'construction' ? 'construct' : b.type === 'mines' ? 'diamond' : b.type === 'it' ? 'laptop' : 'business'} size={20} color={accent(b.color)} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bizName}>{b.name}</Text>
                          <Text style={styles.bizStats}>
                            {b.members.length} people · {b.open_tasks} open
                            {b.overdue_tasks ? ` · ` : ''}
                            {b.overdue_tasks ? <Text style={{ color: colors.red[600] }}>{b.overdue_tasks} overdue</Text> : null}
                          </Text>
                        </View>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray[400]} />
                      </View>
                    </AnimatedPressable>

                    {/* Heads are always visible */}
                    <View style={styles.headsRow}>
                      {b.heads.length === 0 && <Text style={styles.muted}>No head assigned yet</Text>}
                      {b.heads.map((h) => (
                        <AnimatedPressable key={h.id} style={styles.headChip} onPress={() => openPerson(h)} haptic="light">
                          <Avatar name={h.name} uri={h.profile_picture} size={26} online={onlineUsers.has(h.id)} />
                          <View>
                            <Text style={styles.headName} numberOfLines={1}>{h.name}</Text>
                            <Text style={styles.headRole}>{h.membership_title || 'Head'}</Text>
                          </View>
                        </AnimatedPressable>
                      ))}
                    </View>

                    {open && (
                      <Animated.View entering={FadeIn.duration(200)}>
                        {groups.map((g) => (
                          <View key={g.key} style={{ marginTop: spacing.md }}>
                            <Text style={styles.groupLabel}>{g.label}s · {g.members.length}</Text>
                            <View style={styles.memberGrid}>
                              {g.members.map((m) => (
                                <AnimatedPressable key={m.id} style={styles.member} onPress={() => openPerson(m)} haptic="light">
                                  <Avatar name={m.name} uri={m.profile_picture} size={38} online={onlineUsers.has(m.id)} />
                                  <Text style={styles.memberName} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                                  {!!m.membership_title && <Text style={styles.memberTitle} numberOfLines={1}>{m.membership_title}</Text>}
                                </AnimatedPressable>
                              ))}
                            </View>
                          </View>
                        ))}
                        {groups.length === 0 && <Text style={[styles.muted, { marginTop: spacing.md }]}>No team members yet.</Text>}
                        <View style={styles.bizActions}>
                          <Chip small icon="clipboard" label="Tasks" color={accent(b.color)} onPress={() => navigation.navigate('Main', { screen: 'Tasks', params: { business_id: b.id } })} />
                          {iManage && <Chip small icon="person-add" label="Add member" color={accent(b.color)} onPress={() => setAddMemberFor(b)} />}
                        </View>
                      </Animated.View>
                    )}
                  </View>
                </Animated.View>
              );
            })}

            {portal && structure.unplaced.length > 0 && (
              <View style={{ marginTop: spacing.xl }}>
                <Text style={styles.sectionTitle}>Waiting to be placed · {structure.unplaced.length}</Text>
                <Text style={styles.muted}>New sign-ups land here. Tap to give them a business and position.</Text>
                {structure.unplaced.map((p) => (
                  <AnimatedPressable key={p.id} style={styles.searchRow} onPress={() => setEditing(portalRecord(p.id) || p)} haptic="light">
                    <Avatar name={p.name} uri={p.profile_picture} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{p.name}</Text>
                      <Text style={styles.personTitle}>@{p.username}</Text>
                    </View>
                    <View style={styles.placeBtn}><Text style={styles.placeText}>Place</Text></View>
                  </AnimatedPressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <PersonSheet
        person={selected}
        onClose={() => setSelected(null)}
        canManage={selected ? canManage(selected.id) : false}
        onEdit={(p) => setEditing(portalRecord(p.id) || p)}
        onChanged={afterChange}
        onAddTodo={(p) => setTodoFor(p)}
      />
      <PersonEditorSheet
        visible={editing !== undefined}
        onClose={() => setEditing(undefined)}
        person={editing || null}
        businesses={structure.businesses}
        catalog={structure}
        myLevel={structure.me?.level ?? 99}
        onSaved={afterChange}
      />
      <AddMemberSheet
        business={addMemberFor}
        designations={structure.designations}
        myLevel={structure.me?.level ?? 99}
        portal={portal}
        onClose={() => setAddMemberFor(null)}
        onDone={afterChange}
      />
      <QuickAddSheet
        visible={!!todoFor}
        onClose={() => setTodoFor(null)}
        defaults={{}}
        initialText={todoFor ? `@${todoFor.username} ` : ''}
      />
    </View>
  );
}

function AddMemberSheet({ business, designations, myLevel, portal, onClose, onDone }) {
  const colors = useColors();
  const { people } = useDirectory();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [designation, setDesignation] = useState('member');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (business) {
      setQuery('');
      setPicked(null);
      setDesignation('member');
    }
  }, [business]);

  const existing = new Set((business?.members || []).map((m) => m.id));
  const results = filterPeople(people, query, { excludeIds: [...existing], limit: 8 });
  const allowed = designations.filter((d) => portal || d.level > myLevel);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await api.put(`/org/businesses/${business.id}/members/${picked.id}`, { designation });
      showToast({ message: `${picked.name.split(' ')[0]} added to ${business.name}`, tone: 'success' });
      onClose();
      onDone?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={!!business} onClose={onClose} maxHeight={640} avoidKeyboard>
      {business && (
        <View style={{ paddingHorizontal: spacing.sm, flexShrink: 1 }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] }}>Add to {business.name}</Text>
          {!picked ? (
            <>
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search people"
                placeholderTextColor={colors.gray[400]}
                style={{ marginTop: spacing.md, backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' }}
              />
              <ScrollView style={{ flexShrink: 1, marginTop: spacing.sm }} keyboardShouldPersistTaps="handled">
                {results.map((p) => (
                  <AnimatedPressable key={p.id} onPress={() => setPicked(p)} haptic="light" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
                    <Avatar name={p.name} uri={p.profile_picture} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] }}>{p.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>@{p.username}{p.display_title ? ` · ${p.display_title}` : ''}</Text>
                    </View>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md }}>
                <Avatar name={picked.name} uri={picked.profile_picture} size={40} />
                <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.gray[900] }}>{picked.name}</Text>
                <AnimatedPressable onPress={() => setPicked(null)}><Text style={{ color: colors.brand[600], fontWeight: '600' }}>Change</Text></AnimatedPressable>
              </View>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm }}>POSITION</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {allowed.map((d) => (
                  <Chip key={d.key} label={d.label} color={accent(business.color)} active={designation === d.key} onPress={() => setDesignation(d.key)} />
                ))}
              </View>
              <AnimatedPressable
                onPress={save}
                disabled={saving}
                haptic="medium"
                style={{ marginTop: spacing.xl, marginBottom: spacing.md, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600], opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.md }}>{saving ? 'Adding…' : 'Add to business'}</Text>
              </AnimatedPressable>
            </>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brand[600], paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, marginRight: spacing.sm },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  connector: { width: 2, height: 22, backgroundColor: colors.gray[300], alignSelf: 'center' },
  branch: { height: 2, backgroundColor: colors.gray[300], marginHorizontal: spacing.xxxl, marginBottom: spacing.lg, borderRadius: 1 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, marginBottom: spacing.sm },
  tierLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  leaderCard: {
    width: 150,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  leaderName: { fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900], marginTop: spacing.sm },
  leaderTitle: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 },
  youTag: { fontSize: 10, fontWeight: '800', color: colors.brand[600], marginTop: 3 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.sm },
  bizCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    borderLeftWidth: 4,
  },
  bizHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bizIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bizName: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  bizStats: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  headsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  headChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, paddingLeft: 5, paddingRight: 12, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  headName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900], maxWidth: 140 },
  headRole: { fontSize: 10, color: colors.gray[500] },
  groupLabel: { fontSize: 11, fontWeight: '800', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5 },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  member: { width: 64, alignItems: 'center' },
  memberName: { fontSize: 11, fontWeight: '600', color: colors.gray[800], marginTop: 4, maxWidth: 64 },
  memberTitle: { fontSize: 9, color: colors.gray[500], maxWidth: 64 },
  bizActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  personName: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  personTitle: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 },
  muted: { fontSize: fontSize.sm, color: colors.gray[400] },
  placeBtn: { backgroundColor: colors.brand[600], paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  placeText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
});
