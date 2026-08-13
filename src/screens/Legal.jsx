import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';

const SUPPORT_EMAIL = 'support@vgrand.com';
const LAST_UPDATED = 'August 13, 2026';

const PRIVACY_SECTIONS = [
  {
    heading: 'Information We Collect',
    body: 'TaskHub collects the following information to provide and improve the service:\n\n• Account information: your name, username, email address, and password (stored as a secure hash).\n• Profile and role data: your assigned role (user, admin, or super admin), business assignments, and account status.\n• Task and work data: tasks you create or are assigned, task status, due dates, descriptions, and attachments.\n• Communications: chat messages, voice messages, image and document attachments, reactions, and conversation metadata between users within your organization.\n• Media: uploaded images, voice recordings, and documents are stored securely with our cloud media provider (Cloudinary) and linked to your account.\n• Notifications: push notification tokens delivered through Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM) so we can send you task, chat, and warning alerts.\n• Usage data: device identifiers and limited app usage information used for security, troubleshooting, and abuse prevention.',
  },
  {
    heading: 'How We Use Your Information',
    body: 'We use your information to:\n\n• Operate, maintain, and improve TaskHub features.\n• Authenticate your identity and manage your account.\n• Assign and track tasks, send warnings, and monitor completion across businesses.\n• Deliver chat messaging between authorized users.\n• Send push notifications about tasks, messages, and account activity.\n• Detect, prevent, and address fraud, abuse, and security issues.\n• Comply with legal obligations.',
  },
  {
    heading: 'How We Share Your Information',
    body: 'TaskHub is a business task-management tool. Your account, task, and chat data is visible to the administrators and super administrators within your organization, as needed to manage work. We do not sell your personal information. We share data only:\n\n• With authorized administrators in your organization as part of normal app functionality.\n• With service providers (such as hosting providers, push notification services, and Cloudinary for media storage) who process data on our behalf under appropriate agreements.\n• When required by law or to protect the rights, property, or safety of TaskHub, our users, or others.',
  },
  {
    heading: 'Data Retention',
    body: 'We retain your information for as long as your account is active. Chat messages can be deleted by the sender (within 15 minutes of sending) or by an admin at any time. When a message is deleted for everyone, its content and attachments are permanently removed. When you delete your account from within the app, your account and associated personal data (including tasks, messages, and attachments you authored) are permanently removed from our systems, except where retention is required for legal, accounting, or security purposes.',
  },
  {
    heading: 'Your Rights',
    body: 'You have the right to:\n\n• Access and review the personal information we hold about you through your Profile.\n• Update your name and password at any time.\n• Permanently delete your account and associated data from the Profile screen.\n• Disable push notifications at any time through your device settings. Disabling notifications does not affect your ability to use TaskHub.',
  },
  {
    heading: 'Data Security',
    body: 'We use industry-standard measures to protect your information, including hashed passwords, encrypted transport (HTTPS), and access controls. No method of transmission or storage is fully secure, but we work to protect your data using reasonable technical and organizational safeguards.',
  },
  {
    heading: 'Children\u2019s Privacy',
    body: 'TaskHub is a business productivity tool and is not intended for children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us so we can delete it.',
  },
  {
    heading: 'Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. When we do, we will revise the "Last updated" date at the top of this page. We encourage you to review this policy periodically.',
  },
  {
    heading: 'Contact Us',
    body: `If you have questions about this Privacy Policy, contact us at ${SUPPORT_EMAIL}.`,
  },
];

const TERMS_SECTIONS = [
  {
    heading: 'Acceptance of Terms',
    body: 'By creating an account and using TaskHub, you agree to these Terms of Service. If you do not agree, do not use the app.',
  },
  {
    heading: 'Eligibility',
    body: 'TaskHub is intended for use by authorized members of organizations that have been provisioned with access. You are responsible for providing accurate account information and for keeping your password confidential.',
  },
  {
    heading: 'Your Account',
    body: 'You are responsible for all activity that occurs under your account. You can change your password at any time from your Profile, and you can permanently delete your account at any time from your Profile. If you believe your account has been compromised, contact us immediately.',
  },
  {
    heading: 'Acceptable Use',
    body: 'You agree not to:\n\n• Use TaskHub for any unlawful purpose.\n• Upload content that is abusive, threatening, defamatory, or infringes someone else\u2019s rights.\n• Attempt to access data or accounts you are not authorized to access.\n• Interfere with the service\u2019s security or operation.\n• Use the service to send spam or unauthorized communications.\n\nAdministrators have the authority to delete any message in conversations they are part of, to maintain a respectful and appropriate communication environment.',
  },
  {
    heading: 'Your Content',
    body: 'You retain ownership of the tasks, messages, and attachments you submit. By using TaskHub, you grant your organization\u2019s administrators the ability to view and manage that content as part of normal app functionality.',
  },
  {
    heading: 'Service Availability',
    body: 'We strive to keep TaskHub available but do not guarantee uninterrupted access. We may modify, suspend, or discontinue features at any time without notice. Push notifications depend on third-party services (such as APNs and FCM) and may occasionally be delayed or unavailable.',
  },
  {
    heading: 'Limitation of Liability',
    body: 'TaskHub is provided "as is" and "as available." To the extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of, or inability to use, the service.',
  },
  {
    heading: 'Termination',
    body: 'You may stop using TaskHub and delete your account at any time from your Profile. We may suspend or terminate access for violations of these terms or for abuse of the service.',
  },
  {
    heading: 'Changes to These Terms',
    body: 'We may update these Terms from time to time. When we do, we will revise the "Last updated" date. Continued use of TaskHub after changes constitutes acceptance of the updated terms.',
  },
  {
    heading: 'Contact Us',
    body: `If you have questions about these Terms, contact us at ${SUPPORT_EMAIL}.`,
  },
];

export default function LegalScreen() {
  const colors = useColors();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const doc = route.params?.doc === 'terms' ? 'terms' : 'privacy';
  const isPrivacy = doc === 'privacy';
  const title = isPrivacy ? t('privacyPolicy') : t('termsOfService');
  const intro = isPrivacy ? t('privacyIntro') : t('termsIntro');
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  const openEmail = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel={t('cancel')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          haptic="light"
        >
          <Ionicons name="arrow-back" size={24} color={colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{intro}</Text>
        <Text style={styles.updated}>{t('lastUpdated')}: {LAST_UPDATED}</Text>

        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <AnimatedPressable onPress={openEmail} style={styles.contactBtn} activeOpacity={0.7} haptic="light">
          <Ionicons name="mail-outline" size={18} color={colors.brand[600]} />
          <Text style={styles.contactText}>{t('contactUs')}: {SUPPORT_EMAIL}</Text>
        </AnimatedPressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  intro: {
    fontSize: fontSize.base,
    color: colors.gray[700],
    lineHeight: 22,
  },
  updated: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  sectionHeading: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.sm,
  },
  sectionBody: {
    fontSize: fontSize.base,
    color: colors.gray[700],
    lineHeight: 22,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.brand[50],
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  contactText: {
    fontSize: fontSize.base,
    color: colors.brand[600],
    fontWeight: '600',
  },
});
