import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import 'react-native-url-polyfill/auto';
import {
  registerForPushNotificationsAsync,
  savePushTokenToDatabase,
  setupNotificationListeners,
  cleanupNotificationListeners,
} from '@/lib/pushNotifications';
import Constants from 'expo-constants';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();


// Push notification setup component
function PushNotificationSetup() {
  const { user, isInitialized } = useAuth();
  const router = useRouter();
  const listenersRef = useRef<any>(null);

  const hasSetupRef = useRef(false);

  useEffect(() => {
    if (!isInitialized) return;
  
    if (!user?.id) {
      if (listenersRef.current) {
        cleanupNotificationListeners(listenersRef.current);
        listenersRef.current = null;
        hasSetupRef.current = false;
      }
      return;
    }
  
    if (hasSetupRef.current) return;
  
    // 🚫 Skip push registration in Expo Go
    if (Constants.appOwnership === 'expo') {
      console.log('ℹ️ Skipping push registration in Expo Go');
      return;
    }
  
    hasSetupRef.current = true;
  
    (async () => {
      try {
        // ✅ Dynamic import (prevents Expo Go crash)
        const Notifications = await import('expo-notifications');
  
        // ✅ Configure notification behavior (only in dev/standalone builds)
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
  
        // 1) Register + save token
        const token = await registerForPushNotificationsAsync();
        if (token && user?.id) {
          await savePushTokenToDatabase(user.id, token);
        }
  
        // 2) Setup listeners
        const listeners = setupNotificationListeners(
          (notification) => {
            console.log('📱 Notification received:', notification.request.content.title);
            try {
              router.setParams({ refresh: String(Date.now()) });
            } catch (e) {
              console.log('Could not set params:', e);
            }
          },
          (response) => {
            const data: any = response.notification.request.content.data || {};
            const type = String(data.type || '');
  
            try {
              if (type === 'order') {
                router.push('/(customer)/orders');
              } else if (type === 'promo') {
                router.push('/(customer)/shop');
              } else {
                router.push('/(customer)/notifications');
              }
            } catch (e) {
              console.log('Could not navigate:', e);
            }
          }
        );
  
        listenersRef.current = listeners;
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    })();
  
    return () => {
      if (listenersRef.current) {
        cleanupNotificationListeners(listenersRef.current);
        listenersRef.current = null;
      }
      hasSetupRef.current = false;
    };
  }, [user?.id, isInitialized, router]);
  

  return null;
}

function RootLayoutContent() {
  const { user, isInitialized } = useAuth();
  
  // ✅ Force remount on auth changes to prevent hook order issues
  const authKey = user?.id || 'signed-out';
  
  return (
    <View key={authKey} style={{ flex: 1 }}>
      <PushNotificationSetup />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F9FAFB' },

        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>

      <StatusBar
  style="dark"
  translucent={false}
  backgroundColor="#F9FAFB"
  hidden={false}
/>
    </View>
  );
}

export default function RootLayout() {
  // ✅ Call ALL hooks at the top level, unconditionally
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  // ✅ All useEffect hooks must also be called unconditionally
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // ✅ Use a solid background so bottom tabs don't sit under system navigation
      SystemUI.setBackgroundColorAsync('#F9FAFB');
    }
  }, []);
  

  // ✅ Show nothing until fonts are ready to prevent hook order issues
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <CartProvider>
          <RootLayoutContent />
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}