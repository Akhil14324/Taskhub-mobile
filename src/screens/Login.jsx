import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useTheme, useColors } from '../context/ThemeContext';
import api from '../api/client';
import { Input } from '../components/Input';
import { PrimaryButton } from '../components/Button';
import { ErrorBanner } from '../components/UI';
import { spacing, radius, fontSize } from '../theme/theme';

export default function Login() {
  const { login } = useAuth();
  const { t, toggleLang, lang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError(t('enterEmailPassword'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      await login(res.data.token, res.data.user);
    } catch (err) {
      console.error('Login error:', err.message, err.response?.data, err.code);
      setError(err.response?.data?.error || err.message || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.toggles}>
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
            <Ionicons name="checkmark-done-circle" size={56} color={colors.brand[600]} />
            <Text style={styles.appName}>{t('appName')}</Text>
            <Text style={styles.tagline}>{t('tagline')}</Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{t('signIn')}</Text>
          {error && <ErrorBanner message={error} />}
          <Input
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <PrimaryButton onPress={handleSubmit} loading={loading}>
            {loading ? t('signingIn') : t('signIn')}
          </PrimaryButton>
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>{t('dontHaveAccount')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>{t('signUp')}</Text>
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
  header: {
    marginBottom: spacing.xxxl,
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
    marginTop: spacing.lg,
  },
  appName: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.brand[600],
    marginTop: spacing.sm,
  },
  tagline: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
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
