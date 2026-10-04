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
import TagInput from './TagInput';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { BLOCKER_KINDS } from '../../utils/timeline';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

const NOTE_PLACEHOLDER = {
  dependency: 'Why does it have to come first? (optional) Type @ to tag people, to-dos or a business',
  waiting_on: 'What do you need decided or suggested? Type @ to tag people, to-dos or a business',
  issue: 'What went wrong while doing this? Type @ to tag people, to-dos or a business',
  dead_stop: 'What stopped the work, and what is needed to continue? Type @ to tag people, to-dos or a business',
};

/**
 * "What is stopping this?" Four kinds:
 *  - Dependency: finish another to-do first, and/or a person has to do their part first
 *  - Needs a decision: an approval or suggestion from someone senior
 *  - Issue: something went wrong while doing it
 *  - Dead stop: work cannot continue at all
 * The note can tag people, to-dos and businesses with "@"; everyone tagged is told. Raising one marks
 * the to-do Blocked and starts the blocked-time clock.
 */
export default function BlockerSheet({ visible, todo, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, raiseBlocker } = useTodos();
  const { people } = useDirectory();
  const [kind, setKind] = useState('issue');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState('');
  const [depOn, setDepOn] = useState('todo'); // dependency: 'todo' | 'person'
  const [depId, setDepId] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setKind('issue');
      setNote('');
      setTags([]);
      setQuery('');
      setDepOn('todo');
      setDepId(null);
      setPersonId(null);
    }
  }, [visible]);

  // Only to-dos that can really hold this one up: the same business (everyone's), or the personal ones.
  // Never this to-do, its sub-tasks or its parent.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (todos || [])
      .filter((t) => !t.is_done && t.review_state !== 'rejected' && t.id !== todo?.id && t.parent_id !== todo?.id && t.id !== todo?.parent_id)
      .filter((t) => (todo?.business_id ? t.business_id === todo.business_id : !t.business_id))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.assignee_name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [todos, todo, query]);

  const peopleMatches = useMemo(() => {
    // A decision or suggestion can come from anyone: above you, beside you or below you.
    return filterPeople(people, query, { excludeIds: [user?.id], limit: 6 });
  }, [people, query, user?.id]);

  const valid = kind === 'dependency' ? (depOn === 'todo' ? !!depId : !!personId)
    : kind === 'waiting_on' ? (!!personId || note.trim().length > 0)
      : note.trim().length > 0;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const text = note.trim();
      await raiseBlocker(todo.id, {
        kind,
        note: text,
        blocked_by_todo_id: kind === 'dependency' && depOn === 'todo' ? depId : undefined,
        blocked_by_user_id: (kind === 'waiting_on' || (kind === 'dependency' && depOn === 'person')) ? personId : undefined,
        mentions: tags.map(({ type, id }) => ({ type, id })),
      });
      showToast({ message: 'Marked as blocked — the clock for blocked time is running', icon: 'hand-left' });
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not raise the blocker', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const personList = (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={kind === 'waiting_on' ? 'Search anyone whose decision or suggestion you need' : 'Search the person'}
        placeholderTextColor={colors.gray[400]}
        {...glass('inset')} style={styles.input}
      />
      {peopleMatches.map((p) => (
        <AnimatedPressable key={p.id} onPress={() => setPersonId(personId === p.id ? null : p.id)} haptic="light" style={styles.pickRow}>
          <Avatar name={p.name} uri={p.profile_picture} size={28} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickText, { fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
            {!!p.display_title && <Text style={styles.pickSub} numberOfLines={1}>{p.display_title}</Text>}
          </View>
          {personId === p.id && <Ionicons name="checkmark-circle" size={20} color={colors.brand[600]} />}
        </AnimatedPressable>
      ))}
      {!peopleMatches.length && <Text style={styles.hint}>No one matches.</Text>}
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={700} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>What is stopping this?</Text>
        <Text style={styles.sub} numberOfLines={2}>{todo?.title}</Text>

        <View style={styles.kinds}>
          {Object.entries(BLOCKER_KINDS).map(([key, k]) => (
            <AnimatedPressable
              key={key}
              onPress={() => { setKind(key); setQuery(''); setPersonId(null); setDepId(null); }}
              haptic="light"
              {...glass('inset')} style={[styles.kind, kind === key && styles.kindActive]}
            >
              <Ionicons name={k.icon} size={20} color={kind === key ? '#fff' : colors.brand[600]} />
              <Text style={[styles.kindLabel, kind === key && { color: '#fff' }]}>{k.short}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <Text style={styles.hint}>{BLOCKER_KINDS[kind].hint}</Text>

        {kind === 'dependency' && (
          <View>
            <View style={styles.switch}>
              {[['todo', 'A to-do', 'checkbox-outline'], ['person', 'A person', 'person-outline']].map(([key, label, icon]) => (
                <AnimatedPressable
                  key={key}
                  onPress={() => { setDepOn(key); setQuery(''); setPersonId(null); setDepId(null); }}
                  haptic="light"
                  style={[styles.switchItem, depOn === key && styles.switchActive]}
                >
                  <Ionicons name={icon} size={15} color={depOn === key ? '#fff' : colors.brand[700]} />
                  <Text style={[styles.switchText, depOn === key && { color: '#fff' }]}>{label}</Text>
                </AnimatedPressable>
              ))}
            </View>
            {depOn === 'todo' ? (
              <View>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={todo?.business_id ? 'Search a task in this business that must be done first' : 'Search your to-do that must be done first'}
                  placeholderTextColor={colors.gray[400]}
                  {...glass('inset')} style={styles.input}
                />
                {candidates.map((t) => (
                  <AnimatedPressable key={t.id} onPress={() => setDepId(depId === t.id ? null : t.id)} haptic="light" style={styles.pickRow}>
                    <Ionicons name={depId === t.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={depId === t.id ? colors.brand[600] : colors.gray[400]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickText} numberOfLines={2}>{t.title}</Text>
                      {!!t.assignee_name && <Text style={styles.pickSub} numberOfLines={1}>{t.assignee_id === user?.id ? 'Yours' : t.assignee_name}</Text>}
                    </View>
                  </AnimatedPressable>
                ))}
                {!candidates.length && <Text style={styles.hint}>No open to-dos match.</Text>}
              </View>
            ) : personList}
          </View>
        )}

        {kind === 'waiting_on' && personList}

        <TagInput
          value={note}
          onChangeText={setNote}
          tags={tags}
          onTagsChange={setTags}
          placeholder={NOTE_PLACEHOLDER[kind]}
          excludeTodoIds={[todo?.id]}
        />

        <AnimatedPressable disabled={!valid || saving} onPress={submit} haptic="medium" {...glass('accent')} style={[styles.submit, { opacity: valid && !saving ? 1 : 0.4 }]}>
          <Ionicons name="hand-left" size={18} color="#fff" />
          <Text style={styles.submitText}>Report as stuck</Text>
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
  switch: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  switchItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.brand[50] },
  switchActive: { backgroundColor: colors.brand[600] },
  switchText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
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
  pickText: { fontSize: fontSize.base, color: colors.gray[900] },
  pickSub: { fontSize: fontSize.sm, color: colors.gray[500] },
  submit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md,
    marginHorizontal: spacing.sm, paddingVertical: 13, borderRadius: radius.lg, backgroundColor: colors.brand[600],
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
});
