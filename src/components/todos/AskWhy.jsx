import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { showToast } from '../../utils/events';

/**
 * "Ask why" straight from a row of the monitor: a small button that opens a one-line question (already worded)
 * and sends it to the person (and everyone on the task) as a question on that to-do or step.
 */
export default function AskWhy({ todoId, suggestion, label = 'Ask why' }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(suggestion || 'Why is this taking so long?');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await api.post(`/monitor/todos/${todoId}/questions`, { message });
      setSent(true);
      setOpen(false);
      showToast({ message: 'Question sent', tone: 'success', icon: 'help-circle' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not send the question', tone: 'error' });
    } finally { setSending(false); }
  };

  if (sent) return <Text style={{ fontSize: 11, color: colors.gray[500] }}>Question sent</Text>;
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} hitSlop={6} accessibilityLabel={`${label}. Sends a question to the person.`} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.md, backgroundColor: hovered ? colors.brand[50] : 'transparent' })}>
        <Ionicons name="help-circle-outline" size={14} color={BRAND} />
        <Text style={{ fontSize: 12, color: BRAND, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' }}>
      <TextInput
        value={text} onChangeText={setText} autoFocus onSubmitEditing={send} placeholder="Your question" placeholderTextColor={colors.gray[400]}
        style={{ flex: 1, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: 13, color: colors.gray[900], outlineStyle: 'none' }}
      />
      <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityLabel="Send the question" style={{ backgroundColor: BRAND, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7, opacity: text.trim() && !sending ? 1 : 0.5 }}>
        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Send</Text>}
      </Pressable>
      <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Cancel"><Ionicons name="close" size={16} color={colors.gray[500]} /></Pressable>
    </View>
  );
}
