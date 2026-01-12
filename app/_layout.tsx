import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import 'react-native-url-polyfill/auto';
import AppLockGate from '@/components/AppLockGate';
import {
  registerForPushNotificationsAsync,
  savePushTokenToDatabase,
  setupNotificationListeners,
  cleanupNotificationListeners,
} from '@/lib/pushNotifications';
import Constants from 'expo-constants';

SplashScreen.preventAutoHideAsync();

function AuthBootScreen({ showStartError }: { showStartError: boolean }) {
  if (showStartError) {
    return (
      <View style={styles.bootWrap}>
        <Text style={styles.bootTitle}>
          Sorry the app encountered an error while trying to start, kindly close and reopen the app to clear error
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.bootWrap}>
      <ActivityIndicator size="small" />
    </View>
  );
}

function PushNotificationSetup() {
  const { user, isInitialized, loading } = useAuth();
  const router = useRouter();
  const listenersRef = useRef<any>(null);
  const hasSetupRef = useRef(false);

  useEffect(() => {
    if (!isInitialized || loading) return;

    if (!user?.id) {
      if (listenersRef.current) {
        cleanupNotificationListeners(listenersRef.current);
        listenersRef.current = null;
        hasSetupRef.current = false;
      }
      return;
    }

    if (hasSetupRef.current) return;

    if (Constants.appOwnership === 'expo') {
      console.log('ℹ️ Skipping push registration in Expo Go');
      return;
    }

    hasSetupRef.current = true;

    (async () => {
      try {
        const Notifications = await import('expo-notifications');

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });

        const token = await registerForPushNotificationsAsync();
        if (token && user?.id) {
          await savePushTokenToDatabase(user.id, token);
        }

        const listeners = setupNotificationListeners(
          () => {
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
  }, [user?.id, isInitialized, loading]);

  return null;
}

function RootLayoutContent({ lockBlocking }: { lockBlocking: boolean | null }) {
  const { user, isAdmin, isInitialized, loading, profileLoaded } = useAuth();
  const router = useRouter();

  const didRouteRef = useRef(false);
  const [showStartError, setShowStartError] = useState(false);

  useEffect(() => {
    const stillBooting = !isInitialized || loading || !profileLoaded;
    const hasUser = !!user?.id;

    if (!stillBooting || hasUser) {
      setShowStartError(false);
      return;
    }

    const t = setTimeout(() => {
      const stillStuck = (!isInitialized || loading || !profileLoaded) && !user?.id;
      if (stillStuck) setShowStartError(true);
    }, 8000);

    return () => clearTimeout(t);
  }, [isInitialized, loading, profileLoaded, user?.id]);

  useEffect(() => {
    if (!isInitialized || loading || !profileLoaded) return;

    // ✅ KEY FIX:
    // If user is signed in, DO NOT route until the lock system tells us it's unlocked.
    // lockBlocking:
    // - null => lock state not known yet
    // - true => locked / blocking
    // - false => unlocked / allow routing
    if (user?.id && lockBlocking !== false) return;

    if (didRouteRef.current) return;
    didRouteRef.current = true;

    if (!user?.id) {
      router.replace('/(auth)');
      return;
    }

    if (isAdmin) {
      router.replace('/(admin)');
      return;
    }

    router.replace('/(customer)');
  }, [isInitialized, loading, profileLoaded, user?.id, isAdmin, router, lockBlocking]);

  if (!isInitialized || loading || !profileLoaded) {
    return <AuthBootScreen showStartError={showStartError} />;
  }

  return (
    <View style={{ flex: 1 }}>
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

      <StatusBar style="dark" translucent={false} backgroundColor="#F9FAFB" hidden={false} />
    </View>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  // ✅ null means: we don't know yet (treat as blocking for signed-in users)
  const [lockBlocking, setLockBlocking] = useState<boolean | null>(null);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      SystemUI.setBackgroundColorAsync('#F9FAFB');
    }
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <CartProvider>
          <AppLockGate onLockedChange={setLockBlocking}>
            <RootLayoutContent lockBlocking={lockBlocking} />
          </AppLockGate>
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootWrap: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  bootTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
});
