import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import useBoards, { refreshBoards } from '../hooks/useBoards';
import Modal from '../components/Modal';
import NewWorkspaceDialog from '../components/board/NewWorkspaceDialog';
import { showToast } from '../utils/events';
import { paletteHex } from '../components/board/model';

const SECTOR_ICONS = {
  food: 'restaurant-outline', liquor: 'wine-outline', mining: 'diamond-outline', real_estate: 'business-outline',
  healthcare: 'medkit-outline', software: 'code-slash-outline', other: 'briefcase-outline',
};

function BoardRow({ board, onPress, subtitle }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={board.name}
      style={({ hovered }) => ({
        width: '31.5%', minWidth: 230, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 2,
        borderRadius: radius.lg, borderWidth: 1, borderColor: hovered ? BRAND : colors.gray[200], backgroundColor: hovered ? colors.gray[50] : colors.white,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: paletteHex(board.color || 'blue'), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={board.icon || 'grid-outline'} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{board.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{subtitle || (board.is_default ? 'Main board' : 'Board')}</Text>
      </View>
      {board.privacy === 'private' && <Ionicons name="lock-closed-outline" size={14} color={colors.gray[500]} />}
    </Pressable>
  );
}

function Grid({ children }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.xs }}>{children}</View>;
}

function Section({ icon, title, children }) {
  const colors = useColors();
  return (
    <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.sm, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.sm, paddingVertical: 6 }}>
        <Ionicons name={icon} size={16} color={colors.gray[600]} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[600] }}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

