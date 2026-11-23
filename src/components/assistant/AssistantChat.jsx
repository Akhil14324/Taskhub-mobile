import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Animated, Easing } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import VoiceLive from '../VoiceLive';
import useVoiceInput from '../../hooks/useVoiceInput';
import { showToast, confirmDialog } from '../../utils/events';
import api from '../../api/client';

/** Suggested questions: each one maps to a tool the assistant has, so they all answer from real data. */
export const SUGGESTED = [
  'What should I do today?',
  'Show my pending tasks',
  'Show my overdue tasks',
  'Show tasks assigned to me',
  'Show tasks I assigned to others',
  'Find tasks I haven\'t updated',
  'Summarize my weekly progress',
  'How is the team workload?',
];

const MAX_KEPT = 40; // messages kept on this device per person
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
function speak(text) {
  if (!canSpeak || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}
const storeKey = (userId) => `assistant:chat:${userId}`;
const readHistory = (userId) => {
  try { const v = JSON.parse(localStorage.getItem(storeKey(userId)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

/** Three dots that pulse while the assistant is thinking. */
function Thinking({ color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }} accessibilityLabel="The assistant is thinking">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 4, backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, (i + 1) / 4, (i + 2) / 4, 1], outputRange: [0.25, 1, 0.25, 0.25] }),
          }}
        />
      ))}
    </View>
  );
}

/**
 * The assistant chat: ask in your own words, by typing or talking. It answers from the person's real to-dos and,
 * for anything that would change something, shows exactly what it would do and waits for a yes.
 * The conversation is kept on this device (per person) until cleared, and sent along so follow-ups have context.
 * `ref.ask(text)` lets the dashboard put a question in.
 */
