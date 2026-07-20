import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';

export function Input({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, style }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        style={[styles.input, style]}
        placeholderTextColor={colors.gray[400]}
      />
    </View>
  );
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  if (!dateString) return new Date();
  // Handle both 'YYYY-MM-DD' and ISO strings like '2024-12-31T00:00:00.000Z'
  const dateOnly = String(dateString).slice(0, 10);
  const parsed = new Date(dateOnly + 'T00:00:00');
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getCalendarDays(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (isNaN(startDay) || isNaN(daysInMonth) || startDay < 0 || startDay > 6) {
    return [];
  }
  const weeks = [];
  let week = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export function DateInput({ label, value, onChangeText, placeholder }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [show, setShow] = useState(false);
  const initialDate = parseLocalDate(value);
  const [viewDate, setViewDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(value ? initialDate : null);

  const onOpen = () => {
    const base = parseLocalDate(value);
    setViewDate(base);
    setSelectedDate(value ? base : null);
    setShow(true);
  };

  const selectDay = (day) => {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    setSelectedDate(date);
    onChangeText(formatDate(date));
    setShow(false);
  };

  const changeMonth = (delta) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
  };

  const weeks = getCalendarDays(viewDate.getFullYear(), viewDate.getMonth());
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity onPress={onOpen} style={styles.input} activeOpacity={0.7}>
        <Text style={value ? styles.inputValue : styles.placeholder}>
          {value || placeholder || 'Select a date'}
        </Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShow(false)}>
          <View style={styles.calendarSheet}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={8}>
                <Ionicons name="chevron-back" size={24} color={colors.brand[600]} />
              </TouchableOpacity>
              <Text style={styles.calendarMonth}>{monthLabel}</Text>
              <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={8}>
                <Ionicons name="chevron-forward" size={24} color={colors.brand[600]} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeek}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={i} style={styles.calendarWeekDay}>{d}</Text>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {weeks.map((week, wi) => (
                <View key={wi} style={styles.calendarWeek}>
                  {week.map((day, di) => {
                    if (!day) return <View key={di} style={styles.calendarDay} />;
                    const isSelected =
                      selectedDate &&
                      selectedDate.getDate() === day &&
                      selectedDate.getMonth() === viewDate.getMonth() &&
                      selectedDate.getFullYear() === viewDate.getFullYear();
                    return (
                      <TouchableOpacity key={di} style={styles.calendarDay} onPress={() => selectDay(day)}>
                        <View style={[styles.calendarDayInner, isSelected && styles.calendarDaySelected]}>
                          <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>
                            {day}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export function MultilineInput({ label, value, onChangeText, placeholder, rows, style }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline
        numberOfLines={rows || 3}
        style={[styles.input, styles.multiline, style]}
        placeholderTextColor={colors.gray[400]}
        textAlignVertical="top"
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[700],
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.gray[900],
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  inputValue: {
    fontSize: fontSize.base,
    color: colors.gray[900],
  },
  placeholder: {
    fontSize: fontSize.base,
    color: colors.gray[400],
  },
  multiline: {
    minHeight: 80,
  },
  calendarOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: spacing.lg,
  },
  calendarSheet: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  calendarMonth: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
  },
  calendarWeek: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xs,
  },
  calendarWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray[500],
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayInner: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelected: {
    backgroundColor: colors.brand[600],
  },
  calendarDayText: {
    fontSize: fontSize.base,
    color: colors.gray[800],
  },
  calendarDayTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
});
