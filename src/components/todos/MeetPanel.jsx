import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { showToast } from '../../utils/events';
import { timeAgo } from '../../utils/dates';
import api from '../../api/client';

const join = (url) => {
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
};
const copy = async (url) => {
  try {
    await navigator.clipboard.writeText(url);
    showToast({ message: 'Meeting link copied', tone: 'success' });
  } catch {
    showToast({ message: url, tone: 'info' });
  }
};

/**
 * "Meet" on a to-do: pick people, the app makes a Google Meet link and shows it right here with a Join
 * button (the people picked are told and get a calendar invite).
 */
export default function MeetPanel({ todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { people } = useDirectory();
  const [meetings, setMeetings] = useState([]);
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/todos/${todo.id}/meetings`, { __skipOops: true });
      setMeetings(res.data.meetings || []);
      setAvailable(res.data.available !== false);
    } catch { /* offline: show nothing */ }
  }, [todo.id]);
  useEffect(() => { load(); }, [load]);

  // Everyone already on this to-do comes first, then a search of the whole directory.
  const onIt = useMemo(() => {
    const ids = new Set([...(todo.members || []).map((m) => m.id), todo.assignee_id, todo.created_by].filter(Boolean));
    return people.filter((p) => ids.has(p.id) && p.id !== user?.id);
  }, [people, todo, user]);
  const shown = query.trim() ? filterPeople(people, query, { excludeIds: [user?.id], limit: 8 }) : onIt;

  const start = () => {
    setPicked(onIt.map((p) => p.id));
    setTitle('');
    setQuery('');
    setOpen(true);
  };
  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/todos/${todo.id}/meetings`, { attendee_ids: picked, title: title.trim() || undefined });
      setMeetings((prev) => [res.data.meeting, ...prev]);
      setOpen(false);
      showToast({ message: 'Meeting ready. Tap Join.', tone: 'success', icon: 'videocam' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not make the meeting', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const latest = meetings[0];
  return (
    <View style={{ marginTop: spacing.md }}>
      {latest && (
        <View {...glass('inset')} style={styles.card}>
          <View style={styles.cardTop}>
            <Ionicons name="videocam" size={18} color={colors.brand[600]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{latest.title}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {latest.created_by === user?.id ? 'You' : latest.created_by_name} · {timeAgo(latest.starts_at)}
                {(latest.attendees || []).length ? ` · ${(latest.attendees || []).map((a) => a.name.split(' ')[0]).join(', ')}` : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.link} numberOfLines={1} selectable>{latest.meet_url}</Text>
          <View style={styles.actions}>
            <AnimatedPressable style={[styles.btn, { backgroundColor: colors.brand[600] }]} onPress={() => join(latest.meet_url)}>
              <Ionicons name="videocam" size={15} color="#fff" />
              <Text style={[styles.btnText, { color: '#fff' }]}>Join</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.btn, { backgroundColor: colors.gray[100] }]} onPress={() => copy(latest.meet_url)}>
              <Ionicons name="copy-outline" size={15} color={colors.gray[700]} />
              <Text style={[styles.btnText, { color: colors.gray[800] }]}>Copy link</Text>
            </AnimatedPressable>
          </View>
        </View>
      )}

      {!todo.is_done && (
        <AnimatedPressable style={styles.startBtn} onPress={start}>
          <Ionicons name="videocam-outline" size={18} color={colors.brand[600]} />
          <Text style={styles.startText}>{latest ? 'Start another meeting' : 'Start a meeting'}</Text>
        </AnimatedPressable>
      )}
      {!available && <Text style={styles.hint}>Google Meet is not connected yet. The owner needs to add the Google keys on the server.</Text>}

      <BottomSheet visible={open} onClose={() => setOpen(false)} maxHeight={620} avoidKeyboard>
        <View style={{ paddingHorizontal: spacing.sm }}>
          <Text style={styles.sheetTitle}>Meeting about this</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={`Meeting: ${todo.title}`}
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')}
            style={styles.input}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Add someone: type a name"
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')}
            style={[styles.input, { marginTop: 8 }]}
          />
          <ScrollView style={{ maxHeight: 300, marginTop: 6 }} keyboardShouldPersistTaps="handled">
            {shown.length === 0 && <Text style={styles.hint}>No one else is on this yet. Search for a name.</Text>}
            {shown.map((p) => {
              const on = picked.includes(p.id);
              return (
                <AnimatedPressable key={p.id} style={styles.person} onPress={() => toggle(p.id)}>
                  <Avatar name={p.name} uri={p.profile_picture} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>@{p.username}</Text>
                  </View>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.brand[600] : colors.gray[400]} />
                </AnimatedPressable>
              );
            })}
          </ScrollView>
          <AnimatedPressable style={[styles.create, busy && { opacity: 0.6 }]} disabled={busy} onPress={create}>
            <Ionicons name="videocam" size={18} color="#fff" />
            <Text style={styles.createText}>{busy ? 'Making the link...' : `Create Meet link${picked.length ? ` for ${picked.length}` : ''}`}</Text>
          </AnimatedPressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.md, gap: 6, marginBottom: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  cardSub: { fontSize: 12, color: colors.gray[500] },
  link: { fontSize: fontSize.sm, color: colors.brand[700] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  btnText: { fontSize: fontSize.sm, fontWeight: '700' },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  startText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  hint: { fontSize: 12, color: colors.gray[500], paddingHorizontal: spacing.sm, paddingVertical: 4 },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.sm },
  input: { backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900] },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
  personName: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  create: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 13, marginTop: spacing.md },
  createText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});