const AssistantChat = forwardRef(function AssistantChat({ enabled, bottomInset = 0, onChanged }, ref) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { fetchTodos } = useTodos();
  const [messages, setMessages] = useState(() => readHistory(user?.id)); // { role, content, proposals?, done?, error? }
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(() => { try { return localStorage.getItem('assistant:voice') === '1'; } catch { return false; } });
  const scrollRef = useRef(null);
  const draftRef = useRef('');
  const viaVoice = useRef(false);
  const busyRef = useRef(false); // one request at a time, even when two taps land together
  draftRef.current = draft;

  useEffect(() => {
    try { localStorage.setItem(storeKey(user?.id), JSON.stringify(messages.slice(-MAX_KEPT))); } catch { /* private mode */ }
  }, [messages, user?.id]);

  const send = useCallback(async (text, spoken = false, base = null) => {
    const content = String(text || '').trim();
    if (!content || busyRef.current) return;
    busyRef.current = true;
    const next = [...(base || messages), { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    try {
      const history = next.filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c }));
      const res = await api.post('/assistant/chat', { messages: history }, { timeout: 90000, __skipOops: true });
      setMessages((m) => [...m, { role: 'assistant', content: res.data.reply, proposals: res.data.proposals || [] }]);
      if (voiceReplies || spoken) speak(res.data.reply);
      onChanged?.();
    } catch (err) {
      const message = err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'That took too long. Try again.' : 'I could not reach the assistant. Check your connection and try again.');
      setMessages((m) => [...m, { role: 'assistant', content: message, error: true, retry: content }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [messages, voiceReplies, onChanged]);

  useImperativeHandle(ref, () => ({ ask: (text) => send(text) }), [send]);

  const voice = useVoiceInput({
    lang: 'en-IN',
    onFinish: () => {
      if (viaVoice.current && draftRef.current.trim()) send(draftRef.current, true);
      viaVoice.current = false;
    },
  });
  const toggleMic = () => {
    if (voice.listening) { voice.stop(); return; }
    window.speechSynthesis?.cancel?.();
    viaVoice.current = true;
    voice.start(draft, setDraft);
  };

  const retry = (index) => {
    const failed = messages[index];
    // Ask again from the state before the failed question.
    send(failed.retry, false, messages.slice(0, Math.max(0, index - 1)));
  };

  const decide = async (index, yes) => {
    const msg = messages[index];
    if (!yes) { setMessages((m) => m.map((x, i) => (i === index ? { ...x, done: msg.proposals.map(() => ({ ok: false, message: 'Left as it was' })) } : x))); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await api.post('/assistant/execute', { actions: msg.proposals.map(({ tool, args }) => ({ tool, args })) }, { timeout: 90000 });
      setMessages((m) => m.map((x, i) => (i === index ? { ...x, done: res.data.results } : x)));
      fetchTodos();
      onChanged?.();
      if (res.data.results.every((r) => r.ok)) showToast({ message: 'Done', tone: 'success' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not do that', tone: 'error' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!messages.length) return;
    const ok = await confirmDialog({ title: 'Clear the chat?', message: 'The conversation on this device is removed. Your to-dos are not touched.', confirmLabel: 'Clear' });
    if (!ok) return;
    setMessages([]);
    window.speechSynthesis?.cancel?.();
  };

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60); }, [messages, busy]);
  const toggleVoiceReplies = () => {
    const v = !voiceReplies;
    setVoiceReplies(v);
    try { localStorage.setItem('assistant:voice', v ? '1' : '0'); } catch { /* private mode */ }
    if (!v) window.speechSynthesis?.cancel?.();
  };

  const first = (user?.name || '').split(' ')[0];
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="chatbubbles-outline" size={17} color={colors.brand[600]} />
        <Text style={styles.headTitle}>Ask the assistant</Text>
        <View style={{ flex: 1 }} />
        {canSpeak && enabled && (
          <AnimatedPressable onPress={toggleVoiceReplies} style={styles.iconBtn} accessibilityLabel={voiceReplies ? 'Stop speaking the answers' : 'Speak the answers'}>
            <Ionicons name={voiceReplies ? 'volume-high' : 'volume-mute-outline'} size={19} color={voiceReplies ? colors.brand[600] : colors.gray[500]} />
          </AnimatedPressable>
        )}
        {messages.length > 0 && (
          <AnimatedPressable onPress={clear} style={styles.clearBtn} accessibilityLabel="Clear chat">
            <Ionicons name="trash-outline" size={15} color={colors.gray[600]} />
            <Text style={styles.clearText}>Clear</Text>
          </AnimatedPressable>
        )}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
        {!enabled && <Text style={styles.off}>The AI chat is not switched on yet. The owner needs to add the OpenAI key on the server. The overview still works.</Text>}
        {enabled && messages.length === 0 && (
          <View style={styles.hello}>
            <View style={styles.helloIcon}><Ionicons name="sparkles" size={22} color="#fff" /></View>
            <Text style={styles.helloTitle}>Hi {first}. What do you need?</Text>
            <Text style={styles.helloSub}>Ask about your work, or tell me what to change, like “Remind me to finish the report by Friday”. I always show what I plan to do and wait for your OK.</Text>
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.row, m.role === 'user' && { alignItems: 'flex-end' }]}>
            <View style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs, m.error && styles.errorBubble]}>
              <Text style={[styles.text, m.role === 'user' && { color: '#fff' }]} selectable>{m.content}</Text>
              {m.error && !!m.retry && (
                <AnimatedPressable onPress={() => retry(i)} disabled={busy} style={styles.retry}>
                  <Ionicons name="refresh" size={14} color={colors.red[600]} />
                  <Text style={styles.retryText}>Try again</Text>
                </AnimatedPressable>
              )}
            </View>
            {!!m.proposals?.length && (
              <View {...glass('card')} style={styles.proposal}>
                <Text style={styles.propTitle}>{m.proposals.length === 1 ? 'I would do this' : `I would do these ${m.proposals.length} things`}</Text>
                {m.proposals.map((p, k) => (
                  <View key={k} style={styles.propRow}>
                    <Ionicons
                      name={m.done ? (m.done[k]?.ok ? 'checkmark-circle' : 'close-circle') : 'ellipse-outline'}
                      size={17}
                      color={m.done ? (m.done[k]?.ok ? colors.brand[600] : colors.gray[400]) : colors.gray[400]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.propText}>{p.summary}</Text>
                      {!!m.done?.[k] && <Text style={[styles.propNote, !m.done[k].ok && { color: colors.red[600] }]}>{m.done[k].message}</Text>}
                    </View>
                  </View>
                ))}
                {!m.done && (
                  <View style={styles.propBtns}>
                    <AnimatedPressable style={[styles.btn, { backgroundColor: colors.brand[600] }]} disabled={busy} onPress={() => decide(i, true)}>
                      <Text style={[styles.btnText, { color: '#fff' }]}>Yes, do it</Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={[styles.btn, { backgroundColor: colors.gray[100] }]} disabled={busy} onPress={() => decide(i, false)}>
                      <Text style={[styles.btnText, { color: colors.gray[800] }]}>Not now</Text>
                    </AnimatedPressable>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
        {busy && <View style={styles.row}><View style={[styles.bubble, styles.theirs]}><Thinking color={colors.brand[600]} /></View></View>}
      </ScrollView>

      {enabled && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.suggest} keyboardShouldPersistTaps="handled">
          {SUGGESTED.map((q) => (
            <AnimatedPressable key={q} style={styles.idea} onPress={() => send(q)} disabled={busy}>
              <Text style={styles.ideaText}>{q}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      )}
      {voice.listening && <VoiceLive levels={voice.levels} live={voice.live} onStop={voice.stop} />}
      {enabled && (
        <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, spacing.md) }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => send(draft)}
            placeholder="Ask or tell me anything about your work"
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')}
            style={styles.input}
            returnKeyType="send"
            editable={!busy}
            accessibilityLabel="Message to the assistant"
          />
          {voice.supported && (
            <AnimatedPressable onPress={toggleMic} style={[styles.round, { backgroundColor: voice.listening ? colors.gray[800] : colors.gray[100] }]} accessibilityLabel="Talk">
              <Ionicons name={voice.listening ? 'stop' : 'mic'} size={19} color={voice.listening ? '#fff' : colors.brand[600]} />
            </AnimatedPressable>
          )}
          <AnimatedPressable onPress={() => send(draft)} disabled={!draft.trim() || busy} style={[styles.round, { backgroundColor: colors.brand[600] }, (!draft.trim() || busy) && { opacity: 0.45 }]} accessibilityLabel="Send">
            <Ionicons name="arrow-up" size={19} color="#fff" />
          </AnimatedPressable>
        </View>
      )}
    </View>
  );
});

