import { useState, useMemo, useEffect, useRef } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MoreTabButton({ onPress, accessibilityState }) {
  const colors = useColors();
  const { t } = useLang();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focused = accessibilityState?.selected;
  return (
    <TouchableOpacity onPress={onPress} style={styles.tabBtn} activeOpacity={0.7}>
      <Ionicons name="ellipsis-horizontal-outline" size={22} color={focused ? colors.brand[600] : colors.gray[400]} />
      <Text style={[styles.tabLabel, { color: focused ? colors.brand[600] : colors.gray[400] }]}>{t('more')}</Text>
    </TouchableOpacity>
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
            borderTopColor: colors.gray[200],
            borderTopWidth: 1,
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
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Tasks"
          component={TasksScreen}
          options={{
            tabBarLabel: t('tasks'),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ChatList"
          component={ChatListScreen}
          options={{
            tabBarLabel: t('chat'),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={color} />
            ),
            tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined,
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
                  <Ionicons name={focused ? 'business' : 'business-outline'} size={22} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="Users"
              component={AdminUsersScreen}
              options={{
                tabBarLabel: t('users'),
                tabBarIcon: ({ focused, color }) => (
                  <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
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

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const colors = useColors();
  const navigationRef = useNavigationContainerRef();
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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
        <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
        <Stack.Screen name="UserPasswords" component={SuperAdminUsersScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
