import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import Modal from '../Modal';
import DueDatePicker from '../DueDatePicker';
import Popover from '../board/Popover';
import { PersonEditor } from '../board/Cells';
import { Avatar } from '../kit';
import useDirectory from '../../hooks/useDirectory';
import useIsDesktop from '../../hooks/useBreakpoint';
import { useTodos } from '../../context/TodoContext';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { formatDue } from '../../utils/dates';
import { showToast } from '../../utils/events';

const UNDO_MS = 60 * 1000;

function rectOf(id) {
  if (typeof document === 'undefined') return null;
  const r = document.querySelector(`[data-draft="${id}"]`)?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
}

/**
 * Review the tasks found in a meeting (or a message) before they become anyone's work (F-MTG-05).
 * A summary per person on top, the drafts grouped by person, a "Pick a person" group for names nobody matched.
 * Keyboard: arrows or J / K move, Space or X leaves one out, E title, P person, B company, D date,
 * Enter asks once and Enter again assigns them all, Esc steps back. Undo stays for a minute.
 */
export default function DraftReviewSheet({ open, meetingId = null, onClose, onConfirmed }) {
  const colors = useColors();
  const desktop = useIsDesktop();
  const { people } = useDirectory();
  const { businesses } = useTodos();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(() => new Set());
  const [focus, setFocus] = useState(0);
  const [edit, setEdit] = useState(null); // { id, field: 'title' | 'person' | 'business' | 'date' }
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/drafts', { params: meetingId ? { meeting_id: meetingId } : {}, __skipOops: true });
      setDrafts(res.data.drafts || []);
    } catch {
      showToast({ message: 'Could not load the drafts', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (open) { setSkip(new Set()); setFocus(0); setEdit(null); setConfirming(false); load(); }
  }, [open, load]);

  // Grouped by person: named people (most tasks first), then "Pick a person", then the recorder's own.
  const groups = useMemo(() => {
    const byKey = new Map();
    for (const d of drafts) {
      const key = d.assignee_id ? `p${d.assignee_id}` : d.confidence === 'unsure' ? 'unsure' : 'mine';
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          label: d.assignee_id ? d.assignee_name : key === 'unsure' ? 'Pick a person' : 'Yours',
          icon: d.assignee_id ? null : key === 'unsure' ? 'help-circle' : 'person',
          items: [],
        });
      }
      byKey.get(key).items.push(d);
    }
    const named = [...byKey.values()].filter((g) => g.key.startsWith('p')).sort((a, b) => b.items.length - a.items.length);
    return [...named, byKey.get('unsure'), byKey.get('mine')].filter(Boolean);
  }, [drafts]);
  const order = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = order[Math.min(focus, order.length - 1)];
  const chosen = order.filter((d) => !skip.has(d.id));
  const blocked = chosen.filter((d) => d.confidence === 'unsure' && !d.assignee_id);
  const ready = chosen.filter((d) => !(d.confidence === 'unsure' && !d.assignee_id));

  const patch = useCallback(async (d, body) => {
    try {
      const res = await api.patch(`/drafts/${d.id}`, body);
      if (res.data.draft) setDrafts((list) => list.map((x) => (x.id === d.id ? res.data.draft : x)));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change it', tone: 'error' });
    }
  }, []);

  const toggle = useCallback((d) => setSkip((cur) => {
    const next = new Set(cur);
    if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
    return next;
  }), []);

  const assign = useCallback(async () => {
    if (!ready.length || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/drafts/confirm', { ids: ready.map((d) => d.id) }, { timeout: 180000 });
      const made = res.data.created || [];
      const failed = res.data.failed || [];
      const madeIds = made.map((m) => m.id);
      showToast({
        message: `${made.length} task${made.length === 1 ? '' : 's'} assigned${failed.length ? ` · ${failed.length} need a look` : ''}`,
        tone: failed.length ? 'error' : 'success',
        icon: 'checkmark-done',
        actionLabel: 'Undo',
        duration: UNDO_MS,
        onAction: async () => {
          try {
            const u = await api.post('/drafts/undo', { ids: madeIds });
            showToast({ message: `${u.data.undone} taken back and waiting again`, icon: 'arrow-undo' });
          } catch {
            showToast({ message: 'Too late to undo', tone: 'error' });
          }
        },
      });
      setConfirming(false);
      await load();
      onConfirmed?.(made);
      if (!failed.length && made.length === chosen.length) onClose?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not assign them', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [ready, busy, load, onConfirmed, onClose, chosen.length]);

  // Keyboard (only while open, and not while typing in a field).
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (edit) return;
    const k = e.key;
    const move = (n) => { setFocus((f) => Math.min(Math.max(f + n, 0), Math.max(order.length - 1, 0))); e.preventDefault(); };
    if (k === 'ArrowDown' || k === 'j') move(1);
    else if (k === 'ArrowUp' || k === 'k') move(-1);
    else if ((k === ' ' || k === 'x') && current) { toggle(current); e.preventDefault(); }
    else if (k === 'e' && current) { setEdit({ id: current.id, field: 'title' }); e.preventDefault(); }
    else if (k === 'p' && current) { setEdit({ id: current.id, field: 'person' }); e.preventDefault(); }
    else if (k === 'b' && current) { setEdit({ id: current.id, field: 'business' }); e.preventDefault(); }
    else if (k === 'd' && current) { setEdit({ id: current.id, field: 'date' }); e.preventDefault(); }
    else if (k === 'Enter') { e.preventDefault(); if (confirming) assign(); else if (ready.length) setConfirming(true); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (confirming) setConfirming(false); else onClose?.(); }
  };
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const OURS = new Set(['ArrowDown', 'ArrowUp', 'j', 'k', ' ', 'x', 'e', 'p', 'b', 'd', 'Enter', 'Escape']);
    const typing = (e) => ['input', 'textarea'].includes((e.target?.tagName || '').toLowerCase());
    const down = (e) => {
      if (OURS.has(e.key) && !typing(e)) e.stopPropagation();
      keyRef.current?.(e);
    };
    // Buttons act on key-up (Space, Enter): stop it reaching whatever has focus, e.g. the dialog's close button.
    const up = (e) => { if (OURS.has(e.key) && !typing(e)) { e.stopPropagation(); e.preventDefault(); } };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    const t = setTimeout(() => { if (!typing({ target: document.activeElement })) document.activeElement?.blur?.(); }, 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [open]);

  const editing = edit ? drafts.find((d) => d.id === edit.id) : null;
  const counts = groups.filter((g) => g.key.startsWith('p')).map((g) => `${g.label.split(' ')[0]} ${g.items.length}`).join(', ');

  return (
    <Modal open={open} onClose={onClose} title="Review the tasks" width={880}>
      {loading && !drafts.length ? <ActivityIndicator color={BRAND} /> : (
        <View style={{ gap: spacing.sm, maxHeight: desktop ? 640 : undefined }}>
          <Text style={{ fontSize: 14, color: colors.gray[700] }}>
            <Text style={{ fontWeight: '700', color: colors.gray[900] }}>{drafts.length} task{drafts.length === 1 ? '' : 's'}</Text>
            {counts ? `: ${counts}` : ''}
            {groups.find((g) => g.key === 'unsure') ? ` · ${groups.find((g) => g.key === 'unsure').items.length} need a person` : ''}
          </Text>
          {desktop && (
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>
              ↑ ↓ move · Space leave out · E title · P person · B company · D date · Enter assign
            </Text>
          )}
          <ScrollView style={{ maxHeight: desktop ? 470 : undefined }}>
            {groups.map((g) => (
              <View key={g.key} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                  {g.icon ? <Ionicons name={g.icon} size={18} color={g.key === 'unsure' ? colors.amber[600] : colors.gray[600]} /> : <Avatar name={g.label} size={22} />}
                  <Text style={{ fontSize: 15, fontWeight: '600', color: g.key === 'unsure' ? colors.amber[600] : colors.gray[900] }}>{g.label}</Text>
                  <Text style={{ fontSize: 13, color: colors.gray[500] }}>{g.items.length}</Text>
                </View>
                {g.items.map((d) => {
                  const idx = order.indexOf(d);
                  const focused = idx === focus;
                  const out = skip.has(d.id);
                  return (
                    <Pressable
                      key={d.id}
                      dataSet={{ draft: d.id }}
                      onPress={() => setFocus(idx)}
                      style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm,
                        borderRadius: radius.md, backgroundColor: focused ? colors.brand[50] : 'transparent', opacity: out ? 0.45 : 1,
                        borderWidth: focused ? 1 : 0, borderColor: colors.brand[300],
                      }}
                    >
                      <Pressable onPress={() => toggle(d)} accessibilityRole="checkbox" accessibilityState={{ checked: !out }} hitSlop={6}>
                        <Ionicons name={out ? 'square-outline' : 'checkbox'} size={20} color={out ? colors.gray[400] : BRAND} />
                      </Pressable>
                      <View style={{ flex: 1, gap: 3 }}>
                        {edit?.id === d.id && edit.field === 'title' ? (
                          <TextInput
                            autoFocus
                            defaultValue={d.title}
                            onSubmitEditing={(e) => { patch(d, { title: e.nativeEvent.text }); setEdit(null); }}
                            onBlur={() => setEdit(null)}
                            onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') setEdit(null); }}
                            style={{ fontSize: 15, color: colors.gray[900], borderBottomWidth: 1, borderColor: BRAND, outlineStyle: 'none' }}
                          />
                        ) : (
                          <Text style={{ fontSize: 15, color: colors.gray[900], textDecorationLine: out ? 'line-through' : 'none' }}>{d.title}</Text>
                        )}
                        {!!d.quote && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500], fontStyle: 'italic' }}>"{d.quote}"</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: desktop ? 360 : 180 }}>
                        <Chip
                          icon={d.assignee_id ? 'person' : d.confidence === 'unsure' ? 'help-circle' : 'person-outline'}
                          label={d.assignee_id ? d.assignee_name.split(' ')[0] : d.confidence === 'unsure' ? `"${d.assignee_said || '?'}"` : 'Me'}
                          warn={d.confidence === 'unsure' && !d.assignee_id}
                          onPress={() => { setFocus(idx); setEdit({ id: d.id, field: 'person' }); }}
                        />
                        <Chip icon="briefcase-outline" label={d.business_name || 'Personal'} onPress={() => { setFocus(idx); setEdit({ id: d.id, field: 'business' }); }} />
                        <Chip icon="calendar-outline" label={d.due_date ? formatDue(d.due_date) : 'No date'} onPress={() => { setFocus(idx); setEdit({ id: d.id, field: 'date' }); }} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {!drafts.length && !loading && <Text style={{ color: colors.gray[600], padding: spacing.md }}>Nothing waiting. Every task from this meeting has been handled.</Text>}
          </ScrollView>

          {drafts.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.gray[200] }}>
              <Text style={{ flex: 1, fontSize: 13, color: blocked.length ? colors.amber[600] : colors.gray[600] }}>
                {blocked.length ? `${blocked.length} still need a person and will wait.` : skip.size ? `${skip.size} left out, they stay in your Inbox.` : 'Everything ticked will be assigned.'}
              </Text>
              {confirming ? (
                <>
                  <Pressable onPress={() => setConfirming(false)} style={{ paddingHorizontal: spacing.md, paddingVertical: 9 }}>
                    <Text style={{ color: colors.gray[700] }}>Back (Esc)</Text>
                  </Pressable>
                  <Pressable onPress={assign} disabled={busy} style={{ backgroundColor: BRAND, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 9 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Assigning…' : `Yes, assign ${ready.length} (Enter)`}</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => setConfirming(true)} disabled={!ready.length} style={{ backgroundColor: BRAND, opacity: ready.length ? 1 : 0.5, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 9 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Assign these {ready.length} tasks</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {editing && edit.field === 'person' && (
        <Popover visible anchor={rectOf(editing.id)} onClose={() => setEdit(null)} width={300}>
          <PersonEditor
            selected={editing.assignee_id ? [editing.assignee_id] : []}
            candidates={people}
            onDone={(id) => { patch(editing, { assignee_id: id }); setEdit(null); }}
          />
        </Popover>
      )}
      {editing && edit.field === 'business' && (
        <Popover visible anchor={rectOf(editing.id)} onClose={() => setEdit(null)} width={300}>
          <ScrollView style={{ maxHeight: 300 }}>
            {[{ id: null, name: 'Personal (hand it over)' }, ...(businesses || [])].map((b) => (
              <Pressable key={b.id ?? 'none'} onPress={() => { patch(editing, { business_id: b.id }); setEdit(null); }}
                style={({ hovered }) => ({ padding: spacing.sm, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : (editing.business_id || null) === b.id ? colors.brand[50] : 'transparent' })}>
                <Text style={{ fontSize: 14, color: colors.gray[900] }}>{b.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Popover>
      )}
      {editing && edit.field === 'date' && (
        <DueDatePicker
          visible
          date={editing.due_date}
          time={editing.due_time}
          onClose={() => setEdit(null)}
          onChange={(v) => { patch(editing, { due_date: v.date, due_time: v.time }); setEdit(null); }}
        />
      )}
    </Modal>
  );
}

function Chip({ icon, label, onPress, warn }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ hovered }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
      backgroundColor: warn ? colors.amber[50] : hovered ? colors.gray[200] : colors.gray[100],
      borderWidth: warn ? 1 : 0, borderColor: colors.amber[500],
    })}>
      <Ionicons name={icon} size={12} color={warn ? colors.amber[600] : colors.gray[600]} />
      <Text numberOfLines={1} style={{ fontSize: 12, color: warn ? colors.amber[600] : colors.gray[700], maxWidth: 140 }}>{label}</Text>
    </Pressable>
  );
}
