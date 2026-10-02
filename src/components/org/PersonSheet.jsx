import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import api from '../../api/client';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Avatar, accent, tint } from '../kit';
import { showToast, showDialog, confirmDialog } from '../../utils/events';
import { invalidateDirectory } from '../../hooks/useDirectory';
import { timeAgo } from '../../utils/dates';

/**
 * Quick profile of anyone in the org chart with shortcuts:
 * message, assign a task, add a to-do for them; portal admins can also manage.
 */
export default function PersonSheet({ person, onClose, canManage, onEdit, onChanged, onAddTodo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const { user } = useAuth();
  const { createConversation, onlineUsers } = useChat();
  const [busy, setBusy] = useState(false);
  const isMe = person?.id === user?.id;

  const message = async () => {
    setBusy(true);
    try {
      const conv = await createConversation('direct', [person.id]);
      onClose();
      navigation.navigate('ChatThread', { conversationId: conv.id });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not open chat', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const assignTask = () => {
    onClose();
    const bizId = person.memberships?.[0]?.business_id || person.businesses?.[0]?.id;
    navigation.navigate('Main', { screen: 'Todos', params: { create: { assigned_user_id: person.id, business_id: bizId } } });
  };

  const resetPassword = async () => {
    const ok = await confirmDialog({ title: `Reset ${person.name.split(' ')[0]}'s password?`, message: 'A temporary password will be generated.', confirmLabel: 'Reset' });
    if (!ok) return;
    try {
      const res = await api.put(`/org/people/${person.id}/password`, {});
      const pw = res.data.temp_password;
      showDialog({
        title: 'Temporary password',
        message: `Username: ${person.username}\nPassword: ${pw}\n\nThey'll set a new one after signing in.`,
        buttons: [
          { text: 'Copy', onPress: () => Clipboard.setStringAsync(`Username: ${person.username}\nPassword: ${pw}`).then(() => showToast({ message: 'Copied', tone: 'success' })) },
          { text: 'Done', style: 'cancel' },
        ],
      });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not reset', tone: 'error' });
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Remove ${person.name}?`,
      message: 'Their account is deleted. Tasks they created are removed too — consider deactivating instead.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/org/people/${person.id}`);
      invalidateDirectory();
      showToast({ message: 'Removed', icon: 'trash' });
      onClose();
      onChanged?.();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not remove', tone: 'error' });
    }
  };

  const memberships = person?.memberships || [];

  return (
    <BottomSheet visible={!!person} onClose={onClose} maxHeight={640}>
      {person && (
        <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.md }}>
          <View style={styles.top}>
            <Avatar name={person.name} uri={person.profile_picture} size={64} online={onlineUsers.has(person.id)} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{person.name}{isMe ? ' (you)' : ''}</Text>
              <Text style={styles.title}>{person.display_title || person.tier || 'Team member'}</Text>
              <Text style={styles.username}>
                @{person.username}
                {onlineUsers.has(person.id) ? ' · online' : person.last_seen ? ` · seen ${timeAgo(person.last_seen)}` : ''}
              </Text>
            </View>
          </View>

          {memberships.length > 0 && (
            <View style={styles.memberships}>
              {memberships.map((m) => (
                <View key={m.business_id} style={[styles.membership, { backgroundColor: tint(accent(m.business_color), 0.12) }]}>
                  <View style={[styles.dot, { backgroundColor: accent(m.business_color) }]} />
                  <Text style={[styles.membershipText, { color: accent(m.business_color) }]}>
                    {m.title || m.designation_label} · {m.business_name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!isMe && (
            <View style={styles.actions}>
              <Action icon="chatbubble-ellipses" label="Message" color={colors.brand[600]} onPress={message} disabled={busy} />
              <Action icon="clipboard" label="Assign task" color="#dc2626" onPress={assignTask} />
              <Action icon="checkbox" label="Add to-do" color="#dc2626" onPress={() => { onClose(); onAddTodo?.(person); }} />
            </View>
          )}

          {canManage && (
            <View style={styles.manage}>
              <Text style={styles.manageTitle}>Manage</Text>
              <ManageRow icon="create-outline" label="Edit position & businesses" onPress={() => { onClose(); onEdit?.(person); }} />
              <ManageRow icon="key-outline" label="Reset password" onPress={resetPassword} />
              <ManageRow icon="person-remove-outline" label="Remove from TaskHub" danger onPress={remove} />
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

function Action({ icon, label, color, onPress, disabled }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: tint(color.startsWith('#') ? color : '#dc2626', 0.1) }}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );
}

function ManageRow({ icon, label, onPress, danger }) {
  const colors = useColors();
  const tone = danger ? colors.red[600] : colors.gray[700];
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={{ flex: 1, fontSize: fontSize.base, color: tone, fontWeight: '500' }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  title: { fontSize: fontSize.base, fontWeight: '600', color: colors.brand[600], marginTop: 2 },
  username: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  memberships: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  membership: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  dot: { width: 7, height: 7, borderRadius: 4 },
  membershipText: { fontSize: fontSize.xs, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  manage: { marginTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200], paddingTop: spacing.sm },
  manageTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', marginTop: spacing.sm },
});
