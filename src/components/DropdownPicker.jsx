import { useState, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';

export function DropdownPicker({ selectedValue, onValueChange, items, style }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const selectedItem = items.find((item) => item.value === selectedValue);

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.triggerText, !selectedItem && styles.placeholderText]}
          numberOfLines={1}
        >
          {selectedItem ? selectedItem.label : ''}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.gray[400]} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.value}
                      style={styles.option}
                      onPress={() => {
                        onValueChange(item.value);
                        setOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          item.value === selectedValue && styles.optionTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.value === selectedValue && (
                        <Ionicons name="checkmark" size={18} color={colors.brand[600]} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const createStyles = (colors) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: spacing.md,
  },
  triggerText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.gray[900],
  },
  placeholderText: {
    color: colors.gray[400],
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxHeight: 400,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  scroll: {
    maxHeight: 380,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  optionText: {
    fontSize: fontSize.base,
    color: colors.gray[700],
  },
  optionTextSelected: {
    color: colors.brand[600],
    fontWeight: '600',
  },
});
