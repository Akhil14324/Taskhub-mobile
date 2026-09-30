import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { showToast } from '../utils/events';

const RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'One capital letter' },
  { test: (p) => /[a-z]/.test(p), label: 'One small letter' },
  { test: (p) => /[0-9]/.test(p), label: 'One number' },
];

/** Shown right after signing in with a temporary password. */
export default function ChangePasswordScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user, refreshUser, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);

  const valid = RULES.every((r) => r.test(next)) && next === confirm && current.length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.put('/users/me/password', { current_password: current, new_password: next });
      showToast({ message: 'Password set. Welcome aboard! 🎉', tone: 'success' });
      await refreshUser();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change the password', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.gray[50] }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(400)} style={styles.iconWrap}>
          <Ionicons name="key" size={34} color={colors.brand[600]} />
        </Animated.View>
        <Text style={styles.title}>Welcome, {user?.name?.split(' ')[0]}!</Text>
        <Text style={styles.subtitle}>
          You signed in with a temporary password. Choose your own to continue{user?.display_title ? ` as ${user.display_title}` : ''}.
        </Text>

        <PasswordField label="Temporary password" value={current} onChangeText={setCurrent} show={show} />
        <PasswordField label="New password" value={next} onChangeText={setNext} show={show} />
        <PasswordField label="Confirm new password" value={confirm} onChangeText={setConfirm} show={show} />

        <AnimatedPressable onPress={() => setShow((s) => !s)} style={styles.showRow} haptic="light">
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.gray[500]} />
          <Text style={styles.showText}>{show ? 'Hide' : 'Show'} passwords</Text>
        </AnimatedPressable>

        <View style={styles.rules}>
          {RULES.map((r) => {
            const ok = r.test(next);
            return (
              <View key={r.label} style={styles.rule}>
                <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.green[600] : colors.gray[300]} />
                <Text style={[styles.ruleText, ok && { color: colors.green[700] }]}>{r.label}</Text>
              </View>
            );
          })}
          <View style={styles.rule}>
            <Ionicons name={confirm && next === confirm ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={confirm && next === confirm ? colors.green[600] : colors.gray[300]} />
            <Text style={styles.ruleText}>Both passwords match</Text>
          </View>
        </View>

        <AnimatedPressable onPress={save} disabled={!valid || saving} haptic="medium" style={[styles.btn, (!valid || saving) && { opacity: 0.45 }]}>
          <Text style={styles.btnText}>{saving ? 'Saving…' : 'Set password & continue'}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={logout} style={styles.logout} haptic="light">
          <Text style={styles.logoutText}>Sign out</Text>
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PasswordField({ label, value, onChangeText, show }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
        style={{
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.gray[200],
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: fontSize.base,
          color: colors.gray[900],
          outlineStyle: 'none',
        }}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, maxWidth: 480, width: '100%', alignSelf: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand[50], alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], textAlign: 'center', marginTop: spacing.lg },
  subtitle: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  showText: { fontSize: fontSize.sm, color: colors.gray[500] },
  rules: { marginTop: spacing.lg, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ruleText: { fontSize: fontSize.sm, color: colors.gray[500] },
  btn: { marginTop: spacing.xl, paddingVertical: 15, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600] },
  btnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.md },
  logout: { alignItems: 'center', marginTop: spacing.lg },
  logoutText: { color: colors.gray[500], fontWeight: '600' },
});
