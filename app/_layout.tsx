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
import * as Notifications from 'expo-notifications';
import 'react-native-url-polyfill/auto';
import {
  registerForPushNotificationsAsync,
  savePushTokenToDatabase,
  setupNotificationListeners,
  cleanupNotificationListeners,
} from '@/lib/pushNotifications';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Push notification setup component
function PushNotificationSetup() {
  const { user } = useAuth();
  const router = useRouter();
  const listenersRef = useRef<{
    notificationListener: Notifications.Subscription;
    responseListener: Notifications.Subscription;
  } | null>(null);

  useEffect(() => {
    // Always cleanup previous listeners first (prevents duplicates)
    if (listenersRef.current) {
      cleanupNotificationListeners(listenersRef.current);
      listenersRef.current = null;
    }

    if (!user?.id) return;

    // 1) Register and save token
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await savePushTokenToDatabase(user.id, token);
      }
    })();

    // 2) Setup listeners
    const listeners = setupNotificationListeners(
      (notification) => {
        console.log('📱 Notification received:', notification.request.content.title);

        // OPTIONAL: if user is already on notifications page, you can trigger a refresh
        // We'll do it via router params (simple approach)
        router.setParams({ refresh: String(Date.now()) });
      },
      (response) => {
        const data: any = response.notification.request.content.data || {};
        const type = String(data.type || '');

        if (type === 'order') {
          router.push('/(customer)/orders');
        } else if (type === 'promo') {
          router.push('/(customer)/shop');
        } else {
          router.push('/(customer)/notifications');
        }
      }
    );

    listenersRef.current = listeners;

    return () => {
      if (listenersRef.current) {
        cleanupNotificationListeners(listenersRef.current);
        listenersRef.current = null;
      }
    };
  }, [user?.id]);

  return null;
}

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide the splash screen after fonts are loaded
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Configure edge-to-edge for Android 15+
    if (Platform.OS === 'android') {
      // Use updated APIs for Android 15+ compatibility
      SystemUI.setBackgroundColorAsync('transparent');
      
      if (Platform.Version >= 35) {
        console.log('Configuring edge-to-edge for Android 15+ (SDK 35+)');
        // Android 15+ handles edge-to-edge automatically with proper inset handling
      }
    }
  }, []);

  // Keep the splash screen visible while fonts are loading
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <CartProvider>
          <PushNotificationSetup />
          <View style={{ flex: 1 }}>
            <Stack screenOptions={{ 
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' }
            }}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(customer)" options={{ headerShown: false }} />
              <Stack.Screen name="(admin)" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar 
              style="auto" 
              translucent 
              backgroundColor="transparent" 
              hidden={false}
            />
          </View>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}