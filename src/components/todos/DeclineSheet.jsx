import { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import useLoad, { loadText } from '../../hooks/useLoad';
import api from '../../api/client';
import { showToast } from '../../utils/events';

/** A first name that reads well: "T Vinod Kumar" gives "T Vinod", not "T". */
const short = (name) => { const w = String(name || '').trim().split(/\s+/); return (w[0].length <= 1 && w[1] ? `${w[0]} ${w[1]}` : w[0]) || 'them'; };

const REASONS = ['Not my area', 'I have too much on', 'Someone else is better placed'];

/**
 * "This was not on my plate." For a task someone else gave me (`todo.permissions.can_decline`): Decline sends it back
 * to the person who gave it to me and says why; Hand over gives it to someone else instead. Either way it stops being
 * mine, the person who gave it to me is told and the activity keeps the reason (POST /todos/:id/decline).
 * `onDone(result)` runs after it worked, so the screen behind can drop the task from my lists.
 */
export default function DeclineSheet({ visible, todo, onClose, onDone }) {
  const colors = useColors();
  const { user } = useAuth();
  const { fetchAssignees } = useTodos();
  const { people } = useDirectory();
  const load = useLoad(visible);
  const [mode, setMode] = useState('decline'); // decline | handover
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [bizPeople, setBizPeople] = useState([]);
  const giver = short(todo?.assigned_by_name);

  useEffect(() => { if (visible) { setMode('decline'); setReason(''); setQuery(''); setTarget(null); } }, [visible]);
  // Business work can only go to people in that business.
  useEffect(() => {
    if (!visible || !todo?.business_id) return;
    fetchAssignees(todo.business_id).then(setBizPeople).catch(() => setBizPeople([]));
  }, [visible, todo?.business_id, fetchAssignees]);

  const pool = (todo?.business_id ? bizPeople : people).filter((p) => p.id !== user?.id);
  const list = filterPeople(pool, query.trim(), { limit: 8 });
  const needReason = mode === 'decline';
  const ready = mode === 'decline' ? !!reason.trim() : !!target;

  const submit = async () => {
    if (!ready) return;
    try {
      const res = await api.post(`/todos/${todo.id}/decline`, mode === 'decline' ? { reason: reason.trim() } : { transfer_to: target.id, reason: reason.trim() });
      showToast({
        message: res.data.transferred ? `Handed over to ${short(res.data.to.name)}` : `Declined. It went back to ${short(res.data.to.name)}`,
        tone: 'success', icon: 'arrow-undo',
      });
      onClose?.();
      onDone?.(res.data);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not do that', tone: 'error' });
    }
  };

  const Seg = ({ id, label, icon }) => (
    <AnimatedPressable
      onPress={() => setMode(id)} haptic="light" accessibilityLabel={label}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: mode === id ? colors.white : 'transparent' }}
    >
      <Ionicons name={icon} size={16} color={mode === id ? colors.gray[900] : colors.gray[500]} />
      <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: mode === id ? colors.gray[900] : colors.gray[500] }}>{label}</Text>
    </AnimatedPressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm, gap: spacing.md }}>
        <View>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] }}>Not on your plate?</Text>
          <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 }}>{todo?.title}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg, backgroundColor: colors.gray[100] }}>
          <Seg id="decline" label="Decline" icon="arrow-undo-outline" />
          <Seg id="handover" label="Hand over" icon="person-add-outline" />
        </View>

        <Text style={{ fontSize: fontSize.sm, color: colors.gray[600] }}>
          {mode === 'decline'
            ? `It goes back to ${giver}, who gave it to you. They are told why.`
            : `Give it to someone else. They become accountable, and ${giver} is told.`}
        </Text>

        {mode === 'handover' && (
          <View style={{ gap: 4 }}>
            {target ? (
              <AnimatedPressable onPress={() => setTarget(null)} haptic="light" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.brand[50] }}>
                <Avatar name={target.name} uri={target.profile_picture} size={34} />
                <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }}>{target.name}</Text>
                <Ionicons name="close-circle" size={20} color={colors.gray[500]} />
              </AnimatedPressable>
            ) : (
              <>
                <TextInput
                  value={query} onChangeText={setQuery} accessibilityLabel="Search people"
                  placeholder={todo?.business_id ? 'Search people in this business' : 'Search anyone in the organisation'} placeholderTextColor={colors.gray[400]}
                  style={{ backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' }}
                />
                {list.map((p) => (
                  <AnimatedPressable key={p.id} onPress={() => setTarget(p)} haptic="light" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 }}>
                    <Avatar name={p.name} uri={p.profile_picture} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }}>{p.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: load[p.id]?.late ? colors.red[600] : colors.gray[500] }}>{loadText(load[p.id])}</Text>
                    </View>
                  </AnimatedPressable>
                ))}
              </>
            )}
          </View>
        )}

        {mode === 'decline' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map((r) => (
              <AnimatedPressable key={r} onPress={() => setReason(r)} haptic="light" style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: reason === r ? colors.brand[50] : colors.gray[100] }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: reason === r ? colors.brand[700] : colors.gray[700] }}>{r}</Text>
              </AnimatedPressable>
            ))}
          </View>
        )}

        <TextInput
          value={reason} onChangeText={setReason} multiline accessibilityLabel="Reason"
          placeholder={needReason ? `Why can't you take it? ${giver} will see this` : 'A note (optional). It is not on my plate'} placeholderTextColor={colors.gray[400]}
          style={{ minHeight: 70, maxHeight: 130, backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' }}
        />

        <AnimatedPressable
          onPress={submit} disabled={!ready} haptic="medium"
          style={{ alignItems: 'center', paddingVertical: 13, borderRadius: radius.lg, backgroundColor: colors.brand[600], opacity: ready ? 1 : 0.4 }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.base }}>
            {mode === 'decline' ? 'Decline task' : target ? `Hand over to ${short(target.name)}` : 'Pick who gets it'}
          </Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}
