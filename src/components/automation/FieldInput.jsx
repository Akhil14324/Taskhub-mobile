import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import useDirectory from '../../hooks/useDirectory';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { Chip, Avatar } from '../kit';
import { formatDue } from '../../utils/dates';
import { DAY_NAMES } from './meta';

const PRIORITIES = [{ value: '1', label: 'Urgent' }, { value: '2', label: 'High' }, { value: '3', label: 'Medium' }, { value: '4', label: 'Low' }];
const STATUSES = [{ value: 'todo', label: 'To do' }, { value: 'in_progress', label: 'In progress' }, { value: 'on_hold', label: 'On hold' }];
const QUICK_TIMES = ['07:00', '08:30', '09:00', '12:00', '14:00', '17:30', '20:00'];

const pad = (n) => String(n).padStart(2, '0');
const stepTime = (hm, minutes) => {
  const [h, m] = (hm || '09:00').split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

function Label({ children, hint }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: spacing.md, gap: 2 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] }}>{children}</Text>
      {!!hint && <Text style={{ fontSize: fontSize.xs, color: colors.gray[500], lineHeight: 16 }}>{hint}</Text>}
    </View>
  );
}

/** Tap to add a %variable to a text box. Collapsed until asked for, so the form stays calm. */
function VariableRow({ vars, onPick }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  if (!vars?.length) return null;
  return (
    <View style={{ marginTop: 4 }}>
      <AnimatedPressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 }}>
        <Ionicons name={open ? 'chevron-down' : 'add-circle-outline'} size={14} color={colors.brand[600]} />
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.brand[600] }}>{open ? 'Hide variables' : 'Insert a variable'}</Text>
      </AnimatedPressable>
      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
          {vars.map((v) => <Chip key={v} small label={`%${v}`} onPress={() => onPick(`%${v}`)} />)}
        </ScrollView>
      )}
    </View>
  );
}

function PersonPicker({ visible, onClose, onPick }) {
  const colors = useColors();
  const { people } = useDirectory();
  const [q, setQ] = useState('');
  const [variable, setVariable] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people || []).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.username || '').toLowerCase().includes(s)).slice(0, 40);
  }, [people, q]);
  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={560}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: 4 }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] }}>Choose a person</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={inputStyle(colors)} />
        {list.map((p) => (
          <AnimatedPressable key={p.id} onPress={() => { onPick(String(p.id), p.name); onClose(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 }}>
            <Avatar name={p.name} uri={p.profile_picture} size={30} />
            <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.gray[900], fontWeight: '600' }}>{p.name}</Text>
          </AnimatedPressable>
        ))}
        <Text style={{ fontSize: fontSize.xs, color: colors.gray[500], marginTop: spacing.md }}>Or pick whoever a variable names, such as %message_from_id</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TextInput value={variable} onChangeText={setVariable} placeholder="%message_from_id" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[inputStyle(colors), { flex: 1 }]} autoCapitalize="none" />
          <Chip label="Use" onPress={() => { if (variable.trim()) { onPick(variable.trim(), variable.trim()); onClose(); } }} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const inputStyle = (colors) => ({
  marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100],
  fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none',
});

/**
 * One form field, drawn from its catalog description. `ctx` carries what some fields need:
 * { tasks, vars (names usable in a text), personNames }.
 */
