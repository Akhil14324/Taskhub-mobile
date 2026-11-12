import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { showToast } from '../../utils/events';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { Avatar } from '../kit';
import { Row, SearchBox } from './Cells';

/**
 * "Depends on" for one item: it can wait on a PERSON (they have to do their part first), on another TASK
 * (finish that first), or both, with a comment the person is told about. Open ones are listed and can be
 * marked as done. Uses the to-do blocker endpoints, so the item shows as Stuck while anything is open and
 * the person is notified.
 */
export default function DependencyEditor({ item, candidates, tasks, onChanged, personOnly = false }) {
  const colors = useColors();
  const [open, setOpen] = useState(null); // open blockers, null while loading
  const [mode, setMode] = useState('person');
  const [q, setQ] = useState('');
  const [personId, setPersonId] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(null);

  const load = async () => {
    try {
      const res = await api.get(`/todos/${item.id}/timeline`, { __skipOops: true });
      setOpen((res.data.blockers || []).filter((b) => !b.resolved_at && (b.kind === 'dependency' || b.kind === 'waiting_on') && (!personOnly || b.blocked_by_user_id)));
    } catch {
      setOpen([]);
    }
  };
  useEffect(() => { load(); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (candidates || [])
      .filter((p) => !s || p.name?.toLowerCase().includes(s) || p.username?.toLowerCase().includes(s)).slice(0, 30);
  }, [q, candidates]);
  const taskList = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tasks || []).filter((t) => t.id !== item.id && !t.is_done && (!s || t.title.toLowerCase().includes(s))).slice(0, 30);
  }, [q, tasks, item.id]);

  const add = async () => {
    if (mode === 'person' ? !personId : !taskId) return;
    setSaving(true);
    try {
      await api.post(`/todos/${item.id}/blockers`, {
        kind: 'dependency',
        blocked_by_user_id: mode === 'person' ? personId : undefined,
        blocked_by_todo_id: mode === 'task' ? taskId : undefined,
        note: note.trim() || undefined,
      });
      setPersonId(null); setTaskId(null); setNote(''); setQ('');
      await load();
      onChanged?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add it', tone: 'error', icon: 'alert-circle' });
    } finally {
      setSaving(false);
    }
  };

  const clear = async (b) => {
    setClearing(b.id);
    try {
      await api.post(`/todos/blockers/${b.id}/resolve`, {});
      await load();
      onChanged?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not clear it', tone: 'error', icon: 'alert-circle' });
    } finally {
      setClearing(null);
    }
  };

  const ready = mode === 'person' ? !!personId : !!taskId;

  return (
    <View style={{ gap: 8 }}>
      {open === null ? <ActivityIndicator color={BRAND} /> : open.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, color: colors.gray[500], fontWeight: '600' }}>WAITING ON</Text>
          {open.map((b) => (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: radius.md, backgroundColor: colors.gray[100] }}>
              <Ionicons name={b.blocked_by_user_name ? 'person-outline' : 'git-network-outline'} size={15} color={colors.red[600]} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[900] }}>{[b.blocked_by_user_name, b.blocked_by_todo_title].filter(Boolean).join(' · ') || 'Someone'}</Text>
                {!!b.note && <Text numberOfLines={2} style={{ fontSize: 12, color: colors.gray[600] }}>{b.note}</Text>}
              </View>
              <Pressable onPress={() => clear(b)} disabled={clearing === b.id} accessibilityLabel="Mark as done" hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
                {clearing === b.id ? <ActivityIndicator size="small" color={BRAND} /> : <Ionicons name="checkmark" size={14} color={colors.green[600]} />}
                <Text style={{ fontSize: 12, color: colors.gray[700] }}>{clearing === b.id ? 'Clearing…' : 'Done'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 12, color: colors.gray[500], fontWeight: '600' }}>{personOnly ? 'WAITING ON A PERSON' : 'ADD'}</Text>
      <View style={{ flexDirection: 'row', gap: 6, display: personOnly ? 'none' : 'flex' }}>
        {[['person', 'A person', 'person-outline'], ['task', 'A task', 'git-network-outline']].map(([k, label, icon]) => (
          <Pressable key={k} onPress={() => { setMode(k); setQ(''); }}
            style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: mode === k ? BRAND : colors.gray[300], backgroundColor: mode === k ? colors.brand[50] : 'transparent' }}>
            <Ionicons name={icon} size={14} color={mode === k ? BRAND : colors.gray[600]} />
            <Text style={{ fontSize: 13, color: mode === k ? BRAND : colors.gray[700] }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <SearchBox value={q} onChange={setQ} placeholder={mode === 'person' ? 'Search names' : 'Find a task'} />
      <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
        {mode === 'person' ? people.map((p) => (
          <Row key={p.id} active={personId === p.id} onPress={() => setPersonId(personId === p.id ? null : p.id)} label={p.name}
            icon={<Avatar name={p.name} uri={p.profile_picture} size={22} />}
            right={<Text style={{ fontSize: 12, color: colors.gray[500] }}>@{p.username}</Text>} />
        )) : taskList.map((t) => (
          <Row key={t.id} active={taskId === t.id} onPress={() => setTaskId(taskId === t.id ? null : t.id)} label={t.title}
            icon={<Ionicons name="ellipse-outline" size={14} color={colors.gray[400]} />} />
        ))}
        {mode === 'person' ? !people.length && <Text style={{ padding: spacing.sm, color: colors.gray[500] }}>Nobody matches.</Text>
          : !taskList.length && <Text style={{ padding: spacing.sm, color: colors.gray[500] }}>No open task matches.</Text>}
      </ScrollView>
      <TextInput
        value={note} onChangeText={setNote} multiline
        placeholder={mode === 'person' ? 'Comment for them (they are told): what you need from them' : 'Comment (optional)'}
        placeholderTextColor={colors.gray[400]}
        style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, color: colors.gray[900], minHeight: 56, outlineStyle: 'none' }}
      />
      <Pressable onPress={add} disabled={!ready || saving}
        style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: ready ? BRAND : colors.gray[300], borderRadius: radius.md, paddingVertical: 9 }}>
        {saving && <ActivityIndicator size="small" color="#fff" />}
        <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Adding…' : personOnly ? 'Wait on this person' : 'Add dependency'}</Text>
      </Pressable>
    </View>
  );
}
