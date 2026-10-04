import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import { formatDue, todayYmd, addDays } from '../../utils/dates';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Quick choices for how long the goal runs, counted from today. */
export function periodPresets() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const quarterEndMonth = Math.floor(now.getMonth() / 3) * 3 + 3;
  const endOfQuarter = new Date(now.getFullYear(), quarterEndMonth, 0);
  return [
    { key: 'month', label: 'This month', end: ymd(endOfMonth) },
    { key: 'quarter', label: 'This quarter', end: ymd(endOfQuarter) },
    { key: '90', label: 'Next 90 days', end: addDays(todayYmd(), 90) },
  ];
}

const blankKr = () => ({ key: Math.random().toString(36).slice(2), title: '', kind: 'number', start: '0', target: '', unit: '', todoIds: [] });

/** Create a goal with its key results. */
export default function GoalSheet({ visible, onClose, onSaved, options }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { todos, businesses } = useTodos();
  const presets = useMemo(() => periodPresets(), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [scope, setScope] = useState('personal');
  const [bizId, setBizId] = useState(null);
  const [end, setEnd] = useState(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [krs, setKrs] = useState([blankKr()]);
  const [pickFor, setPickFor] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const manageable = useMemo(
    () => (businesses || []).filter((b) => (options?.manageable_businesses || []).includes(b.id)),
    [businesses, options]
  );

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDesc(''); setScope('personal'); setBizId(manageable[0]?.id || null);
    setEnd(presets[1].end); setKrs([blankKr()]); setPickFor(null); setSearch('');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key, change) => setKrs((list) => list.map((k) => (k.key === key ? { ...k, ...change } : k)));

  const openTodos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (todos || []).filter((t) => !t.is_done && !t.parent_id && (!q || t.title.toLowerCase().includes(q))).slice(0, 25);
  }, [todos, search]);

  const submit = async () => {
    if (!title.trim()) return showToast({ message: 'Give the goal a title', icon: 'alert-circle' });
    const filled = krs.filter((k) => k.title.trim());
    if (!filled.length) return showToast({ message: 'Add at least one key result', icon: 'alert-circle' });
    setBusy(true);
    try {
      const res = await api.post('/goals', {
        title: title.trim(),
        description: desc.trim(),
        scope,
        business_id: scope === 'business' ? bizId : undefined,
        starts_on: todayYmd(),
        ends_on: end,
        key_results: filled.map((k) => ({
          title: k.title.trim(),
          kind: k.kind,
          unit: k.unit.trim(),
          start_value: Number(k.start) || 0,
          target_value: k.kind === 'number' ? Number(k.target) : undefined,
          todo_ids: k.kind === 'todos' ? k.todoIds : undefined,
        })),
      });
      showToast({ message: 'Goal created', icon: 'flag' });
      onSaved?.(res.data.goal);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the goal', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const scopes = [
    { key: 'personal', label: 'Just me', icon: 'person' },
    ...(manageable.length ? [{ key: 'business', label: 'A business', icon: 'business' }] : []),
    ...(options?.can_company ? [{ key: 'company', label: 'Whole company', icon: 'globe' }] : []),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={720}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>New goal</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="What do you want to achieve?" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={160} autoFocus />
        <TextInput value={desc} onChangeText={setDesc} placeholder="Why it matters (optional)" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { minHeight: 56 }]} multiline maxLength={1000} />

        <Text style={styles.label}>Whose goal</Text>
        <View style={styles.row}>
          {scopes.map((s) => <Chip key={s.key} icon={s.icon} label={s.label} active={scope === s.key} onPress={() => setScope(s.key)} />)}
        </View>
        {scope === 'business' && (
          <View style={styles.row}>
            {manageable.map((b) => <Chip key={b.id} small label={b.name} active={bizId === b.id} onPress={() => setBizId(b.id)} />)}
          </View>
        )}

        <Text style={styles.label}>Finish by</Text>
        <View style={styles.row}>
          {presets.map((p) => <Chip key={p.key} small label={p.label} active={end === p.end} onPress={() => setEnd(p.end)} />)}
          <Chip small icon="calendar" label={end && !presets.some((p) => p.end === end) ? formatDue(end) : 'Pick a date'} active={!!end && !presets.some((p) => p.end === end)} onPress={() => setDateOpen(true)} />
        </View>

        <Text style={styles.label}>Key results</Text>
        <Text style={styles.hint}>How you will know it worked. A number you update by hand, or a set of to-dos that measure themselves.</Text>
        {krs.map((k, i) => (
          <View key={k.key} style={styles.kr}>
            <View style={styles.krHead}>
              <Text style={styles.krNum}>{i + 1}</Text>
              <TextInput value={k.title} onChangeText={(v) => patch(k.key, { title: v })} placeholder="Key result" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { flex: 1, marginTop: 0 }]} maxLength={160} />
              {krs.length > 1 && (
                <AnimatedPressable onPress={() => setKrs((l) => l.filter((x) => x.key !== k.key))} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.gray[400]} />
                </AnimatedPressable>
              )}
            </View>
            <View style={styles.row}>
              <Chip small icon="trending-up" label="A number" active={k.kind === 'number'} onPress={() => patch(k.key, { kind: 'number' })} />
              <Chip small icon="checkbox" label="Linked to-dos" active={k.kind === 'todos'} onPress={() => patch(k.key, { kind: 'todos' })} />
            </View>
            {k.kind === 'number' ? (
              <View style={styles.row}>
                <TextInput value={k.start} onChangeText={(v) => patch(k.key, { start: v })} keyboardType="numeric" placeholder="From" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, styles.small]} />
                <Ionicons name="arrow-forward" size={14} color={colors.gray[400]} />
                <TextInput value={k.target} onChangeText={(v) => patch(k.key, { target: v })} keyboardType="numeric" placeholder="Target" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, styles.small]} />
                <TextInput value={k.unit} onChangeText={(v) => patch(k.key, { unit: v })} placeholder="Unit (Rs, %, ...)" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { flex: 1, marginTop: 0 }]} maxLength={20} />
              </View>
            ) : (
              <View>
                <AnimatedPressable onPress={() => { setPickFor(pickFor === k.key ? null : k.key); setSearch(''); }} style={styles.pickBtn}>
                  <Ionicons name="link" size={14} color={colors.brand[600]} />
                  <Text style={styles.pickText}>{k.todoIds.length ? `${k.todoIds.length} to-do${k.todoIds.length === 1 ? '' : 's'} linked` : 'Choose to-dos'}</Text>
                </AnimatedPressable>
                {pickFor === k.key && (
                  <View style={styles.picker}>
                    <TextInput value={search} onChangeText={setSearch} placeholder="Search your to-dos" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { marginTop: 0 }]} />
                    {openTodos.map((t) => {
                      const on = k.todoIds.includes(t.id);
                      return (
                        <AnimatedPressable key={t.id} onPress={() => patch(k.key, { todoIds: on ? k.todoIds.filter((x) => x !== t.id) : [...k.todoIds, t.id] })} style={styles.pickRow}>
                          <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? colors.brand[600] : colors.gray[400]} />
                          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.gray[800] }} numberOfLines={1}>{t.title}</Text>
                        </AnimatedPressable>
                      );
                    })}
                    {!openTodos.length && <Text style={styles.hint}>No open to-dos match.</Text>}
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
        {krs.length < 8 && (
          <AnimatedPressable onPress={() => setKrs((l) => [...l, blankKr()])} style={styles.addKr}>
            <Ionicons name="add" size={16} color={colors.brand[600]} />
            <Text style={styles.pickText}>Add a key result</Text>
          </AnimatedPressable>
        )}

        <PrimaryButton onPress={submit} loading={busy} style={{ marginTop: spacing.lg }}>Create goal</PrimaryButton>
      </ScrollView>
      <DueDatePicker visible={dateOpen} onClose={() => setDateOpen(false)} date={end} allowTime={false} onChange={({ date }) => { if (date) setEnd(date); setDateOpen(false); }} />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 6 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.sm },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.md },
  hint: { fontSize: fontSize.xs, color: colors.gray[500], lineHeight: 17 },
  input: {
    marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100],
    fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none',
  },
  small: { width: 80, marginTop: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  kr: { padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 4, marginTop: spacing.sm },
  krHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  krNum: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '800', color: colors.brand[700], backgroundColor: colors.brand[100] },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  pickText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  picker: { gap: 2, marginTop: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  addKr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.md },
});
