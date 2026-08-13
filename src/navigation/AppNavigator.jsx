import { useState, useMemo, useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import AnimatedPressable from '../components/AnimatedPressable';
import { MoreMenu } from '../components/UI';
import { addNotificationResponseListener } from '../services/notifications';

import LoginScreen from '../screens/Login';
import SignupScreen from '../screens/Signup';
import DashboardScreen from '../screens/Dashboard';
import AdminDashboardScreen from '../screens/AdminDashboard';
import TasksScreen from '../screens/Tasks';
import NotificationsScreen from '../screens/Notifications';
import AdminBusinessesScreen from '../screens/AdminBusinesses';
import AdminUsersScreen from '../screens/AdminUsers';
import SuperAdminUsersScreen from '../screens/SuperAdminUsers';
import ProfileScreen from '../screens/Profile';
import ChatListScreen from '../screens/ChatListScreen';
import ChatThreadScreen from '../screens/ChatThreadScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import LegalScreen from '../screens/Legal';
import OopsScreen from '../screens/Oops';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ICON_SPRING = { damping: 14, stiffness: 300, mass: 0.5, overshootClamping: false };

/**
 * Animated tab bar icon — scales up with a spring when focused.
 */
function AnimatedTabIcon({ name, focused, color, size = 22, badge }) {
  const scale = useSharedValue(focused ? 1.15 : 1);
  const badgeScale = useSharedValue(badge ? 1 : 0);
  const prevBadgeRef = useRef(badge);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, ICON_SPRING);
    if (focused) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [focused, scale]);

  // Badge pop animation when count changes
  useEffect(() => {
    if (badge && prevBadgeRef.current !== badge) {
      badgeScale.value = withSequence(
        withTiming(1.3, { duration: 120 }),
        withSpring(1, { damping: 12, stiffness: 300, mass: 0.5 }),
      );
    } else if (badge) {
      badgeScale.value = withSpring(1, { damping: 14, stiffness: 300, mass: 0.5 });
    } else {
      badgeScale.value = withSpring(0, { damping: 16, stiffness: 300, mass: 0.5 });
    }
    prevBadgeRef.current = badge;
  }, [badge, badgeScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeScale.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={name} size={size} color={color} />
      {badge > 0 && (
        <Animated.View style={[tabStyles.badge, badgeStyle]} pointerEvents="none">
          <Text style={tabStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function MoreTabButton({ onPress, accessibilityState }) {
  const colors = useColors();
  const { t } = useLang();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focused = accessibilityState?.selected;
  return (
    <AnimatedPressable onPress={onPress} style={styles.tabBtn} haptic="light">
      <Ionicons name="ellipsis-horizontal-outline" size={22} color={focused ? colors.brand[600] : colors.gray[400]} />
      <Text style={[styles.tabLabel, { color: focused ? colors.brand[600] : colors.gray[400] }]}>{t('more')}</Text>
    </AnimatedPressable>
  );
}

function MainTabs() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const colors = useColors();
  const { totalUnread: chatUnread } = useChat();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [moreVisible, setMoreVisible] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  const moreItems = [
    { label: t('notifications'), icon: 'notifications-outline', route: 'Notifications' },
    { label: t('chat'), icon: 'chatbubble-outline', route: 'ChatList' },
    { label: t('profile'), icon: 'person-outline', route: 'Profile' },
    ...(isSuperAdmin
      ? [{ label: t('userPasswords'), icon: 'key-outline', route: 'UserPasswords' }]
      : []),
    { label: t('logout'), icon: 'log-out-outline', color: colors.red[600], action: 'logout' },
  ];

  const handleMoreItem = (item) => {
    if (item.action === 'logout') {
      logout();
    } else {
      navigation.navigate(item.route);
    }
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand[600],
          tabBarInactiveTintColor: colors.gray[400],
          tabBarStyle: {
            paddingBottom: insets.bottom + 4,
            paddingTop: 4,
            height: 56 + insets.bottom,
            backgroundColor: colors.white,
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 8,
          },
          tabBarLabelStyle: {
            fontSize: 10,
          },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={isAdmin ? AdminDashboardScreen : DashboardScreen}
          options={{
            tabBarLabel: isAdmin ? t('home') : t('dashboard'),
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon name={focused ? 'home' : 'home-outline'} focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Tasks"
          component={TasksScreen}
          options={{
            tabBarLabel: t('tasks'),
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon name={focused ? 'clipboard' : 'clipboard-outline'} focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ChatList"
          component={ChatListScreen}
          options={{
            tabBarLabel: t('chat'),
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon name={focused ? 'chatbubble' : 'chatbubble-outline'} focused={focused} color={color} badge={chatUnread} />
            ),
          }}
        />
        {isAdmin && (
          <>
            <Tab.Screen
              name="Businesses"
              component={AdminBusinessesScreen}
              options={{
                tabBarLabel: t('businesses'),
                tabBarIcon: ({ focused, color }) => (
                  <AnimatedTabIcon name={focused ? 'business' : 'business-outline'} focused={focused} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="Users"
              component={AdminUsersScreen}
              options={{
                tabBarLabel: t('users'),
                tabBarIcon: ({ focused, color }) => (
                  <AnimatedTabIcon name={focused ? 'people' : 'people-outline'} focused={focused} color={color} />
                ),
              }}
            />
          </>
        )}
        <Tab.Screen
          name="More"
          component={MorePlaceholder}
          options={{
            tabBarButton: (props) => (
              <MoreTabButton {...props} onPress={() => setMoreVisible(true)} />
            ),
          }}
        />
      </Tab.Navigator>
      <MoreMenu visible={moreVisible} onClose={() => setMoreVisible(false)} title={t('more')} items={moreItems} onItemPress={handleMoreItem} />
    </>
  );
}

function MorePlaceholder() {
  return null;
}

// Custom transition: soft slide + fade (spring-based on iOS, timing on Android)
const screenTransition = Platform.select({
  ios: {
    gestureEnabled: true,
    gestureResponseDistance: { horizontal: 50 },
    transitionSpec: {
      open: { animation: 'spring', config: { stiffness: 1000, damping: 500, mass: 3 } },
      close: { animation: 'spring', config: { stiffness: 1000, damping: 500, mass: 3 } },
    },
    cardStyleInterpolator: ({ current, next, layouts }) => {
      const translateX = current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [layouts.screen.width * 0.3, 0],
      });
      const opacity = current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      });
      const nextScale = next?.progress?.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.92],
      });
      return {
        cardStyle: { opacity, transform: [{ translateX }] },
        nextCardStyle: { transform: [{ scale: nextScale }] },
      };
    },
  },
  android: {
    animation: 'fade',
    config: { duration: 250 },
  },
  default: {
    animation: 'fade',
    config: { duration: 250 },
  },
});

const createStyles = (colors) => StyleSheet.create({
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});

const tabStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
});

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const colors = useColors();
  const notificationListenerRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    notificationListenerRef.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (!data) return;

      if (data.type === 'chat' && data.conversationId) {
        navigationRef.current?.navigate('ChatThread', { conversationId: data.conversationId });
      } else if (data.type === 'overdue' || data.type === 'task_added' || data.type === 'task_completed' || data.type === 'warning' || data.type === 'assignment') {
        navigationRef.current?.navigate('Main', { screen: 'Notifications' });
      }
    });

    return () => {
      if (notificationListenerRef.current) {
        notificationListenerRef.current.remove();
        notificationListenerRef.current = null;
      }
    };
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.gray[50] }}>
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          ...screenTransition,
        }}
      >
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
        <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
        <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
        <Stack.Screen name="UserPasswords" component={SuperAdminUsersScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Legal" component={LegalScreen} />
        <Stack.Screen name="Oops" component={OopsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
