import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import api from '../../api/client';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import { Avatar, Chip, PRIORITY, accent, DueChip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { activeMentionQuery, completeMention } from '../../utils/quickAdd';
import { showToast } from '../../utils/events';

/**
 * Create or edit a task. Any business can be picked (cross-business requests);
 * the assignee list follows the chosen business.
 * Props: visible, onClose, task (edit mode), preset ({ business_id, assigned_user_id }), onSaved(task)
 */
export default function TaskFormSheet({ visible, onClose, task, preset, onSaved }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { people } = useDirectory();
  const editing = !!task;

  const [businesses, setBusinesses] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [form, setForm] = useState({});
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvalTouched, setApprovalTouched] = useState(false);

  // Reset only when the sheet opens, so parent re-renders never wipe what's being typed.
  const wasVisible = useRef(false);
  useEffect(() => {
    const opening = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!opening) return;
    setApprovalTouched(!!task);
    setForm(task ? {
      title: task.title,
      description: task.description || '',
      business_id: task.business_id,
      assigned_user_id: task.assigned_user_id,
      due_date: task.due_date,
      priority: task.priority,
      requires_approval: task.requires_approval,
    } : {
      title: '',
      description: '',
      business_id: preset?.business_id || user?.memberships?.[0]?.business_id || null,
      assigned_user_id: preset?.assigned_user_id || null,
      due_date: null,
      priority: 4,
      requires_approval: false,
    });
    api.get('/businesses/directory', { __skipOops: true })
      .then((res) => {
        const list = res.data.businesses || [];
        setBusinesses(list);
        setForm((f) => (f.business_id ? f : { ...f, business_id: list.find((b) => b.is_member)?.id || list[0]?.id || null }));
      })
      .catch(() => {});
  }, [visible, task, preset, user]);

  const loadAssignees = useCallback(async (businessId) => {
    if (!businessId) {
      setAssignees([]);
      return;
    }
    try {
      const res = await api.get('/tasks/assignees', { params: { business_id: businessId }, __skipOops: true });
      setAssignees(res.data.users || []);
    } catch {
      setAssignees([]);
    }
  }, []);

  useEffect(() => {
    if (visible) loadAssignees(form.business_id);
  }, [visible, form.business_id, loadAssignees]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const chooseAssignee = (id) => {
    set({
      assigned_user_id: id,
      // Handing work to someone else asks for review by default (until toggled manually).
      ...(approvalTouched ? {} : { requires_approval: !!(id && id !== user?.id) }),
    });
  };

  const mentionQuery = activeMentionQuery(form.description);
  const suggestions = mentionQuery !== null ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 5 }) : [];

  const myBiz = businesses.filter((b) => b.is_member);
  const otherBiz = businesses.filter((b) => !b.is_member);
  const selectedBiz = businesses.find((b) => b.id === form.business_id);
  const isCrossBusiness = selectedBiz && !selectedBiz.is_member;

  const save = async () => {
    if (!form.title?.trim()) {
      showToast({ message: 'Give the task a title', tone: 'error' });
      return;
    }
    if (!form.business_id) {
      showToast({ message: 'Pick a business', tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        business_id: form.business_id,
        assigned_user_id: form.assigned_user_id || null,
        due_date: form.due_date || null,
        priority: form.priority,
        requires_approval: form.requires_approval,
      };
      const res = editing ? await api.put(`/tasks/${task.id}`, payload) : await api.post('/tasks', payload);
      showToast({
        message: editing ? 'Task updated' : form.assigned_user_id
          ? `Assigned to ${assignees.find((a) => a.id === form.assigned_user_id)?.name?.split(' ')[0] || 'them'}`
          : `Posted to ${selectedBiz?.name || 'the business'}`,
        tone: 'success',
        icon: 'checkmark-circle',
      });
      onSaved?.(res.data.task);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the task', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={760} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>{editing ? 'Edit task' : 'New task'}</Text>
        <TextInput
          autoFocus={!editing}
          value={form.title}
          onChangeText={(title) => set({ title })}
          placeholder="What needs to be done?"
          placeholderTextColor={colors.gray[400]}
          style={styles.titleInput}
          multiline
        />
        <TextInput
          value={form.description}
          onChangeText={(description) => set({ description })}
          placeholder="Details… type @ to mention someone"
          placeholderTextColor={colors.gray[400]}
          style={styles.descInput}
          multiline
        />
        <MentionSuggestions
          people={suggestions}
          onPick={(p) => set({ description: completeMention(form.description, p.username) })}
          style={{ marginHorizontal: spacing.sm }}
        />

        {!editing && (
          <>
            <Text style={styles.label}>Business</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow} keyboardShouldPersistTaps="handled">
              {[...myBiz, ...otherBiz].map((b) => (
                <Chip
                  key={b.id}
                  icon={b.is_member ? 'business' : 'swap-horizontal'}
                  color={accent(b.color)}
                  label={b.name}
                  active={form.business_id === b.id}
                  onPress={() => set({ business_id: b.id, assigned_user_id: null })}
                />
              ))}
            </ScrollView>
            {isCrossBusiness && (
              <View style={styles.crossNote}>
                <Ionicons name="swap-horizontal" size={14} color={colors.brand[600]} />
                <Text style={styles.crossNoteText}>
                  Cross-business request — {selectedBiz.heads?.length ? `${selectedBiz.heads.map((h) => h.name.split(' ')[0]).join(' & ')} will be notified` : 'the team will be notified'}.
                </Text>
              </View>
            )}
          </>
        )}

        <Text style={styles.label}>Assign to</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow} keyboardShouldPersistTaps="handled">
          <AnimatedPressable onPress={() => chooseAssignee(null)} style={[styles.person, !form.assigned_user_id && styles.personActive]} haptic="light">
            <View style={styles.teamAvatar}><Ionicons name="people" size={18} color={colors.gray[500]} /></View>
            <Text style={styles.personName} numberOfLines={1}>Whole team</Text>
          </AnimatedPressable>
          {assignees.map((a) => (
            <AnimatedPressable
              key={a.id}
              onPress={() => chooseAssignee(a.id)}
              style={[styles.person, form.assigned_user_id === a.id && styles.personActive]}
              haptic="light"
            >
              <Avatar name={a.name} uri={a.profile_picture} size={36} />
              <Text style={styles.personName} numberOfLines={1}>{a.id === user?.id ? 'Me' : a.name.split(' ')[0]}</Text>
              <Text style={styles.personRole} numberOfLines={1}>{a.designation ? a.designation : a.title || 'Leadership'}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Due</Text>
        <AnimatedPressable style={styles.field} onPress={() => setDateOpen(true)} haptic="light">
          <Ionicons name="calendar-outline" size={18} color={colors.gray[500]} />
          <View style={{ flex: 1 }}>
            {form.due_date ? <DueChip date={form.due_date} /> : <Text style={styles.placeholder}>No due date</Text>}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
        </AnimatedPressable>

        <Text style={styles.label}>Priority</Text>
        <View style={styles.wrapRow}>
          {[1, 2, 3, 4].map((p) => (
            <Chip key={p} icon="flag" color={PRIORITY[p].color} label={p === 1 ? 'Urgent' : p === 2 ? 'High' : p === 3 ? 'Medium' : 'Normal'} active={form.priority === p} onPress={() => set({ priority: p })} />
          ))}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Review before it's closed</Text>
            <Text style={styles.switchHint}>When they mark it done, you (or someone senior) approve it.</Text>
          </View>
          <Switch
            value={!!form.requires_approval}
            onValueChange={(v) => {
              setApprovalTouched(true);
              set({ requires_approval: v });
            }}
            trackColor={{ true: colors.brand[500], false: colors.gray[300] }}
          />
        </View>

        <AnimatedPressable onPress={save} disabled={saving} haptic="medium" style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          <Ionicons name={editing ? 'save-outline' : 'send'} size={18} color={colors.white} />
          <Text style={styles.saveText}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create task'}</Text>
        </AnimatedPressable>
      </ScrollView>

      <DueDatePicker
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        date={form.due_date}
        allowTime={false}
        onChange={({ date }) => set({ due_date: date })}
      />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heading: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  titleInput: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray[900],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    outlineStyle: 'none',
  },
  descInput: {
    fontSize: fontSize.base,
    color: colors.gray[700],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 48,
    outlineStyle: 'none',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  hRow: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm },
  crossNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brand[50],
  },
  crossNoteText: { flex: 1, fontSize: fontSize.xs, color: colors.brand[700] },
  person: {
    width: 76,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  personActive: { borderColor: colors.brand[500], backgroundColor: colors.brand[50] },
  teamAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  personName: { fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[800], marginTop: 4, maxWidth: 70 },
  personRole: { fontSize: 10, color: colors.gray[500], maxWidth: 70, textTransform: 'capitalize' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.gray[100],
  },
  placeholder: { fontSize: fontSize.base, color: colors.gray[400] },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.gray[100],
  },
  switchTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  switchHint: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.brand[600],
  },
  saveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
