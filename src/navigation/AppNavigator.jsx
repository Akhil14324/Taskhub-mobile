import { useState, useMemo, useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import { syncNavigationBack } from '../utils/backStack';
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
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import AnimatedPressable from '../components/AnimatedPressable';
import AppSidebar from '../components/AppSidebar';
import GlobalHost from '../components/GlobalHost';
import '../utils/shareTarget';
import useIsDesktop from '../hooks/useBreakpoint';
import { MoreMenu } from '../components/UI';
import { addNotificationResponseListener } from '../services/notifications';
import { openNotificationTarget } from './navigationRef';
import { todayYmd } from '../utils/dates';
import { glass } from '../theme/glass';
import { SPRING } from '../theme/motion';
import { withScreenTransition as T } from '../components/Reveal';
import { SlideGroup, SlideItem } from '../components/SlideGroup';

import LoginScreen from '../screens/Login';
import SignupScreen from '../screens/Signup';
import ForgotPasswordScreen from '../screens/ForgotPassword';
import HomeScreen from '../screens/HomeScreen';
import ProgressScreen from '../screens/ProgressScreen';
import RecapScreen from '../screens/RecapScreen';
import TodosScreen from '../screens/TodosScreen';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import OrganizationScreen from '../screens/OrganizationScreen';
import TeamMonitorScreen from '../screens/TeamMonitorScreen';
import PersonMonitorScreen from '../screens/PersonMonitorScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import NotificationsScreen from '../screens/Notifications';
import ProfileScreen from '../screens/Profile';
import ChatListScreen from '../screens/ChatListScreen';
import ChatThreadScreen from '../screens/ChatThreadScreen';
import ChatWorkspace from '../screens/ChatWorkspace';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import LegalScreen from '../screens/Legal';
import OopsScreen from '../screens/Oops';

/**
 * On a wide window pages that were designed as a single column (profile, chat thread, approvals, ...)
 * sit in a centred column instead of stretching across the screen. Phones are untouched.
 */
function framed(Component, maxWidth = 920) {
  function Framed(props) {
    const desktop = useIsDesktop();
    if (!desktop) return <Component {...props} />;
    return (
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth }}>
          <Component {...props} />
        </View>
      </View>
    );
  }
  Framed.displayName = `Framed(${Component.displayName || Component.name || 'Screen'})`;
  return Framed;
}

const FramedLogin = framed(LoginScreen, 480);
const FramedSignup = framed(SignupScreen, 480);
const FramedForgotPassword = framed(ForgotPasswordScreen, 480);
const FramedChangePassword = framed(ChangePasswordScreen, 480);
// Pages that have to fill a desktop window (like Home and To-do do) get a wide frame; only forms stay narrow.
const WIDE = 1560;
// Desktop shows list and conversation side by side; phones keep two screens.
function ChatThreadEntry(props) { return useIsDesktop() ? <ChatWorkspace /> : <ChatThreadScreen {...props} />; }
function ChatListEntry(props) { return useIsDesktop() ? <ChatWorkspace /> : <ChatListScreen {...props} />; }
const FramedChatThread = ChatThreadEntry;
const FramedChatList = ChatListEntry;
const FramedGroupInfo = framed(GroupInfoScreen, 1000);
const FramedApprovals = framed(ApprovalsScreen, 1100);
const FramedOrganization = framed(OrganizationScreen, WIDE);
const FramedTeamMonitor = framed(TeamMonitorScreen, WIDE);
const FramedPersonMonitor = framed(PersonMonitorScreen, WIDE);
const FramedNotifications = framed(NotificationsScreen, 1100);
const FramedProfile = framed(ProfileScreen, 1000);
const FramedProgress = framed(ProgressScreen, WIDE);
const FramedRecap = framed(RecapScreen, 920);

