import { NavigationContainer } from '@react-navigation/native';
import { createNativeStack } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { colors } from '../theme/theme';

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

const Stack = createNativeStack();
const Tab = createBottomTabNavigator();

function getTabRoutes(role, t) {
  const isAdmin = ['admin', 'super_admin'].includes(role);
  const routes = [
    {
      name: 'Dashboard',
      component: isAdmin ? AdminDashboardScreen : DashboardScreen,
      label: isAdmin ? t('adminDashboard') : t('dashboard'),
      icon: isAdmin ? 'grid-outline' : 'home-outline',
      activeIcon: isAdmin ? 'grid' : 'home',
    },
    {
      name: 'Tasks',
      component: TasksScreen,
      label: t('tasks'),
      icon: 'clipboard-outline',
      activeIcon: 'clipboard',
    },
    {
      name: 'Notifications',
      component: NotificationsScreen,
      label: t('notifications'),
      icon: 'notifications-outline',
      activeIcon: 'notifications',
    },
    {
      name: 'Profile',
      component: ProfileScreen,
      label: t('profile'),
      icon: 'person-outline',
      activeIcon: 'person',
    },
  ];

  if (isAdmin) {
    routes.splice(2, 0, {
      name: 'Businesses',
      component: AdminBusinessesScreen,
      label: t('businesses'),
      icon: 'business-outline',
      activeIcon: 'business',
    });
    routes.splice(3, 0, {
      name: 'Users',
      component: AdminUsersScreen,
      label: t('users'),
      icon: 'people-outline',
      activeIcon: 'people',
    });
    if (role === 'super_admin') {
      routes.splice(4, 0, {
        name: 'UserPasswords',
        component: SuperAdminUsersScreen,
        label: t('userPasswords'),
        icon: 'key-outline',
        activeIcon: 'key',
      });
    }
  }

  return routes;
}

function MainTabs() {
  const { user } = useAuth();
  const { t } = useLang();
  const routes = getTabRoutes(user?.role, t);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.gray[400],
        tabBarStyle: {
          paddingBottom: 4,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
        },
      }}
    >
      {routes.map((route) => (
        <Tab.Screen
          key={route.name}
          name={route.name}
          component={route.component}
          options={{
            tabBarLabel: route.label,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? route.activeIcon : route.icon}
                size={size || 22}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

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
