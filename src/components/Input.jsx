import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/theme';

export function Input({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, style }) {
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

export function MultilineInput({ label, value, onChangeText, placeholder, rows, style }) {
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

const styles = StyleSheet.create({
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
  },
  multiline: {
    minHeight: 80,
  },
});
