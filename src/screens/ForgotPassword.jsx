import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import { Input } from '../components/Input';
import { PrimaryButton } from '../components/Button';
import { ErrorBanner } from '../components/UI';
import AnimatedPressable from '../components/AnimatedPressable';
import { showToast } from '../utils/events';
import { spacing, radius, fontSize } from '../theme/theme';

/** Sets a new password for a username without asking for the old one (temporary, see the backend route). */
export default function ForgotPassword() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) { setError('Enter your username and a new password'); return; }
    if (password !== confirm) { setError('The two passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { username: username.trim(), new_password: password });
      showToast('Password updated. Sign in with the new password.');
      navigation.goBack();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not reset the password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: insets.top + spacing.md }}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back to sign in">
            <Ionicons name="chevron-back" size={22} color={colors.gray[700]} />
            <Text style={styles.backText}>Sign in</Text>
          </AnimatedPressable>
        </View>
        <View style={styles.form}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.sub}>Enter your username and choose a new password. You do not need the old one.</Text>
          {!!error && <ErrorBanner message={error} />}
          <Input label="Username" value={username} onChangeText={setUsername} placeholder="Your username" autoCapitalize="none" />
          <Input label="New password" value={password} onChangeText={setPassword} placeholder="At least 8 characters, upper, lower and a number" secureTextEntry />
          <Input label="Confirm new password" value={confirm} onChangeText={setConfirm} placeholder="Repeat the new password" secureTextEntry />
          <PrimaryButton onPress={submit} loading={loading}>{loading ? 'Saving...' : 'Reset password'}</PrimaryButton>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.gray[50] },
  scroll: { flexGrow: 1, padding: spacing.xl },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: spacing.sm, marginBottom: spacing.lg },
  backText: { fontSize: fontSize.base, fontWeight: '600', color: c.gray[700] },
  form: { backgroundColor: c.white, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: c.gray[200] },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: c.gray[900], textAlign: 'center' },
  sub: { fontSize: fontSize.sm, color: c.gray[500], textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 19 },
});
