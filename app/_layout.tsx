// 📁 app/_layout.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import AppLockGate from '@/components/AppLockGate';

import {
  registerForPushNotificationsAsync,
  savePushTokenToDatabase,
  setupNotificationListeners,
  cleanupNotificationListeners,
} from '@/lib/pushNotifications';

import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

// ✅ keep splash until we say so
void SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthBootOverlay({ showStartError }: { showStartError: boolean }) {
  return (
    <View style={styles.bootOverlay}>
      {showStartError ? (
        <Text style={styles.bootTitle}>
          Sorry, the app encountered an error while trying to start. Please close and reopen the app.
        </Text>
      ) : (
        <ActivityIndicator size="small" />
      )}
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

    // signed out => cleanup
    if (!user?.id) {
      if (listenersRef.current) {
        cleanupNotificationListeners(listenersRef.current);
        listenersRef.current = null;
      }
      hasSetupRef.current = false;
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
              if (type === 'order') router.push('/(customer)/orders');
              else if (type === 'promo') router.push('/(customer)/shop');
              else router.push('/(customer)/notifications');
            } catch (e) {
              console.log('Could not navigate:', e);
            }
          }
        );

        listenersRef.current = listeners;
      } catch (error) {
        console.error('Error setting up push notifications:', error);
        hasSetupRef.current = false;
      }
    })();

    return () => {
      if (listenersRef.current) {
        cleanupNotificationListeners(listenersRef.current);
        listenersRef.current = null;
      }
      hasSetupRef.current = false;
    };
  }, [user?.id, isInitialized, loading, router]);

  return null;
}

function RootLayoutContent({ lockBlocking }: { lockBlocking: boolean | null }) {
  const { user, isAdmin, isInitialized, loading, profileLoaded } = useAuth();
  const router = useRouter();

  const didRouteRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const [showStartError, setShowStartError] = useState(false);

  // derive "booting" (no early return!)
  const booting = !isInitialized || loading || !profileLoaded;

  // ✅ reset routing guard when user changes
  useEffect(() => {
    const current = user?.id ?? null;
    if (lastUserIdRef.current !== current) {
      lastUserIdRef.current = current;
      didRouteRef.current = false;
    }
  }, [user?.id]);

  // ✅ boot stuck UI (no signOut here)
  useEffect(() => {
    if (!booting || user?.id) {
      setShowStartError(false);
      return;
    }

    const t = setTimeout(() => {
      const stillStuck = (!isInitialized || loading || !profileLoaded) && !user?.id;
      if (stillStuck) setShowStartError(true);
    }, 8000);

    return () => clearTimeout(t);
  }, [booting, isInitialized, loading, profileLoaded, user?.id]);

  // ✅ routing effect (only when booting is false)
  useEffect(() => {
    if (booting) return;

    // if signed in, wait for lock to be confirmed unlocked
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
  }, [booting, user?.id, isAdmin, router, lockBlocking]);

  return (
    <View style={{ flex: 1 }}>
      <PushNotificationSetup />

      {/* ✅ ALWAYS render Stack (no early return) */}
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

      {/* ✅ Overlay boot screen instead of returning early */}
      {booting ? <AuthBootOverlay showStartError={showStartError} /> : null}

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

  const [lockBlocking, setLockBlocking] = useState<boolean | null>(null);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void SystemUI.setBackgroundColorAsync('#F9FAFB').catch(() => {});
    }
  }, []);

  // ✅ early return is fine here (after hooks)
  if (!fontsLoaded && !fontError) return null;

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
  bootOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  bootTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
});