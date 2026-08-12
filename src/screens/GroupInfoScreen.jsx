import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useChat } from '../context/ChatContext';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { Screen } from '../components/UI';
import SmartImage from '../components/SmartImage';
import AnimatedPressable from '../components/AnimatedPressable';
import api from '../api/client';

export default function GroupInfoScreen() {
  const { conversations, muteConversation, fetchConversations } = useChat();
  const { user } = useAuth();
  const colors = useColors();
  const { t, getDynamic } = useLang();
  const navigation = useNavigation();
  const route = useRoute();
  const { conversationId } = route.params;

  const [muted, setMuted] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const conversation = conversations.find((c) => c.id === conversationId);

  useEffect(() => {
    if (!conversation) navigation.goBack();
  }, [conversation]);

  useEffect(() => {
    if (conversation) setMuted(!!conversation.is_muted);
  }, [conversation?.is_muted]);

  if (!conversation) return null;

  const handleMute = async () => {
    const newMuted = !muted;
    setMuted(newMuted);
    try {
      await muteConversation(conversationId, newMuted);
    } catch {
      setMuted(!newMuted);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      t('leaveGroup'),
      t('leaveGroupConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('leaveGroup'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/chat/conversations/${conversationId}/leave`);
              await fetchConversations();
              navigation.goBack();
            } catch {
              Alert.alert(t('somethingWentWrong'));
            }
          },
        },
      ]
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable haptic="light" onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>{t('groupInfo')}</Text>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.groupIconContainer}>
          <View style={styles.groupIcon}>
            <Ionicons name="people" size={48} color={colors.white} />
          </View>
          <Text style={styles.groupName}>{getDynamic(conversation.name)}</Text>
          <Text style={styles.memberCount}>
            {conversation.participants?.length || 0} {t('members')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('participants')}</Text>
          {conversation.participants?.map((p) => (
            <View key={p.id} style={styles.participantRow}>
              {p.profile_picture ? (
                <SmartImage source={p.profile_picture} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {(p.name || '?')[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.participantInfo}>
                <View style={styles.participantNameRow}>
                  <Text style={styles.participantName}>
                    {String(p.id) === String(user?.id) ? `${getDynamic(p.name)} (${t('you')})` : getDynamic(p.name)}
                  </Text>
                  {p.is_admin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>{t('admin')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.participantRole}>{p.role}</Text>
              </View>
            </View>
          ))}
        </View>

        <AnimatedPressable haptic="light" style={styles.muteRow} onPress={handleMute}>
          <Ionicons name={muted ? 'notifications-off' : 'notifications'} size={22} color={colors.gray[600]} />
          <Text style={styles.muteText}>{muted ? t('unmute') : t('mute')}</Text>
        </AnimatedPressable>

        <AnimatedPressable haptic="medium" style={styles.leaveRow} onPress={handleLeaveGroup}>
          <Ionicons name="log-out-outline" size={22} color={colors.red[500]} />
          <Text style={styles.leaveText}>{t('leaveGroup')}</Text>
        </AnimatedPressable>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.gray[900], marginLeft: spacing.sm },
  scroll: { flex: 1 },
  groupIconContainer: { alignItems: 'center', paddingVertical: spacing.xl },
  groupIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.brand[600],
    alignItems: 'center', justifyContent: 'center',
  },
  groupName: { fontSize: fontSize.xl, fontWeight: '600', color: colors.gray[900], marginTop: spacing.md },
  memberCount: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: spacing.xs },
  section: {
    backgroundColor: colors.white,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray[500],
    marginBottom: spacing.md,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand[200],
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.brand[700] },
  participantInfo: { marginLeft: spacing.md, flex: 1 },
  participantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  participantName: { fontSize: fontSize.base, color: colors.gray[900] },
  participantRole: { fontSize: fontSize.xs, color: colors.gray[500] },
  adminBadge: {
    backgroundColor: colors.brand[100],
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  adminBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.brand[700],
  },
  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  muteText: { fontSize: fontSize.base, color: colors.gray[900] },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  leaveText: { fontSize: fontSize.base, color: colors.red[500] },
});
