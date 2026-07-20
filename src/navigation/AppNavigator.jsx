import { useState, useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import { MoreMenu } from '../components/UI';

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MoreTabButton({ onPress, accessibilityState }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focused = accessibilityState?.selected;
  return (
    <TouchableOpacity onPress={onPress} style={styles.tabBtn} activeOpacity={0.7}>
      <Ionicons name="ellipsis-horizontal-outline" size={22} color={focused ? colors.brand[600] : colors.gray[400]} />
      <Text style={[styles.tabLabel, { color: focused ? colors.brand[600] : colors.gray[400] }]}>More</Text>
    </TouchableOpacity>
  );
}

function MainTabs() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const colors = useColors();
  const navigation = useNavigation();
  const [moreVisible, setMoreVisible] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  const moreItems = [
    { label: t('notifications'), icon: 'notifications-outline', route: 'Notifications' },
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
            paddingBottom: 4,
            paddingTop: 4,
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

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
