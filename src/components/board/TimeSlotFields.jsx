import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { showToast } from '../../utils/events';
import { formatTime, todayYmd } from '../../utils/dates';
import { parseTimeText } from '../DueDatePicker';

const addMinutes = (hm, min) => { const t = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + min; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const minutesBetween = (a, b) => (Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5))) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)));

/**
 * The clock times of a Timeline: "from 5pm to 6pm" on each day of it. From is the task's time and the length is its
 * time needed, so the Timebox (the board's day planner) shows the task in that slot with no other step. Saved once,
 * when focus leaves the pair; the text is never overwritten while the person types.
 */
export default function TimeSlotFields({ item, actions, canEdit = true }) {
  const colors = useColors();
  const start = item.due_time ? String(item.due_time).slice(0, 5) : '';
  const end = start && item.duration_minutes ? addMinutes(start, item.duration_minutes) : '';
  const [from, setFrom] = useState(start ? formatTime(start) : '');
  const [to, setTo] = useState(end ? formatTime(end) : '');
  const inside = useRef(false);
  const latest = useRef({ from, to });
  latest.current = { from, to };
  const leave = useRef(null);
  useEffect(() => { if (!inside.current) { setFrom(start ? formatTime(start) : ''); setTo(end ? formatTime(end) : ''); } }, [start, end]);
  useEffect(() => () => clearTimeout(leave.current), []);

  const apply = (nextFrom, nextTo) => {
    const f = nextFrom.trim() ? parseTimeText(nextFrom) : null;
    const t = nextTo.trim() ? parseTimeText(nextTo) : null;
    if ((nextFrom.trim() && !f) || (nextTo.trim() && !t)) { showToast({ message: 'Type a time like 5pm or 17:30', icon: 'alert-circle-outline' }); return; }
    if (!f) {
      if (t) showToast({ message: 'Set the start time first', icon: 'information-circle' });
      if (start) actions.updateFields(item, { due_time: null });
      return;
    }
    const patch = { due_time: f };
    if (!item.due_date) patch.due_date = todayYmd();
    if (!item.start_date) patch.start_date = item.due_date || patch.due_date;
    if (t) {
      const len = minutesBetween(f, t);
      if (len <= 0) { showToast({ message: 'The end must be after the start', icon: 'alert-circle-outline' }); return; }
      patch.duration_minutes = len;
    } else if (!item.duration_minutes) patch.duration_minutes = 60;
    if (f !== start || (patch.duration_minutes && patch.duration_minutes !== item.duration_minutes) || patch.due_date) actions.updateFields(item, patch);
  };
  const onFocus = () => { inside.current = true; clearTimeout(leave.current); };
  const onBlur = () => { clearTimeout(leave.current); leave.current = setTimeout(() => { inside.current = false; apply(latest.current.from, latest.current.to); }, 150); };
  const box = { flex: 1, minHeight: 36, borderRadius: radius.sm, backgroundColor: colors.gray[100], paddingHorizontal: spacing.sm, fontSize: 14, color: colors.gray[900], outlineStyle: 'none', minWidth: 0 };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="time-outline" size={16} color={colors.gray[600]} />
      <TextInput value={from} onChangeText={setFrom} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={() => apply(from, to)} editable={canEdit} placeholder="From, 5pm" placeholderTextColor={colors.gray[400]} style={box} />
      <Text style={{ color: colors.gray[500] }}>to</Text>
      <TextInput value={to} onChangeText={setTo} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={() => apply(from, to)} editable={canEdit} placeholder="To, 6pm" placeholderTextColor={colors.gray[400]} style={box} />
      {canEdit && !!start && <Pressable onPress={() => actions.updateFields(item, { due_time: null })} accessibilityLabel="Clear the times" hitSlop={6}><Ionicons name="close-circle" size={18} color={colors.gray[400]} /></Pressable>}
    </View>
  );
}
