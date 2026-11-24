import { useState } from 'react';
import { Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { todayYmd } from '../../utils/dates';
import useTimebox from '../../hooks/useTimebox';
import DayReportSheet from './DayReportSheet';

// Loads today's timebox only once the report is asked for, so merely opening a board costs nothing.
function Host({ onClose }) {
  const date = todayYmd();
  const { data, box } = useTimebox(date);
  return <DayReportSheet open onClose={onClose} date={date} box={box} initial={data?.report || null} />;
}

/** The "Make today's day report" button in a board's header. It works from any view of the board. */
export default function DayReportLauncher({ desktop }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="Make today's day report" style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.md, backgroundColor: hovered ? colors.brand[100] : colors.brand[50] })}>
        <Ionicons name="document-text-outline" size={16} color={BRAND} />
        {desktop && <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND }}>Make today's day report</Text>}
      </Pressable>
      {open && <Host onClose={() => setOpen(false)} />}
    </>
  );
}
