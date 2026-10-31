import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import Modal from '../Modal';
import useDirectory from '../../hooks/useDirectory';
import { showToast } from '../../utils/events';
import { navigate } from '../../navigation/navigationRef';
// The six stored stages, in the words a board shows by default.
const STATUS_KEYS_LABELS = { todo: 'Not started', in_progress: 'Working on it', blocked: 'Stuck', in_review: 'In review', on_hold: 'On hold', done: 'Done' };

const TIMES = ['07:30', '08:30', '09:00', '10:00', '18:00'];

/** One recipe sentence with its blanks ({person}, {status}, {at}) as tappable choices. */
function Recipe({ recipe, onAdd, busy }) {
  const colors = useColors();
  const { people } = useDirectory();
  const [params, setParams] = useState(() => Object.fromEntries(recipe.params.map((p) => [p.key, p.default ?? null])));
  const [open, setOpen] = useState(null);
  const choices = (p) => (p.type === 'person' ? (people || []).map((x) => [String(x.id), x.name])
    : p.type === 'status' ? Object.entries(STATUS_KEYS_LABELS) : TIMES.map((t) => [t, t]));
  const label = (p) => {
    const v = params[p.key];
    if (!v) return p.type === 'person' ? 'someone' : '...';
    return (choices(p).find(([k]) => k === String(v)) || [v, v])[1];
  };
  const parts = recipe.sentence.split(/(\{\w+\})/);
  const missing = recipe.params.some((p) => !params[p.key]);
  return (
    <View style={{ borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <Ionicons name={recipe.icon} size={18} color={BRAND} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, fontSize: 15, color: colors.gray[900], lineHeight: 22 }}>
          {parts.map((part, i) => {
            const m = /^\{(\w+)\}$/.exec(part);
            const p = m && recipe.params.find((x) => x.key === m[1]);
            if (!p) return <Text key={i}>{part}</Text>;
            return <Text key={i} onPress={() => setOpen(open === p.key ? null : p.key)} style={{ color: BRAND, fontWeight: '600', textDecorationLine: 'underline' }}>{label(p)}</Text>;
          })}
        </Text>
      </View>
      {open && (
        <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {choices(recipe.params.find((p) => p.key === open)).map(([k, l]) => (
            <Pressable key={k} onPress={() => { setParams((s) => ({ ...s, [open]: k })); setOpen(null); }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: String(params[open]) === k ? BRAND : colors.gray[300] }}>
              <Text style={{ fontSize: 13, color: colors.gray[800] }}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Pressable
        disabled={missing || busy}
        onPress={() => onAdd(recipe.id, params)}
        style={{ alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.md, backgroundColor: missing ? colors.gray[200] : BRAND }}
      >
        <Text style={{ color: missing ? colors.gray[600] : '#fff', fontWeight: '600', fontSize: 13 }}>{missing ? 'Fill in the blanks' : 'Add'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Board automations (F-AUT-01, F-AUT-02): ready-made sentences for this board, and the ones you already added.
 * Each one is an ordinary automation of yours (it runs as you, with the usual limits), so it also shows in Automations.
 */
export default function BoardAutomate({ visible, board, onClose }) {
  const colors = useColors();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/boards/${board.id}/automations`, { __skipOops: true });
      setData(res.data);
    } catch {
      setData({ recipes: [], mine: [] });
    }
  }, [board.id]);
  useEffect(() => { if (visible) load(); }, [visible, load]);

  const add = async (recipe, params) => {
    setBusy(true);
    try {
      await api.post(`/boards/${board.id}/automations`, { recipe, params });
      showToast({ message: 'Automation added. It runs as you.', icon: 'flash' });
      load();
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not add it', icon: 'alert-circle-outline' });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (p) => {
    setData((d) => ({ ...d, mine: d.mine.map((x) => (x.id === p.id ? { ...x, enabled: !p.enabled } : x)) }));
    try { await api.put(`/automation/profiles/${p.id}`, { enabled: !p.enabled }); } catch { load(); }
  };
  const remove = async (p) => {
    setData((d) => ({ ...d, mine: d.mine.filter((x) => x.id !== p.id) }));
    try { await api.delete(`/automation/profiles/${p.id}`); } catch { load(); }
  };

  return (
    <Modal open={visible} onClose={onClose} title={`Automate ${board.name}`} width={560}>
      {!data ? <ActivityIndicator color={BRAND} style={{ margin: spacing.xl }} /> : (
        <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
          {data.mine.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>YOURS ON THIS BOARD</Text>
              {data.mine.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 }}>
                  <Ionicons name="flash" size={16} color={p.enabled ? BRAND : colors.gray[400]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.gray[900] }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.gray[500] }}>{p.runs_30d ? `Ran ${p.runs_30d} time${p.runs_30d === 1 ? '' : 's'} in 30 days` : 'Has not run yet'}</Text>
                  </View>
                  <Switch value={!!p.enabled} onValueChange={() => toggle(p)} />
                  <Pressable onPress={() => remove(p)} accessibilityLabel="Remove" hitSlop={6}><Ionicons name="trash-outline" size={16} color={colors.gray[500]} /></Pressable>
                </View>
              ))}
            </View>
          )}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>READY-MADE</Text>
          {data.recipes.map((r) => <Recipe key={r.id} recipe={r} onAdd={add} busy={busy} />)}
          <Pressable onPress={() => { onClose(); navigate('Automations'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
            <Ionicons name="construct-outline" size={15} color={BRAND} />
            <Text style={{ color: BRAND, fontWeight: '600', fontSize: 13 }}>Build your own in Automations</Text>
          </Pressable>
        </ScrollView>
      )}
    </Modal>
  );
}