export default function FieldInput({ field, value, onChange, ctx = {} }) {
  const colors = useColors();
  const { businesses } = useTodos();
  const { people } = useDirectory();
  const [datePicker, setDatePicker] = useState(false);
  const [personPicker, setPersonPicker] = useState(false);
  const style = useMemo(() => inputStyle(colors), [colors]);
  const set = onChange;
  const add = (v) => set(`${value || ''}${value && !String(value).endsWith(' ') ? ' ' : ''}${v}`);

  const body = (() => {
    switch (field.type) {
      case 'text':
      case 'label':
        return (
          <>
            <TextInput value={String(value ?? '')} onChangeText={set} placeholder={field.placeholder || ''} placeholderTextColor={colors.gray[400]} {...glass('inset')} style={style} autoCapitalize="none" maxLength={1000} />
            {!field.raw && <VariableRow vars={ctx.vars} onPick={add} />}
          </>
        );
      case 'textarea':
        return (
          <>
            <TextInput value={String(value ?? '')} onChangeText={set} placeholder={field.placeholder || ''} placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[style, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={3000} />
            <VariableRow vars={ctx.vars} onPick={add} />
          </>
        );
      case 'number':
        return (
          <TextInput
            value={value === null || value === undefined ? '' : String(value)}
            onChangeText={(t) => set(t.replace(',', '.'))}
            keyboardType="numeric"
            {...glass('inset')}
            style={[style, { width: 160 }]}
          />
        );
      case 'select':
        return (
          <View style={styles.row}>
            {(field.options || []).map((o) => <Chip key={o.value} small label={o.label} active={String(value) === o.value} onPress={() => set(o.value)} />)}
          </View>
        );
      case 'priority':
        return <View style={styles.row}>{PRIORITIES.map((o) => <Chip key={o.value} small label={o.label} active={String(value) === o.value} onPress={() => set(o.value)} />)}</View>;
      case 'status':
        return <View style={styles.row}>{STATUSES.map((o) => <Chip key={o.value} small label={o.label} active={String(value) === o.value} onPress={() => set(o.value)} />)}</View>;
      case 'bool':
        return (
          <AnimatedPressable onPress={() => set(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}>
            <Ionicons name={value ? 'toggle' : 'toggle-outline'} size={34} color={value ? colors.brand[600] : colors.gray[400]} />
            <Text style={{ fontSize: fontSize.sm, color: colors.gray[700] }}>{value ? 'Yes' : 'No'}</Text>
          </AnimatedPressable>
        );
      case 'time': {
        const v = value || '';
        return (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AnimatedPressable onPress={() => set(stepTime(v, -15))} style={styles.step}><Ionicons name="remove" size={16} color={colors.gray[700]} /></AnimatedPressable>
              <TextInput value={v} onChangeText={(t) => set(t.replace(/[^0-9:]/g, '').slice(0, 5))} placeholder="09:00" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[style, { width: 96, marginTop: 0, textAlign: 'center' }]} keyboardType="numbers-and-punctuation" />
              <AnimatedPressable onPress={() => set(stepTime(v, 15))} style={styles.step}><Ionicons name="add" size={16} color={colors.gray[700]} /></AnimatedPressable>
              {field.optional && !!v && <Chip small label="Clear" onPress={() => set('')} />}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {QUICK_TIMES.map((t) => <Chip key={t} small label={t} active={v === t} onPress={() => set(t)} />)}
            </ScrollView>
          </View>
        );
      }
      case 'days': {
        const days = Array.isArray(value) ? value : [];
        const toggle = (d) => set(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
        return (
          <View style={{ gap: 6 }}>
            <View style={styles.row}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <Chip key={d} small label={DAY_NAMES[d]} active={days.includes(d)} onPress={() => toggle(d)} />)}
            </View>
            <View style={styles.row}>
              <Chip small label="Weekdays" onPress={() => set([1, 2, 3, 4, 5])} />
              <Chip small label="Every day" onPress={() => set([])} />
              <Chip small label="Weekends" onPress={() => set([0, 6])} />
            </View>
            <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>{days.length === 0 ? 'Every day' : `${days.length} day${days.length === 1 ? '' : 's'} chosen`}</Text>
          </View>
        );
      }
      case 'date':
        return (
          <>
            <AnimatedPressable onPress={() => setDatePicker(true)} {...glass('inset')} style={[style, { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.brand[600]} />
              <Text style={{ color: colors.gray[900], fontSize: fontSize.base }}>{value ? formatDue(value) : 'Pick a date'}</Text>
            </AnimatedPressable>
            <DueDatePicker visible={datePicker} onClose={() => setDatePicker(false)} date={value || null} allowTime={false} onChange={({ date }) => { if (date) set(date); setDatePicker(false); }} />
          </>
        );
      case 'person': {
        const id = String(value || '');
        const person = (people || []).find((p) => String(p.id) === id);
        return (
          <>
            <View style={styles.row}>
              <AnimatedPressable onPress={() => setPersonPicker(true)} {...glass('inset')} style={[style, { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 0 }]}>
                <Ionicons name="person-outline" size={16} color={colors.brand[600]} />
                <Text style={{ color: id ? colors.gray[900] : colors.gray[400], fontSize: fontSize.base }}>{id ? (person ? person.name : id) : 'Choose a person'}</Text>
              </AnimatedPressable>
              {!!id && field.optional && <Chip small label="Clear" onPress={() => set('')} />}
            </View>
            <PersonPicker visible={personPicker} onClose={() => setPersonPicker(false)} onPick={(v) => set(v)} />
          </>
        );
      }
      case 'business':
        return (
          <View style={styles.row}>
            <Chip small label="None" active={!value} onPress={() => set('')} />
            {(businesses || []).map((b) => <Chip key={b.id} small label={b.name} active={String(value) === String(b.id)} onPress={() => set(String(b.id))} />)}
          </View>
        );
      case 'task':
        return (
          <View style={styles.row}>
            {(ctx.tasks || []).map((t) => <Chip key={t.id} small label={t.name} active={String(value) === String(t.id)} onPress={() => set(String(t.id))} />)}
            {!(ctx.tasks || []).length && <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>You have no tasks yet. Make one in the Tasks tab.</Text>}
          </View>
        );
      case 'cond': {
        const c = value && typeof value === 'object' ? value : { left: '', op: 'eq', right: '' };
        const ops = ctx.comparisons || [];
        const current = ops.find((o) => o.value === c.op);
        return (
          <View style={{ gap: 6 }}>
            <TextInput value={c.left} onChangeText={(t) => set({ ...c, left: t })} placeholder="%todo_title" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={style} autoCapitalize="none" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {ops.map((o) => <Chip key={o.value} small label={o.label} active={c.op === o.value} onPress={() => set({ ...c, op: o.value })} />)}
            </ScrollView>
            {(!current || current.needs > 1) && (
              <TextInput value={c.right} onChangeText={(t) => set({ ...c, right: t })} placeholder="value" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[style, { marginTop: 0 }]} autoCapitalize="none" />
            )}
            <VariableRow vars={ctx.vars} onPick={(v) => set({ ...c, left: c.left ? `${c.left} ${v}` : v })} />
          </View>
        );
      }
      default:
        return null;
    }
  })();

  return (
    <View>
      <Label hint={field.hint}>{field.label}</Label>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});

/** Does a field show right now, given the other values of the same item? */
export function fieldVisible(field, values) {
  return !field.showWhen || String(values[field.showWhen.key]) === field.showWhen.is;
}
