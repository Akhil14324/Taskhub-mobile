import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import useIsDesktop from '../../hooks/useBreakpoint';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import useBoards, { refreshBoards } from '../../hooks/useBoards';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import Popover, { anchorOf } from './Popover';
import { NewBoardDialog } from '../../screens/BoardsHomeScreen';
import NewWorkspaceDialog from './NewWorkspaceDialog';
import { showToast } from '../../utils/events';

/**
 * The boards sidebar (desktop): a workspace switcher on top (My boards, Leadership, then one workspace per
 * business) and, under "Content", every board of the chosen workspace. A business is a workspace.
 */
export default function BoardsSidebar({ boardId, onSelect, onClose }) {
  const colors = useColors();
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const { boards } = useBoards();
  const [picked, setPicked] = useState(null);
  const [menu, setMenu] = useState(null);
  const [creating, setCreating] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [tree, setTree] = useState(null);
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(null); // boards I run that were archived, loaded when asked for

  useEffect(() => { api.get('/org/tree', { __skipOops: true }).then((r) => setTree(r.data)).catch(() => {}); }, []);

  const spaces = useMemo(() => {
    const out = [{ key: 'personal', name: 'My boards', icon: 'person-outline', match: (b) => b.scope === 'personal' }];
    if (boards.some((b) => b.scope === 'group')) out.push({ key: 'group', name: 'Leadership', icon: 'star-outline', match: (b) => b.scope === 'group' });
    const seen = new Map();
    for (const b of boards) if (b.business_id && !seen.has(b.business_id)) seen.set(b.business_id, b.business_name);
    for (const [id, name] of seen) out.push({ key: `b${id}`, name, icon: 'briefcase-outline', match: (b) => b.business_id === id });
    return out;
  }, [boards]);

  const current = boards.find((b) => b.id === boardId);
  const home = current ? spaces.find((s) => s.match(current)) : null;
  const space = spaces.find((s) => s.key === picked) || home || spaces[0];
  const q = query.trim().toLowerCase();
  const list = q
    ? boards.filter((b) => `${b.name} ${b.business_name || ''}`.toLowerCase().includes(q))
    : boards.filter((b) => space.match(b));
  const loadArchived = () => api.get('/boards', { params: { archived: 1 }, __skipOops: true }).then((r) => setArchived(r.data.boards || [])).catch(() => setArchived([]));
  const restore = async (b) => {
    try {
      await api.patch(`/boards/${b.id}`, { archived: false });
      setArchived((l) => (l || []).filter((x) => x.id !== b.id));
      refreshBoards();
      showToast({ message: `${b.name} is back`, tone: 'success', icon: 'arrow-undo' });
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not bring it back', tone: 'error' });
    }
  };

  return (
    <View style={{ width: '100%', maxWidth: 300, minWidth: 232, flexShrink: 0, ...(desktop ? { width: 232 } : { flex: 1 }), borderRightWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.page, paddingTop: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
        <Text style={{ flex: 1, fontSize: 12, color: colors.gray[500], fontWeight: '600', paddingLeft: 4 }}>Workspace</Text>
        {!!onClose && (
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close the boards panel" style={({ hovered }) => ({ padding: 4, borderRadius: radius.sm, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name={desktop ? 'chevron-back' : 'close'} size={18} color={colors.gray[600]} />
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm }}>
        <Pressable
          onPress={(e) => setMenu({ anchor: anchorOf(e) })} accessibilityLabel="Switch workspace"
          style={({ hovered }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
        >
          <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#e2445c', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{space.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.gray[900] }}>{space.name}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.gray[500]} />
        </Pressable>
        <Pressable
          onPress={() => setCreating(true)} accessibilityLabel="New board"
          style={({ hovered }) => ({ width: 34, height: 34, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
        >
          <Ionicons name="add" size={18} color={colors.gray[800]} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.sm }}>
        <TextInput
          value={query} onChangeText={setQuery} placeholder="Search boards" placeholderTextColor={colors.gray[400]} accessibilityLabel="Search boards"
          style={{ height: 34, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 10, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 12, color: colors.gray[500], fontWeight: '600' }}>{q ? 'Results' : 'Content'}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: 2, paddingBottom: spacing.xl }}>
        {list.map((b) => {
          const on = b.id === boardId;
          return (
            <Pressable
              key={b.id} onPress={() => !on && onSelect(b.id)}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: on ? BRAND : hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name={b.icon || 'grid-outline'} size={15} color={on ? '#fff' : colors.gray[600]} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: on ? '#fff' : colors.gray[800], fontWeight: on ? '600' : '400' }}>{b.name}</Text>
            </Pressable>
          );
        })}
        {!list.length && <Text style={{ fontSize: 12, color: colors.gray[500], padding: 8 }}>{q ? 'No board matches.' : 'No boards here yet. Use + to make one.'}</Text>}
        <Pressable onPress={() => (archived ? setArchived(null) : loadArchived())} style={{ paddingHorizontal: 8, paddingVertical: 8, marginTop: spacing.sm }}>
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>{archived ? 'Hide archived boards' : 'Archived boards'}</Text>
        </Pressable>
        {archived && (archived.length ? archived.map((b) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.gray[600] }}>{b.name}</Text>
            <Pressable onPress={() => restore(b)} hitSlop={6}><Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>Bring back</Text></Pressable>
          </View>
        )) : <Text style={{ fontSize: 12, color: colors.gray[500], padding: 8 }}>No archived boards.</Text>)}
      </ScrollView>

      {!!menu && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={232}>
          {spaces.map((s) => (
            <Pressable
              key={s.key} onPress={() => { setPicked(s.key); setMenu(null); }}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name={s.icon} size={16} color={colors.gray[600]} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{s.name}</Text>
              {s.key === space.key && <Ionicons name="checkmark" size={16} color={BRAND} />}
            </Pressable>
          ))}
          {!!user?.is_owner && space.key.startsWith('b') && (
            <Pressable
              onPress={async () => {
                setMenu(null);
                const typed = typeof window !== 'undefined' ? window.prompt(`Delete the workspace "${space.name}" with all its boards and tasks?\nThis cannot be undone from the app. Type its name to confirm.`) : null;
                if (typed !== space.name) { if (typed !== null) showToast({ message: 'The name did not match. Nothing was deleted.', tone: 'error' }); return; }
                try { await api.delete(`/org/businesses/${space.key.slice(1)}`, { params: { confirm: space.name } }); setPicked(null); refreshBoards(); showToast({ message: `Deleted ${space.name}`, tone: 'success', icon: 'trash' }); onSelect(null); } catch (e) { showToast({ message: e?.response?.data?.error || 'Could not delete the workspace', tone: 'error' }); }
              }}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, marginTop: 4, borderTopWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name="trash-outline" size={16} color={colors.red[600]} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.red[600], fontWeight: '600' }}>Delete this workspace</Text>
            </Pressable>
          )}
          {!!user?.is_leader && (
            <Pressable
              onPress={() => { setMenu(null); setCreatingSpace(true); }}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, marginTop: 4, borderTopWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name="add-circle-outline" size={16} color={BRAND} />
              <Text style={{ flex: 1, fontSize: 14, color: BRAND, fontWeight: '600' }}>New workspace</Text>
            </Pressable>
          )}
        </Popover>
      )}
      <NewWorkspaceDialog
        visible={creatingSpace} onClose={() => setCreatingSpace(false)}
        onCreated={(biz, board) => { setCreatingSpace(false); setPicked(`b${biz.id}`); if (board) onSelect(board.id); showToast({ message: `${biz.name} is ready`, tone: 'success' }); }}
      />
      <NewBoardDialog
        visible={creating} onClose={() => setCreating(false)} tree={tree} isLeader={!!user?.is_leader}
        initialWhere={space.key === 'group' ? { scope: 'group' } : space.key.startsWith('b') ? { scope: 'business', business_id: Number(space.key.slice(1)) } : { scope: 'personal' }}
        onCreated={(b) => { setCreating(false); refreshBoards(); onSelect(b.id); }}
      />
    </View>
  );
}