/** Where a new board can go, from the org tree (what the person belongs to) plus Personal / Leadership. */
export function NewBoardDialog({ visible, onClose, tree, isLeader, onCreated, initialWhere }) {
  const colors = useColors();
  const [name, setName] = useState('');
  const [where, setWhere] = useState({ scope: 'personal' });
  const [privacy, setPrivacy] = useState('main');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [from, setFrom] = useState(null); // null = blank, { key } ready-made, { template_id } saved
  const [search, setSearch] = useState('');
  const { boards: knownBoards } = useBoards();
  useEffect(() => {
    if (!visible) return;
    setName(''); setWhere(initialWhere || { scope: 'personal' }); setPrivacy('main'); setFrom(null); setSearch('');
    api.get('/boards/templates', { __skipOops: true }).then((r) => setTemplates(r.data)).catch(() => setTemplates({ ready_made: [], saved: [] }));
  }, [visible]);

  const places = useMemo(() => {
    const out = [{ key: 'personal', label: 'Just me', icon: 'person-outline', value: { scope: 'personal' } }];
    if (isLeader) out.push({ key: 'group', label: 'Leadership (above every company)', icon: 'star-outline', value: { scope: 'group' } });
    for (const b of tree?.businesses || []) {
      out.push({ key: `b${b.id}`, label: b.name, icon: SECTOR_ICONS[b.sector] || 'briefcase-outline', value: { scope: 'business', business_id: b.id } });
      for (const s of b.sites || []) out.push({ key: `s${s.id}`, label: `${b.name} · ${s.name}`, icon: 'location-outline', value: { scope: 'site', site_id: s.id }, indent: true });
    }
    return out;
  }, [tree, isLeader]);

  const create = async () => {
    if ((!name.trim() && !from) || busy) return;
    setBusy(true);
    const knownIds = new Set(knownBoards.map((b) => b.id));
    try {
      const body = { ...where, name: name.trim(), privacy: where.scope === 'personal' ? 'private' : privacy };
      // A template builds a whole board (columns, groups, starter tasks), so it gets a longer limit than the 20 s default.
      const cfg = { timeout: 90000, __skipOops: true };
      const res = from ? await api.post('/boards/from-template', { ...body, ...from }, cfg) : await api.post('/boards', body, cfg);
      await refreshBoards();
      onCreated(res.data.board);
    } catch (err) {
      const reply = err.response?.data?.error;
      if (!err.response) {
        // No answer (timeout / dropped connection): the server may still have built it, so look before asking to retry.
        const list = await refreshBoards().catch(() => null);
        const made = (list || []).find((b) => !knownIds.has(b.id) && b.name === (name.trim() || templateName(from)));
        if (made) { onCreated(made); return; }
      }
      showToast({ message: reply || 'Could not create the board. Check your connection and try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const templateName = (f) => {
    if (!f) return '';
    if (f.key) return (templates?.ready_made || []).find((t) => t.key === f.key)?.name || '';
    return (templates?.saved || []).find((t) => t.id === f.template_id)?.name || '';
  };
  const q = search.trim().toLowerCase();
  const cards = [{ id: 'blank', name: 'Blank board', description: 'Status, person and date to start with.', value: null },
    ...(templates?.ready_made || []).map((t) => ({ id: `k${t.key}`, name: t.name, description: t.description, icon: SECTOR_ICONS[t.sector], value: { key: t.key }, sector: t.sector })),
    ...(templates?.saved || []).map((t) => ({ id: `t${t.id}`, name: t.name, description: t.business_name ? `Saved for ${t.business_name}` : 'Your template', icon: 'albums-outline', value: { template_id: t.id } })),
  ].filter((t) => !q || `${t.name} ${t.description} ${(t.sector || '').replace('_', ' ')}`.toLowerCase().includes(q));

  const same = (a, b) => a.scope === b.scope && a.business_id === b.business_id && a.site_id === b.site_id;
  return (
    <Modal open={visible} onClose={onClose} title="New board" width={600}>
      <View style={{ gap: spacing.md }}>
        <TextInput
          autoFocus value={name} onChangeText={setName} placeholder={from ? 'Board name (or keep the template name)' : 'Board name, e.g. Tripura construction'} placeholderTextColor={colors.gray[400]}
          onSubmitEditing={create}
          style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.sm, fontSize: 15, color: colors.gray[900], outlineStyle: 'none' }}
        />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[600] }}>Start from a template</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 10 }}>
          <Ionicons name="search" size={15} color={colors.gray[500]} />
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Search templates: construction, restaurant, sales..." placeholderTextColor={colors.gray[400]}
            style={{ flex: 1, paddingVertical: 8, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
          />
        </View>
        <ScrollView style={{ maxHeight: 214 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {!templates && <ActivityIndicator color={BRAND} />}
          {cards.map((t) => {
            const on = JSON.stringify(t.value) === JSON.stringify(from);
            return (
              <Pressable key={t.id} onPress={() => setFrom(t.value)} style={{ width: '31.5%', minWidth: 150, flexGrow: 1, padding: spacing.sm, gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: on ? BRAND : colors.gray[300], backgroundColor: on ? colors.brand[50] : 'transparent' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={t.icon || 'grid-outline'} size={15} color={on ? BRAND : colors.gray[600]} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{t.name}</Text>
                  {on && <Ionicons name="checkmark-circle" size={15} color={BRAND} />}
                </View>
                <Text numberOfLines={3} style={{ fontSize: 12, color: colors.gray[600] }}>{t.description}</Text>
              </Pressable>
            );
          })}
          {!!templates && !cards.length && <Text style={{ color: colors.gray[500], fontSize: 13 }}>No template matches "{search}".</Text>}
        </ScrollView>
        {!!from && <Text style={{ fontSize: 12, color: colors.gray[500] }}>Makes a new board with this template's columns, groups and starter tasks. Nothing is copied from your existing tasks.</Text>}
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[600] }}>Workspace</Text>
        <ScrollView style={{ maxHeight: 260 }}>
          {places.map((p) => {
            const active = same(p.value, where);
            return (
              <Pressable key={p.key} onPress={() => setWhere(p.value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: spacing.sm, paddingLeft: p.indent ? spacing.xl : spacing.sm, borderRadius: radius.md, backgroundColor: active ? colors.brand[50] : 'transparent' }}>
                <Ionicons name={p.icon} size={16} color={active ? BRAND : colors.gray[600]} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{p.label}</Text>
                {active && <Ionicons name="checkmark" size={16} color={BRAND} />}
              </Pressable>
            );
          })}
        </ScrollView>
        {where.scope !== 'personal' && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[['main', 'Everyone in it'], ['private', 'Only people I invite']].map(([k, l]) => (
              <Pressable key={k} onPress={() => setPrivacy(k)} style={{ flex: 1, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: privacy === k ? BRAND : colors.gray[300], backgroundColor: privacy === k ? colors.brand[50] : 'transparent' }}>
                <Text style={{ fontSize: 14, color: colors.gray[900], textAlign: 'center' }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable {...glass('accent')} onPress={create} disabled={(!name.trim() && !from) || busy} style={{ backgroundColor: BRAND, opacity: !name.trim() && !from ? 0.5 : 1, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{busy ? (from ? 'Building your board…' : 'Creating…') : 'Create board'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** Every board the person can open, as the group / company / site tree (F-BRD-03), and "New board". */
export default function BoardsHomeScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { boards, loading } = useBoards();
  const [tree, setTree] = useState(null);
  const [creating, setCreating] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(null); // boards I run that were archived, loaded when asked for
  const isLeader = !!user?.is_leader;
  const loadArchived = () => api.get('/boards', { params: { archived: 1 }, __skipOops: true }).then((r) => setArchived(r.data.boards)).catch(() => setArchived([]));
  const restore = async (b) => {
    try {
      await api.patch(`/boards/${b.id}`, { archived: false });
      setArchived((list) => list.filter((x) => x.id !== b.id));
      refreshBoards();
      showToast({ message: `${b.name} is back`, tone: 'success', icon: 'arrow-undo' });
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not bring it back', tone: 'error' });
    }
  };

  useEffect(() => {
    api.get('/org/tree', { __skipOops: true }).then((r) => setTree(r.data)).catch(() => {});
  }, []);

  const open = (b) => navigation.navigate('Board', { id: b.id });
  const q = query.trim().toLowerCase();
  const visible = q ? boards.filter((b) => `${b.name} ${b.business_name || ''} ${b.site_name || ''}`.toLowerCase().includes(q)) : boards;
  const personal = visible.filter((b) => b.scope === 'personal');
  const leadership = visible.filter((b) => b.scope === 'group');
  const businesses = useMemo(() => {
    const map = new Map();
    for (const b of visible.filter((x) => x.business_id)) {
      if (!map.has(b.business_id)) map.set(b.business_id, { id: b.business_id, name: b.business_name, boards: [], sites: new Map() });
      const biz = map.get(b.business_id);
      if (b.site_id) {
        if (!biz.sites.has(b.site_id)) biz.sites.set(b.site_id, { name: b.site_name, boards: [] });
        biz.sites.get(b.site_id).boards.push(b);
      } else biz.boards.push(b);
    }
    return [...map.values()];
  }, [visible]);
  const sectorOf = (id) => tree?.businesses?.find((x) => x.id === id)?.sector;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingVertical: spacing.md }}>
        {!desktop && navigation.canGoBack() && (
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.gray[700]} /></Pressable>
        )}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }}>Boards</Text>
        {isLeader && (
          <Pressable onPress={() => setCreatingSpace(true)} accessibilityLabel="New workspace" style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="business-outline" size={16} color={colors.gray[700]} />
            {desktop && <Text style={{ color: colors.gray[800], fontWeight: '600' }}>New workspace</Text>}
          </Pressable>
        )}
        <Pressable {...glass('accent')} onPress={() => setCreating(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md }}>
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>{desktop ? 'New board' : 'New'}</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingBottom: spacing.sm, maxWidth: 980 + 2 * spacing.xl, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: colors.white }}>
          <Ionicons name="search" size={16} color={colors.gray[500]} />
          <TextInput
            value={query} onChangeText={setQuery} placeholder="Search boards and workspaces" placeholderTextColor={colors.gray[400]} accessibilityLabel="Search boards"
            style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
          />
          {!!query && <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={6}><Ionicons name="close-circle" size={16} color={colors.gray[400]} /></Pressable>}
        </View>
      </View>
      {loading && !boards.length ? <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} /> : (
        <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: 120, maxWidth: 980, width: '100%', alignSelf: 'center' }}>
          <Section icon="person-outline" title="My boards">
            <Grid>{personal.map((b) => <BoardRow key={b.id} board={b} onPress={() => open(b)} />)}</Grid>
            {!personal.length && !q && <Text style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, color: colors.gray[500] }}>Boards only you see. Make one with New board.</Text>}
          </Section>
          {leadership.length > 0 && (
            <Section icon="star-outline" title="Leadership">
              <Grid>{leadership.map((b) => <BoardRow key={b.id} board={b} onPress={() => open(b)} />)}</Grid>
            </Section>
          )}
          {businesses.map((biz) => (
            <Section key={biz.id} icon={SECTOR_ICONS[sectorOf(biz.id)] || 'briefcase-outline'} title={biz.name}>
              <Grid>{biz.boards.map((b) => <BoardRow key={b.id} board={b} onPress={() => open(b)} />)}</Grid>
              {[...biz.sites.values()].map((s) => (
                <View key={s.name}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], paddingHorizontal: spacing.sm, paddingTop: 6 }}>{s.name.toUpperCase()}</Text>
                  <Grid>{s.boards.map((b) => <BoardRow key={b.id} board={b} onPress={() => open(b)} subtitle={s.name} />)}</Grid>
                </View>
              ))}
            </Section>
          ))}
          {!!q && !visible.length && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.lg }}>No board matches "{query}".</Text>}
          {archived === null ? (
            <Pressable onPress={loadArchived} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 }}>
              <Ionicons name="archive-outline" size={15} color={colors.gray[600]} />
              <Text style={{ fontSize: 13, color: colors.gray[600] }}>Archived boards</Text>
            </Pressable>
          ) : (
            <Section icon="archive-outline" title="Archived boards">
              {!archived.length && <Text style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, color: colors.gray[500] }}>No archived boards that you run.</Text>}
              {archived.map((b) => (
                <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.md }}>
                  <Ionicons name={b.icon || 'grid-outline'} size={17} color={colors.gray[500]} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: colors.gray[700] }}>{b.name}{b.business_name ? ` · ${b.business_name}` : ''}</Text>
                  <Pressable onPress={() => restore(b)}><Text style={{ color: BRAND, fontWeight: '600' }}>Bring back</Text></Pressable>
                </View>
              ))}
            </Section>
          )}
        </ScrollView>
      )}
      <NewWorkspaceDialog
        visible={creatingSpace} onClose={() => setCreatingSpace(false)}
        onCreated={(biz, board) => { setCreatingSpace(false); showToast({ message: `${biz.name} is ready`, tone: 'success' }); if (board) open(board); }}
      />
      <NewBoardDialog
        visible={creating} onClose={() => setCreating(false)} tree={tree} isLeader={isLeader}
        onCreated={(b) => { setCreating(false); open(b); }}
      />
    </View>
  );
}
