import { Component } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLang } from '../context/LanguageContext';
import AnimatedPressable from './AnimatedPressable';

function withTranslations(WrappedComponent) {
  return function TranslatedErrorBoundary(props) {
    const { t } = useLang();
    return <WrappedComponent {...props} t={t} />;
  };
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    // Most render errors are one-off (stale data mid-update, a screen unmounting), so
    // recover on our own instead of making the user tap. Gives up after a few quick
    // repeats so a genuine crash loop still shows the fallback.
    const now = Date.now();
    this.recent = (this.recent || []).filter((t) => now - t < 10000);
    this.recent.push(now);
    if (this.recent.length <= 3) {
      this.resetTimer = setTimeout(this.handleReset, 250);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.resetTimer);
  }

  handleReset = () => {
    clearTimeout(this.resetTimer);
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{this.props.t('somethingWentWrong')}</Text>
          <Text style={styles.message}>
            {this.state.error?.message || this.props.t('unexpectedError')}
          </Text>
          <AnimatedPressable style={styles.button} onPress={this.handleReset} haptic="light">
            <Text style={styles.buttonText}>{this.props.t('tryAgain')}</Text>
          </AnimatedPressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default withTranslations(ErrorBoundary);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#dc2626',
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
