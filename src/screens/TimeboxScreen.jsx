import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { spacing, radius, BRAND } from '../theme/theme';
import useIsDesktop from '../hooks/useBreakpoint';
import useTimebox from '../hooks/useTimebox';
import BackTitle from '../components/BackTitle';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import TimeboxDay from '../components/timebox/TimeboxDay';
import TeamTimebox from '../components/timebox/TeamTimebox';
import { STATUS_LOOK } from '../components/timebox/model';
import { paletteHex } from '../components/board/model';
import { addDays, formatDayHeader, parseYmd, todayYmd, WEEKDAYS_SHORT } from '../utils/dates';
import { showToast } from '../utils/events';

/** The last two weeks and tomorrow, each with a dot for its status. */
function DayStrip({ date, userId, onPick }) {
  const colors = useColors();
  const { subscribe } = useChat();
  const [days, setDays] = useState([]);
  const load = useCallback(async () => {
    try {
      const res = await api.get('/timebox/days', { params: userId ? { user_id: userId } : {}, __skipOops: true });
      setDays(res.data.days);
    } catch { /* the strip is a convenience */ }
  }, [userId]);
  useEffect(() => { load(); }, [load, date]);
  useEffect(() => subscribe('timebox:changed', () => load()), [subscribe, load]);
  const strip = useRef(null);
  return (
    // Today and tomorrow are at the end; on a phone start there.
    <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} onContentSizeChange={() => strip.current?.scrollToEnd({ animated: false })}>
      {days.map((d) => {
        const on = d.date === date;
        const day = parseYmd(d.date);
        return (
          <Pressable key={d.date} onPress={() => onPick(d.date)} style={({ hovered }) => ({ width: 44, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: on ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent', borderWidth: 1, borderColor: on ? colors.brand[200] : 'transparent' })}>
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>{WEEKDAYS_SHORT[day.getDay()]}</Text>
            <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? BRAND : colors.gray[900] }}>{day.getDate()}</Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: d.status === 'none' ? colors.gray[200] : paletteHex(STATUS_LOOK[d.status].color) }} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Tab({ label, active, onPress }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 2, borderColor: active ? BRAND : 'transparent' }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: active ? BRAND : colors.gray[600] }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Timebox planner (route Timebox, params { date?, userId?, tab? }). Mine: today's box first thing in the morning,
 * filled in and sent at night. Team: the people below me, and a sent box of any of them, read-only.
 */
export default function TimeboxScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { user } = useAuth();
  const [date, setDate] = useState(route.params?.date || todayYmd());
  const [tab, setTab] = useState(route.params?.tab || 'mine');
  const [person, setPerson] = useState(null); // someone below me, opened from Team
  const [openId, setOpenId] = useState(null);
  const tb = useTimebox(date, person?.id || null);

  useEffect(() => { if (route.params?.date) setDate(route.params.date); }, [route.params?.date]);

  const send = useCallback(async () => {
    const ok = await tb.send();
    if (ok) showToast({ message: 'Timebox sent. The people above you can read it now.', icon: 'paper-plane' });
  }, [tb]);

  const pad = desktop ? spacing.xl : spacing.md;
  const showTeam = tab === 'team' && !person;
  const title = person ? person.name : 'Timebox';

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ paddingHorizontal: pad, paddingTop: spacing.md, gap: spacing.sm, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {person ? (
            <Pressable onPress={() => setPerson(null)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="chevron-back" size={22} color={colors.gray[700]} />
              <Text style={{ fontSize: desktop ? 24 : 20, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
            </Pressable>
          ) : (
            <BackTitle title={title} style={{ fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }} />
          )}
          <View style={{ flex: 1 }} />
          {tb.saving && <Text style={{ fontSize: 12, color: colors.gray[500] }}>Saving…</Text>}
        </View>
        {!person && user?.can_monitor && (
          <View style={{ flexDirection: 'row', gap: spacing.md, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
            <Tab label="My timebox" active={tab === 'mine'} onPress={() => setTab('mine')} />
            <Tab label="My team" active={tab === 'team'} onPress={() => setTab('team')} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable onPress={() => setDate((d) => addDays(d, -1))} accessibilityLabel="The day before" hitSlop={8}><Ionicons name="chevron-back-circle-outline" size={24} color={colors.gray[600]} /></Pressable>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900], minWidth: 150, textAlign: 'center' }}>{formatDayHeader(date)}</Text>
          <Pressable onPress={() => setDate((d) => addDays(d, 1))} accessibilityLabel="The day after" hitSlop={8}><Ionicons name="chevron-forward-circle-outline" size={24} color={colors.gray[600]} /></Pressable>
          {date !== todayYmd() && <Pressable onPress={() => setDate(todayYmd())}><Text style={{ color: BRAND, fontWeight: '600' }}>Today</Text></Pressable>}
          {!showTeam && !person && date === todayYmd() && (
            <Pressable onPress={() => setDate(addDays(todayYmd(), 1))}><Text style={{ color: BRAND, fontWeight: '600' }}>Plan tomorrow</Text></Pressable>
          )}
        </View>
        {!showTeam && <DayStrip date={date} userId={person?.id || null} onPick={setDate} />}
      </View>
      <ScrollView contentContainerStyle={{ padding: pad, gap: spacing.md, paddingBottom: 140, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
        {showTeam ? (
          <TeamTimebox date={date} onOpenPerson={(p) => setPerson(p)} />
        ) : tb.error ? (
          <Text style={{ color: colors.gray[600] }}>{tb.error}</Text>
        ) : !tb.data ? (
          <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} />
        ) : person && !tb.data.box ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name={STATUS_LOOK[tb.data.status].icon} size={32} color={colors.gray[400]} />
            <Text style={{ fontSize: 15, color: colors.gray[700] }}>
              {tb.data.status === 'planned' ? `${person.name.split(' ')[0]} has planned this day but not sent it yet.` : `${person.name.split(' ')[0]} has not started a timebox for this day.`}
            </Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>You can read it once it is sent.</Text>
          </View>
        ) : (
          <TimeboxDay data={tb.data} box={tb.box} update={tb.update} onSend={send} onOpenTodo={setOpenId} />
        )}
      </ScrollView>
      <TodoDetailSheet todoId={openId} onClose={() => setOpenId(null)} />
    </View>
  );
}
