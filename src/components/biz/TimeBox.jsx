import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { fontSize } from '../../theme/theme';
import { Chip } from '../kit';
import { useNowTick } from '../todos/TimeHealth';
import TimeLogSheet from './TimeLogSheet';
import { Meter, minutesText } from './ui';
import useTimer from '../../hooks/useTimer';

/** The time spent on a business task (sub-tasks included), with a timer and a way to log time by hand. */
export default function TimeBox({ todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { timer, start, stop } = useTimer();
  const now = useNowTick(30000);
  const [info, setInfo] = useState(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/time/todo/${todo.id}`, { __skipOops: true });
      setInfo(res.data);
    } catch {
      setInfo(null);
    }
  }, [todo.id]);
  useEffect(() => { setInfo(null); load(); }, [load]);

  const mine = timer && timer.todo_id === todo.id;
  const elapsed = mine ? Math.max(0, Math.floor((now - new Date(timer.started_at).getTime()) / 60000)) : 0;
  const logged = info ? info.total_minutes : 0;
  const estimate = todo.duration_minutes || null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.text}>
        {info ? (logged ? `${minutesText(logged)} logged` : 'Nothing logged yet') : 'Loading'}
        {estimate ? ` of ${minutesText(estimate)} planned` : ''}
      </Text>
      {!!estimate && !!logged && <Meter percent={Math.round((logged / estimate) * 100)} />}
      <View style={styles.row}>
        {mine ? (
          <Chip small icon="stop" label={`Stop · ${minutesText(elapsed)}`} active onPress={async () => { if (await stop()) load(); }} />
        ) : (
          !todo.is_done && <Chip small icon="play" label="Start timer" onPress={async () => { if (await start(todo.id)) load(); }} />
        )}
        <Chip small icon="add" label="Log time" onPress={() => setLogOpen(true)} />
      </View>
      <TimeLogSheet visible={logOpen} onClose={() => setLogOpen(false)} todo={todo} onLogged={load} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  text: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
