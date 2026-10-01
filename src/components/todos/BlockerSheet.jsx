import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { BLOCKER_KINDS } from '../../utils/timeline';
import { showToast } from '../../utils/events';

/**
 * "What is stopping this?" — a dependency on another to-do, waiting on someone, an issue, or a
 * dead stop. Raising one marks the to-do Blocked and starts the blocked-time clock.
 */
export default function BlockerSheet({ visible, todo, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, raiseBlocker } = useTodos();
  const { people } = useDirectory();
  const [kind, setKind] = useState('issue');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [depId, setDepId] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setKind('issue');
      setNote('');
      setQuery('');
      setDepId(null);
      setPersonId(null);
    }
  }, [visible]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todos
      .filter((t) => !t.is_done && t.id !== todo?.id && t.parent_id !== todo?.id && t.id !== todo?.parent_id)
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [todos, todo, query]);
  const peopleMatches = useMemo(
    () => filterPeople(people, query, { excludeIds: [user?.id], limit: 6 }),
    [people, query, user?.id]
  );

  const valid = kind === 'dependency' ? !!depId
    : kind === 'waiting_on' ? (!!personId || note.trim().length > 0)
      : note.trim().length > 0;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await raiseBlocker(todo.id, {
        kind,
        note: note.trim(),
        blocked_by_todo_id: kind === 'dependency' ? depId : undefined,
        blocked_by_user_id: kind === 'waiting_on' ? personId : undefined,
      });
      showToast({ message: 'Marked as blocked — the clock for blocked time is running', icon: 'hand-left' });
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not raise the blocker', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={680} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>What is blocking this?</Text>
        <Text style={styles.sub} numberOfLines={2}>{todo?.title}</Text>

        <View style={styles.kinds}>
          {Object.entries(BLOCKER_KINDS).map(([key, k]) => (
            <AnimatedPressable
              key={key}
              onPress={() => { setKind(key); setQuery(''); }}
              haptic="light"
              style={[styles.kind, kind === key && styles.kindActive]}
            >
              <Ionicons name={k.icon} size={20} color={kind === key ? '#fff' : colors.brand[600]} />
              <Text style={[styles.kindLabel, kind === key && { color: '#fff' }]}>{k.short}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <Text style={styles.hint}>{BLOCKER_KINDS[kind].hint}</Text>

        {kind === 'dependency' && (
          <View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search the to-do it is waiting on"
              placeholderTextColor={colors.gray[400]}
              style={styles.input}
            />
            {candidates.map((t) => (
              <AnimatedPressable key={t.id} onPress={() => setDepId(t.id)} haptic="light" style={styles.pickRow}>
                <Ionicons name={depId === t.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={depId === t.id ? colors.brand[600] : colors.gray[400]} />
                <Text style={styles.pickText} numberOfLines={2}>{t.title}</Text>
              </AnimatedPressable>
            ))}
            {!candidates.length && <Text style={styles.hint}>No open to-dos match.</Text>}
          </View>
        )}

        {kind === 'waiting_on' && (
          <View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search who you are waiting on (or just describe below)"
              placeholderTextColor={colors.gray[400]}
              style={styles.input}
            />
            {peopleMatches.map((p) => (
              <AnimatedPressable key={p.id} onPress={() => setPersonId(personId === p.id ? null : p.id)} haptic="light" style={styles.pickRow}>
                <Avatar name={p.name} uri={p.profile_picture} size={28} />
                <Text style={[styles.pickText, { fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
                {personId === p.id && <Ionicons name="checkmark-circle" size={20} color={colors.brand[600]} />}
              </AnimatedPressable>
            ))}
          </View>
        )}

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={kind === 'dead_stop' ? 'What happened? What is needed to continue?' : 'Details (what exactly is the problem?)'}
          placeholderTextColor={colors.gray[400]}
          style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
          multiline
        />

        <AnimatedPressable disabled={!valid || saving} onPress={submit} haptic="medium" style={[styles.submit, { opacity: valid && !saving ? 1 : 0.4 }]}>
          <Ionicons name="hand-left" size={18} color="#fff" />
          <Text style={styles.submitText}>Mark as blocked</Text>
        </AnimatedPressable>
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heading: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], paddingHorizontal: spacing.sm },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, marginBottom: spacing.md, marginTop: 2 },
  kinds: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm },
  kind: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.brand[50] },
  kindActive: { backgroundColor: colors.brand[600] },
  kindLabel: { fontSize: 11, fontWeight: '700', color: colors.brand[700] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, paddingHorizontal: spacing.md },
  pickText: { flex: 1, fontSize: fontSize.base, color: colors.gray[900] },
  submit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md,
    marginHorizontal: spacing.sm, paddingVertical: 13, borderRadius: radius.lg, backgroundColor: colors.brand[600],
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
});
