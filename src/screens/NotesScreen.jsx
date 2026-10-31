import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, BRAND } from '../theme/theme';
import useIsDesktop from '../hooks/useBreakpoint';
import BackTitle from '../components/BackTitle';
import NotesPad from '../components/notes/NotesPad';
import MeetingNotesScreen from './MeetingNotesScreen';

/**
 * Notes: one module for the notepad (text and pictures, nothing else) and the list of recorded meetings.
 * The route is still called MeetingNotes so old links and notifications keep working.
 */
export default function NotesScreen({ route }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const [tab, setTab] = useState(route?.params?.tab === 'meetings' ? 'meetings' : 'notes');
  useEffect(() => { if (route?.params?.tab) setTab(route.params.tab === 'meetings' ? 'meetings' : 'notes'); }, [route?.params?.tab]);
  const tabs = useMemo(() => [['notes', 'document-text-outline', 'Notes'], ['meetings', 'mic-outline', 'Meetings']], []);
  return (
    <View style={{ flex: 1, paddingTop: desktop ? spacing.md : insets.top }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        <BackTitle title="Notes" />
        <View style={{ flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
          {tabs.map(([k, icon, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: tab === k ? BRAND : 'transparent' }}>
              <Ionicons name={icon} size={16} color={tab === k ? BRAND : colors.gray[500]} />
              <Text style={{ fontSize: 14, color: tab === k ? colors.gray[900] : colors.gray[600], fontWeight: tab === k ? '600' : '400' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'notes' ? <NotesPad desktop={desktop} /> : <MeetingNotesScreen embedded />}
      </View>
    </View>
  );
}
