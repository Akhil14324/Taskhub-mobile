import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { SlideGroup, SlideItem } from '../SlideGroup';
import useIsDesktop from '../../hooks/useBreakpoint';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import { Chip, PRIORITY, Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import {
  parseQuickAdd, detectDelegate, activeMentionQuery, completeMention, activeLabelQuery, completeLabel, removeLabelToken,
} from '../../utils/quickAdd';
import { formatDue, formatTime, RECURRENCE_LABELS } from '../../utils/dates';
import { DURATION_PRESETS, formatDuration } from '../../utils/todoMeta';
import { showToast } from '../../utils/events';
import useVoiceInput from '../../hooks/useVoiceInput';
import VoiceLive from '../VoiceLive';
import autoGrow, { virtualKeyboardUp } from '../../utils/autoGrow';
import { useLang } from '../../context/LanguageContext';

const RECURRENCE_ORDER = [null, 'daily', 'weekdays', 'weekly', 'monthly'];

/**
 * Quick add. Type naturally: dates, times, p1 to p4, #List, @person, +label, "for 2h" (estimate),
 * "{15 oct}" (deadline) and "every day" are recognised and shown as chips. Enter adds and keeps the
 * sheet open for the next one. Everything rarely needed sits behind "More".
 *
 * It adds either a personal to-do or, when a business is chosen, work for that business: set directly
 * by someone who manages it, otherwise sent as a proposal for review.
 * `defaults` may carry due_date, list_id, section_id, parent_id (a sub-task), business_id, assign_to.
 */
export default function QuickAddSheet({ visible, onClose, defaults = {}, initialText = '', origin = null, onMorphStart, onClosed }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { lists, businesses, labels: knownLabels, createTodo, fetchAssignees } = useTodos();
  const { people } = useDirectory();
  const inputRef = useRef(null);
  const desktop = useIsDesktop();
  const { lang } = useLang();
  const voice = useVoiceInput({ lang: lang === 'te' ? 'te-IN' : 'en-IN', onFinish: () => inputRef.current?.focus() });
  const { listening, live, levels } = voice;
  // Single: one to-do (Enter adds it). Multiple: one to-do per line (Enter adds a line on a touch keyboard).
  const [multi, setMultiState] = useState(() => { try { return localStorage.getItem('quickadd:multi') === '1'; } catch { return false; } });
  const setMulti = (v) => { setMultiState(v); try { localStorage.setItem('quickadd:multi', v ? '1' : '0'); } catch { /* private mode */ } };
  const submitNext = useRef(false);
  const [delegateOff, setDelegateOff] = useState(false);

  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  // Explicit picks from the buttons win over what the parser finds; `false` = cleared.
  const [override, setOverride] = useState({});
  const [extraLabels, setExtraLabels] = useState([]);
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(null); // 'priority' | 'where' | 'label' | 'more' | 'assignee' | null
  // The person made accountable for a personal to-do (must be one of the @mentioned); others just share it.
  const [assignId, setAssignId] = useState(null);
  const [bizAssignee, setBizAssignee] = useState(null); // user id, null = open to the business
  const [bizPeople, setBizPeople] = useState([]);
  const [review, setReview] = useState(null); // null = server default
  // "Assign": a personal to-do handed to someone below me. It goes to their list and stays off mine.
  const [giveTo, setGiveTo] = useState(null);
  const [giveQuery, setGiveQuery] = useState('');

  const isSubtask = !!defaults.parent_id;
  const businessId = override.business_id !== undefined ? override.business_id : (defaults.business_id ?? null);
  const business = businesses.find((b) => b.id === businessId) || null;

  useEffect(() => {
    if (visible) {
      setText(initialText || '');
      setNotes('');
      setOverride({});
      setExtraLabels(defaults.labels || []);
      setAssignId(null);
      setBizAssignee(defaults.assign_to ?? null);
      setReview(null);
      setGiveTo(null);
      setGiveQuery('');
      setDelegateOff(false);
      setMenu(null);
      // Take focus as soon as the input exists, never after the animation: iOS refuses to raise the keyboard
      // outside a tap, but it keeps it up while focus moves from the capsule's input to this one. Retried
      // because the sheet mounts its content a beat after `visible` flips.
      const timers = [0, 40, 100, 200, 350, 600].map((ms) => setTimeout(() => {
        const el = inputRef.current;
        if (el && !(Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement === el)) el.focus();
      }, ms));
      return () => timers.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialText]);

  // People business work can be given to.
  useEffect(() => {
    setBizPeople([]);
    if (!visible || !businessId) return;
    fetchAssignees(businessId).then(setBizPeople).catch(() => setBizPeople([]));
  }, [visible, businessId, fetchAssignees]);

  // "ask Ravi to send the invoice friday": the person it is for, and the task without the instruction.
  // Single: newlines fold into spaces. Multiple: one to-do per line, and the chips below read the first line.
  const lineList = useMemo(() => (multi ? text.split('\n').map((t) => t.trim()).filter(Boolean) : []), [multi, text]);
  const flat = multi ? (lineList[0] || '') : text.replace(/\s*\n\s*/g, ' ');
  const delegate = useMemo(
    () => (delegateOff || isSubtask || multi ? null : detectDelegate(flat, businessId ? bizPeople : people, user?.id)),
    [flat, multi, delegateOff, isSubtask, businessId, bizPeople, people, user]
  );
  const parsed = useMemo(() => {
    const out = parseQuickAdd(delegate ? delegate.rest : flat, lists);
    if (delegate && out.title) out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
    return out;
  }, [flat, delegate, lists]);
  const pick = (key, fallback) => (override[key] === false ? null : override[key] ?? parsed[key] ?? fallback ?? null);
  const dueDate = pick('due_date', defaults.due_date);
  const dueTime = dueDate ? pick('due_time') : null;
  const priority = pick('priority', 4);
  const recurrence = pick('recurrence');
  const deadline = pick('deadline_date');
  const duration = pick('duration_minutes');
  const listId = businessId || giveTo ? null : (override.list_id !== undefined ? override.list_id : (parsed.list?.id ?? defaults.list_id ?? null));
  const list = lists.find((l) => l.id === listId);
  // A default section only applies while the list is still the default one.
  const sectionId = (listId ?? null) === (defaults.list_id ?? null) ? defaults.section_id ?? null : null;
  const allLabels = [...new Set([...parsed.labels, ...extraLabels])];

  const mentionQuery = activeMentionQuery(text);
  const canSend = multi ? lineList.length > 0 : !!parsed.title;
  const suggestions = mentionQuery !== null && !businessId
    ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 6 })
    : [];
  const labelQuery = activeLabelQuery(text);
  const labelSuggestions = labelQuery !== null
    ? knownLabels.filter((l) => !allLabels.includes(l.name) && l.name.includes(labelQuery)).slice(0, 6)
    : [];
  const typedMentions = businessId ? [] : parsed.mentions
    .map((u) => people.find((p) => p.username?.toLowerCase() === u.toLowerCase()))
    .filter(Boolean);
  const delegateHere = delegate && !businessId ? people.find((p) => p.id === delegate.person.id) : null;
  const mentionedPeople = delegateHere && !typedMentions.some((p) => p.id === delegateHere.id)
    ? [...typedMentions, delegateHere]
    : typedMentions;
  // Whoever is @mentioned is ASSIGNED by default (they are accountable); tapping the chip makes it just shared (-1).
  const effectiveAssignId = assignId === null ? (mentionedPeople[0]?.id ?? null) : assignId === -1 ? null : assignId;
  const effectiveBizAssignee = bizAssignee || (delegate && businessId ? delegate.person.id : null);
  const assignee = bizPeople.find((p) => p.id === effectiveBizAssignee) || null;
  const assignable = useMemo(() => people.filter((p) => p.id !== user?.id), [people, user]);
  const giveToPerson = giveTo ? assignable.find((p) => p.id === giveTo) || null : null;
  const giveMatches = useMemo(() => filterPeople(assignable, giveQuery.replace(/^@/, ''), { limit: 30 }), [assignable, giveQuery]);
  const proposing = !!business && !business.can_manage && !isSubtask;

  const submit = async () => {
    if (!canSend || saving) return;
    setSaving(true);
    try {
      if (multi && lineList.length > 1) {
        // One to-do per line, each read for its own date, priority and labels; the pickers apply to all of them.
        const pickFor = (lp, key, fallback) => (override[key] === false ? null : override[key] ?? lp[key] ?? fallback ?? null);
        let added = 0;
        for (const line of lineList) {
          const lp = parseQuickAdd(line, lists);
          if (!lp.title) continue;
          const due = pickFor(lp, 'due_date', defaults.due_date);
          const lid = businessId || giveTo ? null : (override.list_id !== undefined ? override.list_id : (lp.list?.id ?? defaults.list_id ?? null));
          const ments = businessId ? [] : lp.mentions.map((u) => people.find((pp) => pp.username?.toLowerCase() === u.toLowerCase())).filter(Boolean);
          // eslint-disable-next-line no-await-in-loop
          await createTodo({
            title: lp.title.charAt(0).toUpperCase() + lp.title.slice(1),
            notes,
            due_date: due,
            due_time: due ? pickFor(lp, 'due_time') : null,
            priority: pickFor(lp, 'priority', 4),
            recurrence: pickFor(lp, 'recurrence'),
            list_id: lid,
            section_id: (lid ?? null) === (defaults.list_id ?? null) ? defaults.section_id ?? null : null,
            parent_id: defaults.parent_id || undefined,
            business_id: businessId || undefined,
            business_section_id: businessId ? (defaults.business_section_id || undefined) : undefined,
            assign_to: businessId ? (effectiveBizAssignee || undefined) : undefined,
            requires_approval: businessId && review !== null ? review : undefined,
            labels: [...new Set([...lp.labels, ...extraLabels])],
            deadline_date: pickFor(lp, 'deadline_date'),
            duration_minutes: pickFor(lp, 'duration_minutes'),
            mention_ids: giveToPerson ? [] : ments.map((pp) => pp.id),
            delegate_to: giveToPerson && !businessId ? giveToPerson.id : undefined,
          });
          added += 1;
        }
        showToast({ message: added + ' to-dos added' });
        setGiveTo(null);
        setText('');
        setNotes('');
        setOverride((o) => ({ business_id: o.business_id }));
        setExtraLabels(defaults.labels || []);
        inputRef.current?.focus();
        return;
      }
      await createTodo({
        title: parsed.title,
        notes,
        due_date: dueDate,
        due_time: dueTime,
        priority,
        recurrence,
        list_id: listId,
        section_id: sectionId,
        parent_id: defaults.parent_id || undefined,
        business_id: businessId || undefined,
            business_section_id: businessId ? (defaults.business_section_id || undefined) : undefined,
        assign_to: businessId
          ? (effectiveBizAssignee || undefined)
          : giveToPerson ? undefined : (mentionedPeople.some((p) => p.id === effectiveAssignId) ? effectiveAssignId : undefined),
        requires_approval: businessId && review !== null ? review : undefined,
        labels: allLabels,
        deadline_date: deadline,
        duration_minutes: duration,
        mention_ids: giveToPerson ? [] : mentionedPeople.map((p) => p.id),
        delegate_to: giveToPerson && !businessId ? giveToPerson.id : undefined,
      });
      setGiveTo(null);
      setAssignId(null);
      setDelegateOff(false);
      setText('');
      setNotes('');
      setOverride((o) => ({ business_id: o.business_id }));
      setExtraLabels(defaults.labels || []);
      inputRef.current?.focus();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add it', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleListening = () => voice.toggle(text, setText);



  // The input grows with its text instead of scrolling sideways or inside itself.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return undefined;
    const id = requestAnimationFrame(() => autoGrow(inputRef.current));
    return () => cancelAnimationFrame(id);
  }, [text, visible, multi]);

  // A touch keyboard's Enter in Single mode adds the to-do (the text was cleaned in onChangeText first).
  useEffect(() => {
    if (submitNext.current) { submitNext.current = false; submit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const cycleRecurrence = () => {
    const idx = RECURRENCE_ORDER.indexOf(recurrence);
    const next = RECURRENCE_ORDER[(idx + 1) % RECURRENCE_ORDER.length];
    setOverride((o) => ({ ...o, recurrence: next || false }));
  };

  const removeLabel = (label) => {
    setText((t) => removeLabelToken(t, label));
    setExtraLabels((prev) => prev.filter((l) => l !== label));
  };

  const hasBusinesses = businesses.length > 0 && !isSubtask;
  const placeholder = isSubtask
    ? 'Sub-task, e.g. Collect invoices tomorrow'
    : business ? `Task for ${business.name}, e.g. Send the quote friday p1` : 'e.g. Call supplier tomorrow 4pm p1, or: ask Ravi to send the invoice friday';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeight={640}
      avoidKeyboard
      origin={origin}
      onMorphStart={onMorphStart}
      onClosed={onClosed}
      onOpened={() => inputRef.current?.focus()}
    >
      <View style={styles.wrap}>
        {hasBusinesses && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow} keyboardShouldPersistTaps="always">
            <Chip small icon="person-outline" label="Personal" active={!businessId} onPress={() => setOverride((o) => ({ ...o, business_id: null }))} />
            {businesses.map((b) => (
              <Chip
                key={b.id}
                small
                icon="briefcase-outline"
                label={b.name}
                active={businessId === b.id}
                onPress={() => {
                  setOverride((o) => ({ ...o, business_id: b.id }));
                  setBizAssignee(null);
                }}
              />
            ))}
          </ScrollView>
        )}
        {proposing && (
          <Text style={styles.note}>You can propose this. A manager of {business.name} accepts or declines it.</Text>
        )}

        <View style={styles.modeRow}>
          <Chip small icon="document-text-outline" label="Single" active={!multi} onPress={() => setMulti(false)} />
          <Chip small icon="list-outline" label="Multiple" active={multi} onPress={() => setMulti(true)} />
          {multi && <Text style={styles.note}>{lineList.length > 1 ? lineList.length + ' to-dos, one per line' : 'One to-do per line'}</Text>}
        </View>
        {listening && <VoiceLive levels={levels} live={live} onStop={voice.stop} />}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(v) => {
            // Some touch keyboards do not report Enter as a key: catch the newline it types.
            if (!multi && v.length === text.length + 1 && v.endsWith('\n') && virtualKeyboardUp()) { submitNext.current = true; setText(v.replace(/\n+$/, '')); return; }
            setText(v);
          }}
          placeholder={multi ? 'One to-do per line, e.g.\nCall supplier tomorrow\nSend the quote friday p1' : placeholder}
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          multiline
          numberOfLines={1}
          scrollEnabled={false}
          blurOnSubmit={false}
          returnKeyType={multi ? 'default' : 'send'}
          autoCorrect
          onKeyPress={(e) => {
            const k = e.nativeEvent;
            if (k.key !== 'Enter' || k.shiftKey) return; // Shift+Enter: a new line
            if (multi && virtualKeyboardUp()) return;    // touch keyboard, Multiple: Enter is a new line
            e.preventDefault();
            submit();
          }}
        />
        {menu === 'notes' && (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Description"
            placeholderTextColor={colors.gray[400]}
            style={styles.notes}
            multiline
          />
        )}

        {/* What we understood */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="always">
          {dueDate && (
            <Chip
              small
              icon="calendar"
              label={`${formatDue(dueDate)}${dueTime ? ` ${formatTime(dueTime)}` : ''}`}
              onRemove={() => setOverride((o) => ({ ...o, due_date: false, due_time: false }))}
            />
          )}
          {deadline && (
            <Chip small icon="alert-circle" label={`Deadline ${formatDue(deadline)}`} onRemove={() => setOverride((o) => ({ ...o, deadline_date: false }))} />
          )}
          {duration && (
            <Chip small icon="time" label={formatDuration(duration)} onRemove={() => setOverride((o) => ({ ...o, duration_minutes: false }))} />
          )}
          {recurrence && (
            <Chip small icon="repeat" label={RECURRENCE_LABELS[recurrence]} onRemove={() => setOverride((o) => ({ ...o, recurrence: false }))} />
          )}
          {priority < 4 && (
            <Chip small icon="flag" color={PRIORITY[priority].color} label={PRIORITY[priority].short} onRemove={() => setOverride((o) => ({ ...o, priority: 4 }))} />
          )}
          {!isSubtask && list && <Chip small icon="list" label={list.name} onRemove={() => setOverride((o) => ({ ...o, list_id: null }))} />}
          {!!assignee && <Chip small icon="person" label={`For ${assignee.name.split(' ')[0]}`} onRemove={() => { setBizAssignee(null); setDelegateOff(true); }} />}
          {review === true && <Chip small icon="eye-outline" label="Needs review" onRemove={() => setReview(null)} />}
          {allLabels.map((l) => (
            <Chip key={l} small icon="pricetag" label={l} onRemove={() => removeLabel(l)} />
          ))}
          {!!giveToPerson && !businessId && (
            <Chip small active icon="person-add" label={`Assigned to ${giveToPerson.name.split(' ')[0]} · not on your list`} onRemove={() => setGiveTo(null)} />
          )}
          {!giveToPerson && mentionedPeople.map((p) => (
            <Chip
              key={p.id}
              small
              icon={effectiveAssignId === p.id ? 'person-add' : 'person'}
              active={effectiveAssignId === p.id}
              label={effectiveAssignId === p.id ? `Assigned to ${p.name.split(' ')[0]} · tap to share` : `Shared with ${p.name.split(' ')[0]} · tap to assign`}
              onPress={() => setAssignId(effectiveAssignId === p.id ? -1 : p.id)}
            />
          ))}
        </ScrollView>

        {menu === 'priority' && (
          <View style={styles.menuRow}>
            {[1, 2, 3, 4].map((p) => (
              <Chip
                key={p}
                icon="flag"
                color={PRIORITY[p].color}
                label={PRIORITY[p].short}
                active={priority === p}
                onPress={() => {
                  setOverride((o) => ({ ...o, priority: p }));
                  setMenu(null);
                }}
              />
            ))}
          </View>
        )}
        {menu === 'more' && (
          <View>
            <View style={styles.menuRow}>
              <Chip icon="alert-circle-outline" label={deadline ? `Deadline ${formatDue(deadline)}` : 'Deadline'} active={!!deadline} onPress={() => setDeadlineOpen(true)} />
              <Chip icon="repeat" label={recurrence ? RECURRENCE_LABELS[recurrence] : 'Repeat'} active={!!recurrence} onPress={cycleRecurrence} />
              <Chip icon="document-text-outline" label="Description" onPress={() => setMenu('notes')} />
              {!!businessId && !isSubtask && (
                <Chip icon="eye-outline" label="Needs review when done" active={review === true} onPress={() => setReview(review === true ? null : true)} />
              )}
            </View>
          </View>
        )}
        {menu === 'label' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            {knownLabels.length === 0 && <Chip small label="Type +name in the box to create a label" />}
            {knownLabels.map((l) => (
              <Chip
                key={l.name}
                icon="pricetag-outline"
                label={l.name}
                active={allLabels.includes(l.name)}
                onPress={() => (allLabels.includes(l.name)
                  ? removeLabel(l.name)
                  : setExtraLabels((prev) => [...prev, l.name]))}
              />
            ))}
          </ScrollView>
        )}
        {menu === 'where' && !businessId && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            <Chip icon="file-tray" label="Inbox" active={!listId} onPress={() => { setOverride((o) => ({ ...o, list_id: null })); setMenu(null); }} />
            {lists.map((l) => (
              <Chip
                key={l.id}
                icon="list"
                label={l.name}
                active={listId === l.id}
                onPress={() => {
                  setOverride((o) => ({ ...o, list_id: l.id }));
                  setMenu(null);
                }}
              />
            ))}
          </ScrollView>
        )}
        {menu === 'give' && !businessId && (
          <View>
            <TextInput
              value={giveQuery}
              onChangeText={setGiveQuery}
              placeholder="Search a name or @username"
              placeholderTextColor={colors.gray[400]}
              style={styles.giveSearch}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 190 }} keyboardShouldPersistTaps="always">
              {giveMatches.length === 0 && <Text style={styles.note}>Nobody matches.</Text>}
              {giveMatches.map((p) => (
                <AnimatedPressable key={p.id} style={styles.personRow} onPress={() => { setGiveTo(giveTo === p.id ? null : p.id); setMenu(null); inputRef.current?.focus(); }}>
                  <Avatar name={p.name} uri={p.profile_picture} size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personNameOnly}>{p.name}</Text>
                    {!!p.display_title && <Text style={styles.personSub}>{p.display_title} · @{p.username}</Text>}
                  </View>
                  {giveTo === p.id && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
                </AnimatedPressable>
              ))}
            </ScrollView>
          </View>
        )}
        {menu === 'assignee' && !!businessId && (
          <ScrollView style={{ maxHeight: 190 }} keyboardShouldPersistTaps="always">
            <AnimatedPressable style={styles.personRow} onPress={() => { setBizAssignee(null); setMenu(null); }}>
              <View style={styles.openIcon}><Ionicons name="people-outline" size={16} color={colors.brand[600]} /></View>
              <Text style={styles.personName}>Open to everyone in the business</Text>
              {!bizAssignee && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
            </AnimatedPressable>
            {bizPeople.map((p) => (
              <AnimatedPressable key={p.id} style={styles.personRow} onPress={() => { setBizAssignee(p.id); setMenu(null); }}>
                <Avatar name={p.name} uri={p.profile_picture} size={26} />
                <Text style={styles.personName}>{p.id === user?.id ? `${p.name} (you)` : p.name}</Text>
                {bizAssignee === p.id && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
              </AnimatedPressable>
            ))}
          </ScrollView>
        )}

        {/* One place for every list of people / labels: just above the toolbar, next to the other pickers. */}
        <MentionSuggestions
          people={menu ? [] : suggestions}
          onPick={(p) => {
            setText((t) => completeMention(t, p.username));
            inputRef.current?.focus();
          }}
          style={styles.suggestions}
        />
        {!menu && labelSuggestions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            {labelSuggestions.map((l) => (
              <Chip
                key={l.name}
                small
                icon="pricetag-outline"
                label={l.name}
                onPress={() => {
                  setText((t) => completeLabel(t, l.name));
                  inputRef.current?.focus();
                }}
              />
            ))}
          </ScrollView>
        )}


        <View style={styles.toolbar}>
          <SlideGroup style={styles.tools} pillStyle={{ borderRadius: radius.md }}>
            <ToolButton icon="calendar-outline" label="Date" open={dateOpen} has={!!dueDate} onPress={() => { setMenu(null); setDateOpen(true); }} />
            <ToolButton icon="flag-outline" label="Priority" open={menu === 'priority'} has={priority < 4} onPress={() => setMenu(menu === 'priority' ? null : 'priority')} />
            {!!businessId && !isSubtask && (
              <ToolButton icon="person-outline" label="Assign" open={menu === 'assignee'} has={!!bizAssignee} onPress={() => setMenu(menu === 'assignee' ? null : 'assignee')} />
            )}
            {!businessId && !isSubtask && assignable.length > 0 && (
              <ToolButton icon="person-add-outline" label="Assign" open={menu === 'give'} has={!!giveToPerson} onPress={() => setMenu(menu === 'give' ? null : 'give')} />
            )}
            {!businessId && !isSubtask && !giveTo && (
              <ToolButton icon="albums-outline" label="List" open={menu === 'where'} has={!!list} onPress={() => setMenu(menu === 'where' ? null : 'where')} />
            )}
            <ToolButton icon="pricetag-outline" label="Label" open={menu === 'label'} has={allLabels.length > 0} onPress={() => setMenu(menu === 'label' ? null : 'label')} />
            {!businessId && (
              <ToolButton
                icon="at"
                label="Mention"
                open={mentionQuery !== null && !menu}
                has={mentionedPeople.length > 0}
                onPress={() => {
                  setMenu(null);
                  setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`);
                  inputRef.current?.focus();
                }}
              />
            )}
            {voice.supported && (
              <ToolButton icon={listening ? 'mic' : 'mic-outline'} label="Speak" open={listening} onPress={toggleListening} />
            )}
            <ToolButton icon="ellipsis-horizontal" label="More" open={menu === 'more' || menu === 'notes'} onPress={() => setMenu(menu === 'more' || menu === 'notes' ? null : 'more')} />
          </SlideGroup>
          <AnimatedPressable
            onPress={submit}
            disabled={!canSend || saving}
            style={[styles.send, (!canSend || saving) && styles.sendDisabled]}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </AnimatedPressable>
        </View>
      </View>

      <DueDatePicker
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        date={dueDate}
        time={dueTime}
        onChange={({ date, time }) => setOverride((o) => ({ ...o, due_date: date || false, due_time: time || false }))}
      />
      <DueDatePicker
        visible={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        date={deadline}
        allowTime={false}
        onChange={({ date }) => setOverride((o) => ({ ...o, deadline_date: date || false }))}
      />
    </BottomSheet>
  );
}

// A toolbar button. The light-red highlight under the open one is the SlideGroup's (it slides between tools); a small
// dot says the tool already holds a value.
function ToolButton({ icon, label, open, has, onPress }) {
  const colors = useColors();
  const tone = open ? colors.brand[700] : colors.gray[500];
  return (
    <SlideItem active={open}>
      <AnimatedPressable
        onPress={onPress}
        hitSlop={4}
        accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.md }}
      >
        <Ionicons name={icon} size={19} color={tone} />
        {has && <View style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand[600] }} />}
      </AnimatedPressable>
    </SlideItem>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm },
  scopeRow: { gap: spacing.xs, paddingBottom: spacing.sm },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xs },
  liveBox: { gap: 6, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand[600] },
  recText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
  wave: { flex: 1, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.brand[600] },
  liveText: { fontSize: fontSize.base, color: colors.brand[700] },
  note: { fontSize: fontSize.sm, color: colors.gray[500], paddingBottom: spacing.xs },
  suggestions: { marginBottom: spacing.sm },
  input: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    paddingVertical: spacing.sm,
    outlineStyle: 'none',
  },
  notes: {
    fontSize: fontSize.base,
    color: colors.gray[700],
    minHeight: 44,
    paddingVertical: spacing.xs,
    outlineStyle: 'none',
  },
  chips: { gap: spacing.xs, paddingVertical: spacing.sm, minHeight: 36 },
  menuRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, paddingHorizontal: spacing.xs },
  personSub: { fontSize: fontSize.sm, color: colors.gray[500] },
  giveSearch: { fontSize: fontSize.base, color: colors.gray[900], paddingVertical: spacing.sm, outlineStyle: 'none', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
  personName: { flex: 1, fontSize: fontSize.base, color: colors.gray[900] },
  personNameOnly: { fontSize: fontSize.base, color: colors.gray[900] },
  openIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand[100], alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
    paddingTop: spacing.sm,
  },
  tools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