export default AssistantChat;

const createStyles = (colors) => StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.gray[200] },
  headTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.gray[100] },
  clearText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[700] },
  off: { color: colors.gray[500], fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  hello: { alignItems: 'center', paddingTop: spacing.lg },
  helloIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  helloTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], marginTop: spacing.md },
  helloSub: { fontSize: fontSize.sm, color: colors.gray[500], textAlign: 'center', marginTop: 6, maxWidth: 340, lineHeight: 18 },
  row: { marginBottom: spacing.md, alignItems: 'flex-start' },
  bubble: { maxWidth: '90%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: colors.brand[600], borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.gray[100], borderBottomLeftRadius: 6 },
  errorBubble: { backgroundColor: colors.red[50], borderColor: colors.red[100], borderWidth: 1 },
  text: { fontSize: fontSize.base, color: colors.gray[900], lineHeight: 21 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  retryText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.red[600] },
  proposal: { marginTop: 8, borderRadius: radius.xl, padding: spacing.md, alignSelf: 'stretch', maxWidth: 520 },
  propTitle: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  propRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 },
  propText: { fontSize: fontSize.base, color: colors.gray[900] },
  propNote: { fontSize: 12, color: colors.gray[500], marginTop: 1 },
  propBtns: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  btnText: { fontSize: fontSize.sm, fontWeight: '700' },
  suggest: { gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6 },
  idea: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.brand[50], borderWidth: 1, borderColor: colors.brand[100] },
  ideaText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.brand[700] },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  input: { flex: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
