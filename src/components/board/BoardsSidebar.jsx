import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import useBoards, { refreshBoards } from '../../hooks/useBoards';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import Popover, { anchorOf } from './Popover';
import { NewBoardDialog } from '../../screens/BoardsHomeScreen';

/**
 * The boards sidebar (desktop): a workspace switcher on top (My boards, Leadership, then one workspace per
 * business) and, under "Content", every board of the chosen workspace. A business is a workspace.
 */
export default function BoardsSidebar({ boardId }) {
  const colors = useColors();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { boards } = useBoards();
  const [picked, setPicked] = useState(null);
  const [menu, setMenu] = useState(null);
  const [creating, setCreating] = useState(false);
  const [tree, setTree] = useState(null);

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
  const list = boards.filter((b) => space.match(b));

  return (
    <View style={{ width: 232, borderRightWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.page, paddingTop: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
        <Text style={{ flex: 1, fontSize: 12, color: colors.gray[500], fontWeight: '600', paddingLeft: 4 }}>Workspace</Text>
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

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 12, color: colors.gray[500], fontWeight: '600' }}>Content</Text>
        <Pressable onPress={() => navigation.navigate('Boards')} hitSlop={6} accessibilityLabel="All boards">
          <Ionicons name="grid-outline" size={14} color={colors.gray[500]} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: 2, paddingBottom: spacing.xl }}>
        {list.map((b) => {
          const on = b.id === boardId;
          return (
            <Pressable
              key={b.id} onPress={() => !on && navigation.navigate('Board', { id: b.id })}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: on ? BRAND : hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name={b.icon || 'grid-outline'} size={15} color={on ? '#fff' : colors.gray[600]} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: on ? '#fff' : colors.gray[800], fontWeight: on ? '600' : '400' }}>{b.name}</Text>
            </Pressable>
          );
        })}
        {!list.length && <Text style={{ fontSize: 12, color: colors.gray[500], padding: 8 }}>No boards here yet. Use + to make one.</Text>}
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
        </Popover>
      )}
      <NewBoardDialog
        visible={creating} onClose={() => setCreating(false)} tree={tree} isLeader={!!user?.is_leader}
        onCreated={(b) => { setCreating(false); refreshBoards(); navigation.navigate('Board', { id: b.id }); }}
      />
    </View>
  );
}
