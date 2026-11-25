import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
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
