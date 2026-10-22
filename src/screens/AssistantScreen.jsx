import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import VoiceLive from '../components/VoiceLive';
import useVoiceInput from '../hooks/useVoiceInput';
import useAi from '../hooks/useAi';
import useIsDesktop from '../hooks/useBreakpoint';
import { showToast } from '../utils/events';
import api from '../api/client';

const IDEAS = [
  'Read me my plan for today',
  'What is slipping this week?',
  'Which tasks are likely to miss their date?',
  'How are the businesses doing?',
  'Move everything due today to tomorrow',
];

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
function speak(text) {
  if (!canSpeak || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}

/**
 * The assistant: ask in your own words, by typing or talking. It looks things up as you and, for anything
 * that would change something, shows exactly what it would do and waits for a yes.
 */
export default function AssistantScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const enabled = useAi();
  const { user } = useAuth();
  const { fetchTodos } = useTodos();
  const [messages, setMessages] = useState([]); // { role, content, proposals?, done? }
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(() => { try { return localStorage.getItem('assistant:voice') === '1'; } catch { return false; } });
  const scrollRef = useRef(null);
  const draftRef = useRef('');
  const viaVoice = useRef(false);
  draftRef.current = draft;

  const send = useCallback(async (text, spoken = false) => {
    const content = String(text || '').trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    try {
      const res = await api.post('/assistant/chat', { messages: next.map(({ role, content: c }) => ({ role, content: c })) }, { timeout: 90000, __skipOops: true });
      setMessages((m) => [...m, { role: 'assistant', content: res.data.reply, proposals: res.data.proposals || [] }]);
      if (voiceReplies || spoken) speak(res.data.reply);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: err.response?.data?.error || 'I could not reach the assistant. Try again.', error: true }]);
    } finally {
      setBusy(false);
    }
  }, [messages, busy, voiceReplies]);

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

  const decide = async (index, yes) => {
    const msg = messages[index];
    if (!yes) { setMessages((m) => m.map((x, i) => (i === index ? { ...x, done: [{ ok: false, message: 'Left as it was' }] } : x))); return; }
    setBusy(true);
    try {
      const res = await api.post('/assistant/execute', { actions: msg.proposals.map(({ tool, args }) => ({ tool, args })) }, { timeout: 90000 });
      setMessages((m) => m.map((x, i) => (i === index ? { ...x, done: res.data.results } : x)));
      fetchTodos();
      if (res.data.results.every((r) => r.ok)) showToast({ message: 'Done', tone: 'success' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not do that', tone: 'error' });
    } finally {
      setBusy(false);
    }
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
    <KeyboardAvoidingView style={{ flex: 1, paddingTop: desktop ? spacing.lg : insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <BackTitle title="Assistant" style={{ flex: 1 }} />
        {canSpeak && (
          <AnimatedPressable onPress={toggleVoiceReplies} style={styles.iconBtn} accessibilityLabel="Speak the answers">
            <Ionicons name={voiceReplies ? 'volume-high' : 'volume-mute-outline'} size={21} color={voiceReplies ? colors.brand[600] : colors.gray[500]} />
          </AnimatedPressable>
        )}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        {!enabled && <Text style={styles.off}>The assistant is not switched on yet. The owner needs to add the OpenAI key on the server.</Text>}
        {enabled && messages.length === 0 && (
          <View style={styles.hello}>
            <View style={styles.helloIcon}><Ionicons name="sparkles" size={26} color="#fff" /></View>
            <Text style={styles.helloTitle}>Hi {first}. What do you need?</Text>
            <Text style={styles.helloSub}>Ask about your work, or tell me what to change. I will always show you what I plan to do and wait for your OK.</Text>
            <View style={styles.ideas}>
              {IDEAS.map((q) => (
                <AnimatedPressable key={q} style={styles.idea} onPress={() => send(q)}>
                  <Text style={styles.ideaText}>{q}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[styles.row, m.role === 'user' && { alignItems: 'flex-end' }]}>
            <View style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs, m.error && { borderColor: colors.red[500], borderWidth: 1 }]}>
              <Text style={[styles.text, m.role === 'user' && { color: '#fff' }]} selectable>{m.content}</Text>
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
                      {!!m.done?.[k] && !m.done[k].ok && <Text style={styles.propErr}>{m.done[k].message}</Text>}
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
        {busy && <View style={styles.row}><View style={[styles.bubble, styles.theirs]}><ActivityIndicator size="small" color={colors.brand[600]} /></View></View>}
      </ScrollView>

      {voice.listening && <VoiceLive levels={voice.levels} live={voice.live} onStop={voice.stop} />}
      {enabled && (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) + (desktop ? 0 : 66) }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => send(draft)}
            placeholder="Ask or tell me anything"
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')}
            style={styles.input}
            returnKeyType="send"
          />
          {voice.supported && (
            <AnimatedPressable onPress={toggleMic} style={[styles.round, { backgroundColor: voice.listening ? colors.gray[800] : colors.gray[100] }]} accessibilityLabel="Talk">
              <Ionicons name={voice.listening ? 'stop' : 'mic'} size={20} color={voice.listening ? '#fff' : colors.brand[600]} />
            </AnimatedPressable>
          )}
          <AnimatedPressable onPress={() => send(draft)} disabled={!draft.trim() || busy} style={[styles.round, { backgroundColor: colors.brand[600] }, (!draft.trim() || busy) && { opacity: 0.45 }]} accessibilityLabel="Send">
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </AnimatedPressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  off: { color: colors.gray[500], fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.xl },
  hello: { alignItems: 'center', paddingTop: spacing.xl },
  helloIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  helloTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], marginTop: spacing.md },
  helloSub: { fontSize: fontSize.sm, color: colors.gray[500], textAlign: 'center', marginTop: 6, maxWidth: 340 },
  ideas: { marginTop: spacing.lg, gap: 8, alignSelf: 'stretch', alignItems: 'center' },
  idea: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.gray[100] },
  ideaText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  row: { marginBottom: spacing.md, alignItems: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: colors.brand[600], borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.gray[100], borderBottomLeftRadius: 6 },
  text: { fontSize: fontSize.base, color: colors.gray[900], lineHeight: 21 },
  proposal: { marginTop: 8, borderRadius: radius.lg, padding: spacing.md, alignSelf: 'stretch', maxWidth: 520 },
  propTitle: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  propRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 },
  propText: { fontSize: fontSize.base, color: colors.gray[900] },
  propErr: { fontSize: 12, color: colors.red[600], marginTop: 1 },
  propBtns: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  btnText: { fontSize: fontSize.sm, fontWeight: '700' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  input: { flex: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
