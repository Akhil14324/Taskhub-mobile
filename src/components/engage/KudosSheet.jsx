import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useEngage } from '../../context/EngageContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { showToast } from '../../utils/events';

export const KUDOS_REASONS = {
  great_work: { label: 'Great work', icon: 'ribbon' },
  above_and_beyond: { label: 'Above and beyond', icon: 'rocket' },
  team_player: { label: 'Team player', icon: 'people' },
  fast: { label: 'Lightning fast', icon: 'flash' },
  problem_solver: { label: 'Problem solver', icon: 'bulb' },
  helpful: { label: 'Thanks for the help', icon: 'hand-left' },
};

/**
 * Say thanks to a colleague. Open it with a fixed `toUser` (from a finished to-do) and an optional
 * `todo`, or without either to pick the person from the directory.
 */
export default function KudosSheet({ visible, onClose, toUser = null, todo = null }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { sendKudos } = useEngage();
  const { people } = useDirectory();
  const [picked, setPicked] = useState(toUser);
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('great_work');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) { setPicked(toUser); setQuery(''); setReason('great_work'); setMessage(''); }
  }, [visible, toUser]);

  const matches = useMemo(() => filterPeople(people, query, { excludeIds: [user?.id], limit: 6 }), [people, query, user]);

  const send = async () => {
    if (!picked || sending) return;
    setSending(true);
    try {
      await sendKudos({ toUserId: picked.id, todoId: todo?.id, reason, message });
      showToast({ message: `Kudos sent to ${picked.name.split(' ')[0]}`, tone: 'success' });
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not send kudos', tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={640}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <View style={styles.head}>
          <View style={styles.headIcon}><Ionicons name="heart" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Send kudos</Text>
            {!!todo && <Text style={styles.sub} numberOfLines={1}>For: {todo.title}</Text>}
          </View>
        </View>

        {picked ? (
          <View style={styles.picked}>
            <Avatar name={picked.name} uri={picked.profile_picture} size={34} />
            <Text style={styles.pickedName} numberOfLines={1}>{picked.name}</Text>
            {!toUser && (
              <AnimatedPressable onPress={() => setPicked(null)} hitSlop={8}>
                <Text style={styles.change}>Change</Text>
              </AnimatedPressable>
            )}
          </View>
        ) : (
          <View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Who do you want to thank?"
              placeholderTextColor={colors.gray[400]}
              style={styles.input}
              autoFocus
            />
            {matches.map((p) => (
              <AnimatedPressable key={p.id} style={styles.person} onPress={() => setPicked(p)}>
                <Avatar name={p.name} uri={p.profile_picture} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickedName} numberOfLines={1}>{p.name}</Text>
                  {!!p.display_title && <Text style={styles.sub} numberOfLines={1}>{p.display_title}</Text>}
                </View>
              </AnimatedPressable>
            ))}
          </View>
        )}

        <Text style={styles.label}>What was it for?</Text>
        <View style={styles.reasons}>
          {Object.entries(KUDOS_REASONS).map(([key, r]) => {
            const active = reason === key;
            return (
              <AnimatedPressable key={key} onPress={() => setReason(key)} style={[styles.reason, active && styles.reasonActive]}>
                <Ionicons name={r.icon} size={14} color={active ? '#fff' : colors.brand[600]} />
                <Text style={[styles.reasonText, active && { color: '#fff' }]}>{r.label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Add a few words (optional)"
          placeholderTextColor={colors.gray[400]}
          style={[styles.input, styles.message]}
          multiline
          maxLength={280}
        />

        <AnimatedPressable onPress={send} haptic="medium" style={[styles.send, (!picked || sending) && { opacity: 0.5 }]}>
          <Ionicons name="heart" size={16} color="#fff" />
          <Text style={styles.sendText}>{sending ? 'Sending...' : 'Send kudos'}</Text>
        </AnimatedPressable>
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.brand[50] },
  pickedName: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  change: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
  input: {
    borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: fontSize.base, color: colors.gray[900], backgroundColor: colors.white,
  },
  message: { minHeight: 70, textAlignVertical: 'top' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.sm },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full,
    backgroundColor: colors.brand[50], borderWidth: 1, borderColor: colors.brand[200],
  },
  reasonActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  reasonText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.brand[600] },
  sendText: { color: '#fff', fontSize: fontSize.base, fontWeight: '800' },
});