// The native stack does no transition in a browser, so every screen animates itself when it gains focus.
const TabHome = T(HomeScreen, 'tab', 'Dashboard');
const TabTodos = T(TodosScreen, 'tab', 'Todos');
const TabChat = T(FramedChatList, 'tab', 'ChatList');
const PushChatThread = T(FramedChatThread);
const PushGroupInfo = T(FramedGroupInfo);
const PushApprovals = T(FramedApprovals);
const PushOrganization = T(FramedOrganization);
const PushTeamMonitor = T(FramedTeamMonitor);
const PushPersonMonitor = T(FramedPersonMonitor);
const PushNotifications = T(FramedNotifications);
const PushProfile = T(FramedProfile);
const PushProgress = T(FramedProgress);
const PushRecap = T(FramedRecap);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Tab bar icon. A glass pill blooms behind the focused icon and the icon pops with a spring;
 * the badge springs in and bounces when its count changes.
 */
function AnimatedTabIcon({ name, focused, color, size = 22, badge }) {
  const pill = useSharedValue(focused ? 1 : 0);
  const badgeScale = useSharedValue(badge ? 1 : 0);
  const prevBadgeRef = useRef(badge);

  useEffect(() => {
    pill.value = withSpring(focused ? 1 : 0, SPRING.pop);
  }, [focused, pill]);

  // Badge pop animation when count changes
  useEffect(() => {
    if (badge && prevBadgeRef.current !== badge) {
      badgeScale.value = 0.6;
      badgeScale.value = withSpring(1, SPRING.pop);
    } else if (badge) {
      badgeScale.value = withSpring(1, SPRING.pop);
    } else {
      badgeScale.value = withTiming(0, { duration: 120 });
    }
    prevBadgeRef.current = badge;
  }, [badge, badgeScale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pill.value * 0.08 }, { translateY: -pill.value * 0.5 }] }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: Math.min(1, badgeScale.value * 1.5),
  }));

  return (
    <View style={tabStyles.iconWrap}>
      <Animated.View style={iconStyle}>
        <Ionicons name={name} size={size} color={color} />
        {badge > 0 && (
          <Animated.View style={[tabStyles.badge, badgeStyle]} pointerEvents="none">
            <Text style={tabStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * The floating tab island. One light-red highlight sits behind the current tab and slides (stretching toward
 * the new one) when you change module; each tab squishes like water under the finger.
 */
function GlassTabBar({ state, descriptors, navigation, onMore }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  return (
    <View
      {...glass('capsule')}
      style={{ height: 66, marginHorizontal: 14, marginBottom: Math.max(insets.bottom, 10), borderRadius: 33, backgroundColor: colors.white }}
    >
      <SlideGroup style={{ flex: 1, flexDirection: 'row', padding: 5, alignItems: 'stretch' }} pillStyle={{ borderRadius: 28 }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isMore = route.name === 'More';
          const focused = !isMore && state.index === index;
          const color = focused ? colors.brand[700] : colors.gray[500];
          const label = isMore ? t('more') : (typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name);
          const onPress = () => {
            if (isMore) { onMore(); return; }
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <SlideItem key={route.key} active={focused} style={{ flex: 1 }}>
              <AnimatedPressable onPress={onPress} haptic="light" water accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 28, paddingVertical: 4 }}>
                {isMore
                  ? <Ionicons name="ellipsis-horizontal-outline" size={22} color={color} />
                  : options.tabBarIcon?.({ focused, color, size: 22 })}
                <Text style={{ fontSize: 10, fontWeight: focused ? '700' : '600', letterSpacing: 0.15, marginTop: 2, color }}>{label}</Text>
              </AnimatedPressable>
            </SlideItem>
          );
        })}
      </SlideGroup>
    </View>
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
  const { todos } = useTodos();
  const { unreadCount, approvalCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const [moreVisible, setMoreVisible] = useState(false);

  const today = todayYmd();
  const todoBadge = todos.filter((td) => !td.is_done && td.due_date && td.due_date <= today && (!td.business_id || td.assignee_id === user?.id)).length;

  const moreItems = [
    { label: 'Progress', icon: 'sunny-outline', route: 'Progress' },
    { label: `${t('notifications')}${unreadCount ? ` · ${unreadCount}` : ''}`, icon: 'notifications-outline', route: 'Notifications' },
    { label: `Approvals${approvalCount ? ` · ${approvalCount}` : ''}`, icon: 'shield-checkmark-outline', route: 'Approvals' },
    ...(user?.can_monitor ? [{ label: 'Team monitor', icon: 'speedometer-outline', route: 'TeamMonitor' }] : []),
    { label: user?.is_portal ? 'Organisation & people' : 'Organisation', icon: 'git-network-outline', route: 'Organization' },
    { label: t('profile'), icon: 'person-outline', route: 'Profile' },
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
        initialRouteName={{ todos: 'Todos', chat: 'ChatList' }[user?.preferences?.startPage] || 'Dashboard'}
        tabBar={desktop ? () => null : (props) => <GlassTabBar {...props} onMore={() => setMoreVisible(true)} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand[600],
          tabBarInactiveTintColor: colors.gray[400],
          // A floating glass island instead of an edge-to-edge bar: translucent, blurred, specular rim.
          tabBarStyle: {
            height: 64,
            marginHorizontal: 14,
            marginBottom: Math.max(insets.bottom, 10),
            paddingTop: 7,
            paddingBottom: 7,
            borderRadius: 32,
            backgroundColor: 'transparent',
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
          },
          tabBarBackground: () => <View {...glass('capsule')} style={[StyleSheet.absoluteFill, { borderRadius: 32, backgroundColor: colors.white }]} />,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            letterSpacing: 0.15,
          },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={TabHome}
          options={{
            tabBarLabel: t('home'),
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon name={focused ? 'home' : 'home-outline'} focused={focused} color={color} badge={unreadCount} />
            ),
          }}
        />
        <Tab.Screen
          name="Todos"
          component={TabTodos}
          options={{
            tabBarLabel: 'To-do',
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon name={focused ? 'checkbox' : 'checkbox-outline'} focused={focused} color={color} badge={todoBadge + approvalCount} />
            ),
          }}
        />
        <Tab.Screen
          name="ChatList"
          component={TabChat}
          options={{
            tabBarLabel: t('chat'),
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon name={focused ? 'chatbubble' : 'chatbubble-outline'} focused={focused} color={color} badge={chatUnread} />
            ),
          }}
        />
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
  iconWrap: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', width: 52, height: 30, borderRadius: 15 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#dc2626',
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
  const desktop = useIsDesktop();
  const notificationListenerRef = useRef(null);
  const [routeName, setRouteName] = useState(null);

  // The default navigation theme paints a pale grey behind screens that do not fill the window.
  const navTheme = useMemo(() => ({
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent', border: 'transparent', text: colors.gray[900], primary: colors.brand[600] },
  }), [colors]);

  useEffect(() => {
    if (!user) return;

    notificationListenerRef.current = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) openNotificationTarget(data);
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </View>
    );
  }

  const showShell = desktop && !!user && !user.must_change_password;
  const syncRoute = () => {
    setRouteName(navigationRef.getCurrentRoute()?.name || null);
    syncNavigationBack();
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.page }}>
      {showShell && <AppSidebar routeName={routeName} />}
      <View style={{ flex: 1, minWidth: 0 }}>
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={syncRoute} onStateChange={syncRoute}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          ...screenTransition,
        }}
      >
        {!user ? (
          <>
            <Stack.Screen name="Login" component={FramedLogin} />
            <Stack.Screen name="Signup" component={FramedSignup} />
            <Stack.Screen name="ForgotPassword" component={FramedForgotPassword} />
          </>
        ) : user.must_change_password ? (
          <Stack.Screen name="ChangePassword" component={FramedChangePassword} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="ChatThread" component={PushChatThread} />
            <Stack.Screen name="GroupInfo" component={PushGroupInfo} />
            <Stack.Screen name="Approvals" component={PushApprovals} />
            <Stack.Screen name="Organization" component={PushOrganization} />
            <Stack.Screen name="TeamMonitor" component={PushTeamMonitor} />
            <Stack.Screen name="PersonMonitor" component={PushPersonMonitor} />
            <Stack.Screen name="Notifications" component={PushNotifications} />
            <Stack.Screen name="Profile" component={PushProfile} />
            <Stack.Screen name="Progress" component={PushProgress} />
            <Stack.Screen name="Recap" component={PushRecap} />
          </>
        )}
        <Stack.Screen name="Legal" component={LegalScreen} />
        <Stack.Screen name="Oops" component={OopsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
      </View>
      {!!user && !user.must_change_password ? <GlobalHost /> : null}
    </View>
  );
}
