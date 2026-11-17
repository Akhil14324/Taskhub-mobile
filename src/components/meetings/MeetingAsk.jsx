import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import Chart from '../dashboard/Charts';
import { Pie } from '../board/BoardDashboard';
import FlowChart from './FlowChart';
import { showToast, confirmDialog } from '../../utils/events';

const SERIES_COLORS = ['dark_orange', 'aquamarine', 'purple', 'green', 'blue', 'yellow'];
const STARTERS = [
  'What was decided?',
  'Who has to do what? Show a chart of tasks per person',
  'Build a dashboard of this meeting',
  'Draw the process we agreed on as a flow chart',
  'What is still open or unclear?',
];

/** The picture that came with an answer: a chart of numbers from the meeting, or a flow chart. */
export function Visual({ visual }) {
  const colors = useColors();
  if (!visual) return null;
  let body = null;
  if (visual.kind === 'dashboard') {
    return (
      <View style={{ marginTop: 8, gap: 10 }}>
        {!!visual.title && <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>{visual.title}</Text>}
        {visual.tiles.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {visual.tiles.map((t, i) => (
              <View key={i} style={{ flexGrow: 1, flexBasis: 130, minWidth: 0, borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: colors.gray[600] }}>{t.label}</Text>
                <Text numberOfLines={1} style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{t.value}</Text>
                {!!t.note && <Text numberOfLines={2} style={{ fontSize: 12, color: colors.gray[500] }}>{t.note}</Text>}
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {visual.charts.map((c, i) => <View key={i} style={{ flexGrow: 1, flexBasis: 320, minWidth: 0 }}><Visual visual={c} /></View>)}
        </View>
      </View>
    );
  }
  if (visual.kind === 'flow') {
    body = <FlowChart flow={visual} />;
  } else if (visual.kind === 'chart') {
    const data = { categories: visual.categories, series: visual.series.map((s, i) => ({ ...s, color: SERIES_COLORS[i % SERIES_COLORS.length] })) };
    body = (
      <View style={{ padding: spacing.md }}>
        {visual.chart === 'pie' || visual.chart === 'donut'
          ? <Pie data={data} donut={visual.chart === 'donut'} size={170} />
          : <Chart data={data} type={visual.chart} height={230} showLegend={data.series.length > 1} />}
      </View>
    );
  }
  if (!body) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, backgroundColor: colors.white, overflow: 'hidden', marginTop: 8 }}>
      {!!visual.title && <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900], paddingHorizontal: spacing.md, paddingTop: spacing.md }}>{visual.title}</Text>}
      {body}
    </View>
  );
}

/**
 * Questions about one meeting, answered from its saved transcript. An answer can bring a chart or a flow
 * chart. The exchange is kept with the meeting, so it is here again the next time the meeting is opened.
 */
export default function MeetingAsk({ meetingId, initialChat, ready, kept = true }) {
  const colors = useColors();
  const [chat, setChat] = useState(Array.isArray(initialChat) ? initialChat : []);
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(null); // the question on its way
  const scroller = useRef(null);

  useEffect(() => { setChat(Array.isArray(initialChat) ? initialChat : []); }, [initialChat]);
  useEffect(() => {
    const id = setTimeout(() => scroller.current?.scrollToEnd?.({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [chat.length, asking]);

  const ask = async (q) => {
    const question = (q ?? text).trim();
    if (!question || asking) return;
    setAsking(question);
    setText('');
    try {
      const res = await api.post(`/meeting-notes/${meetingId}/ask`, kept ? { question } : { question, chat }, { timeout: 180000, __skipOops: true });
      setChat(res.data.chat || []);
      if (res.data.cut) showToast({ message: 'This meeting is very long: the answer used its beginning and its end.', icon: 'information-circle' });
    } catch (err) {
      setText(question);
      showToast({ message: err.response?.data?.error || 'The AI could not answer. Try again.', tone: 'error' });
    } finally {
      setAsking(null);
    }
  };

  const clear = async () => {
    const ok = await confirmDialog({ title: 'Clear these questions?', message: 'The questions and answers are removed. The meeting and its transcript stay.', confirmLabel: 'Clear' });
    if (!ok) return;
    try {
      if (kept) await api.delete(`/meeting-notes/${meetingId}/ask`);
      setChat([]);
    } catch {
      showToast({ message: 'Could not clear them', tone: 'error' });
    }
  };

  if (!ready) {
    return <Text style={{ fontSize: 14, color: colors.gray[500], paddingVertical: spacing.lg }}>Record or paste the meeting first. Then you can ask anything about it here.</Text>;
  }

  return (
    <View style={{ gap: spacing.md }}>
      <ScrollView ref={scroller} style={{ maxHeight: 520 }} contentContainerStyle={{ gap: spacing.md, paddingVertical: 4 }}>
        {!chat.length && !asking && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, color: colors.gray[600], lineHeight: 20 }}>Ask about anything that was said. You can also ask for a chart or a flow chart.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {STARTERS.map((s) => (
                <AnimatedPressable key={s} onPress={() => ask(s)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.gray[300] }}>
                  <Text style={{ fontSize: 13, color: colors.gray[800] }}>{s}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        )}
        {chat.map((m, i) => (m.role === 'user' ? (
          <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: colors.brand[600], borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: '#fff' }}>{m.text}</Text>
          </View>
        ) : (
          <View key={i} style={{ alignSelf: 'stretch' }}>
            <Text selectable style={{ fontSize: 14, lineHeight: 21, color: colors.gray[900] }}>{m.text}</Text>
            <Visual visual={m.visual} />
          </View>
        )))}
        {!!asking && (
          <>
            <View style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: colors.brand[600], borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 9, opacity: 0.75 }}>
              <Text style={{ fontSize: 14, lineHeight: 20, color: '#fff' }}>{asking}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.brand[600]} />
              <Text style={{ fontSize: 13, color: colors.gray[500] }}>Reading the meeting</Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray[300], borderRadius: 24, paddingLeft: 14, paddingRight: 5, paddingVertical: 5, backgroundColor: colors.white }}>
        <Ionicons name="sparkles-outline" size={17} color={colors.brand[600]} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => ask()}
          editable={!asking}
          placeholder="Ask about this meeting"
          placeholderTextColor={colors.gray[400]}
          returnKeyType="send"
          style={{ flex: 1, fontSize: 15, color: colors.gray[900], paddingVertical: 8, outlineStyle: 'none' }}
        />
        <AnimatedPressable onPress={() => ask()} disabled={!!asking || !text.trim()} accessibilityLabel="Ask"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() && !asking ? colors.brand[600] : colors.gray[200] }}>
          <Ionicons name="arrow-up" size={18} color={text.trim() && !asking ? '#fff' : colors.gray[500]} />
        </AnimatedPressable>
      </View>
      {chat.length > 0 && !asking && (
        <AnimatedPressable onPress={clear} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>Clear the questions</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}
