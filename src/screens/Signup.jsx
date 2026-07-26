import { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useTheme, useColors } from '../context/ThemeContext';
import api from '../api/client';
import { Input } from '../components/Input';
import { PrimaryButton } from '../components/Button';
import { ErrorBanner } from '../components/UI';
import { spacing, radius, fontSize } from '../theme/theme';

export default function Signup() {
  const { login } = useAuth();
  const { t, toggleLang, lang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || !username || !password || !confirmPassword) {
      setError(t('allFieldsRequired'));
      return;
    }
    if (password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError(t('passwordUppercaseError'));
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError(t('passwordLowercaseError'));
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError(t('passwordNumberError'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/signup', { name, username, password });
      const loginRes = await api.post('/auth/login', { username, password });
      await login(loginRes.data.token, loginRes.data.user);
    } catch (err) {
      setError(err.response?.data?.error || t('signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.toggles, { paddingTop: insets.top + spacing.md }]}>
          <TouchableOpacity onPress={toggleTheme} style={styles.toggleBtn}>
            <Ionicons
              name={theme === 'dark' ? 'sunny' : 'moon'}
              size={20}
              color={colors.gray[500]}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleLang} style={styles.toggleBtn}>
            <Text style={styles.toggleText}>{lang === 'en' ? 'తె' : 'EN'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.logo}>
          <Ionicons name="checkmark-done-circle" size={48} color={colors.brand[600]} />
          <Text style={styles.appName}>{t('appName')}</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.title}>{t('createAccount')}</Text>
          {error && <ErrorBanner message={error} />}
          <Input
            label={t('fullName')}
            value={name}
            onChangeText={setName}
            placeholder={t('namePlaceholder')}
          />
          <Input
            label={t('username')}
            value={username}
            onChangeText={setUsername}
            placeholder={t('usernamePlaceholder')}
            autoCapitalize="none"
          />
          <Input
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('passwordMinLengthPlaceholder')}
            secureTextEntry
          />
          <Input
            label={t('confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('passwordPlaceholder')}
            secureTextEntry
            onFocus={scrollToBottom}
          />
          <PrimaryButton onPress={handleSubmit} loading={loading}>
            {loading ? t('creatingAccount') : t('createAccount')}
          </PrimaryButton>
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>{t('alreadyHaveAccount')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.signupLink}>{t('signIn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  toggles: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray[600],
  },
  logo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  appName: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.brand[600],
    marginTop: spacing.xs,
  },
  form: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  signupText: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
  },
  signupLink: {
    fontSize: fontSize.sm,
    color: colors.brand[600],
    fontWeight: '600',
  },
});
