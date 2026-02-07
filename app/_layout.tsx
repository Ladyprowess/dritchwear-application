// 📁 app/_layout.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import AnimatedSplash from "@/components/AnimatedSplash";

import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';

import {
  registerForPushNotificationsAsync,
  savePushTokenToDatabase,
  setupNotificationListeners,
  cleanupNotificationListeners,
} from '@/lib/pushNotifications';

import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

// ✅ keep splash until we say so
void SplashScreen.preventAutoHideAsync().catch(() => {});


const BRAND = {
  purple: '#5A2D82', // Dritchwear brand purple
  yellow: '#FDB813', // Dritchwear brand yellow
  softBg: '#F9FAFB',
};
const BOOT_TIMEOUT_MS = 8000;

// ✅ time before we switch from Loading... to Timeout message


function AuthBootOverlay({ mode }: { mode: 'loading' | 'timeout' }) {
  return (
    <View style={styles.bootOverlay}>
      {mode === 'timeout' ? (
        <>
          <Text style={styles.errorIcon}>⏳</Text>
          <Text style={styles.bootTitle}>Loading is taking too long</Text>
          <Text style={styles.bootMessage}>
            Please refresh the app.{'\n'}
            Close it completely and open it again.
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={BRAND.purple} />
          <Text style={styles.loadingText}>Loading...</Text>
        </>
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

function RootLayoutContent() {
  const { user, isAdmin, isInitialized, loading, profileLoaded } = useAuth();
  const router = useRouter();

  const didRouteRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const splashHiddenRef = useRef(false);


  // ✅ timeout state (no "error" UI anymore)
  const [showTimeout, setShowTimeout] = useState(false);
  const timeoutLockedRef = useRef(false);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  const bootStartRef = useRef<number>(Date.now());
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // derive "booting" (no early return!)
  const booting = !isInitialized || loading || (!!user?.id && !profileLoaded);

  const hideSplashSafely = () => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  };

  const lockTimeoutAndShow = () => {
    if (timeoutLockedRef.current) return;
    timeoutLockedRef.current = true;

    // show overlay (loading/timeout) instead of native red error
    hideSplashSafely();
    setShowTimeout(true);
  };

  useEffect(() => {
    requestAnimationFrame(() => hideSplashSafely());
  }, []);



  // ✅ reset routing guard when user changes
  useEffect(() => {
    const current = user?.id ?? null;
    if (lastUserIdRef.current !== current) {
      lastUserIdRef.current = current;
      didRouteRef.current = false;
      splashHiddenRef.current = false;

      // reset timer baseline
      bootStartRef.current = Date.now();

      // IMPORTANT: don't reset showTimeout here
      // because once timeout happens, you want manual refresh
    }
  }, [user?.id]);

  // ✅ cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
    };
  }, []);

  // ✅ boot timeout: show Loading... immediately, then switch to Timeout after BOOT_TIMEOUT_MS
  useEffect(() => {
    if (timeoutLockedRef.current) return;

    if (!booting) {
      // boot done => clear timer and hide splash normally (navigation effect will handle hiding too)
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      return;
    }

    // show Loading... overlay (hide splash so the overlay is visible)
    hideSplashSafely();

    // restart timeout timer
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }

    timeoutTimerRef.current = setTimeout(() => {
      // still booting? show timeout message and lock navigation
      if (!isInitialized || loading || (!!user?.id && !profileLoaded)) {
        lockTimeoutAndShow();
      }
    }, BOOT_TIMEOUT_MS);

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
    };
  }, [booting, isInitialized, loading, profileLoaded, user?.id]);

  // ✅ routing effect: only route when booting is done AND no timeout locked
  useEffect(() => {
    if (booting) return;
    if (timeoutLockedRef.current) return;

    if (didRouteRef.current) return;
    didRouteRef.current = true;

    try {
      if (!user?.id) {
        router.replace('/(auth)/welcome');
      } else if (isAdmin) {
        router.replace('/(admin)');
      } else {
        router.replace('/(customer)');
      }

      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            hideSplashSafely();
          });
        });
      });
    } catch (e) {
      console.error('Navigation error:', e);
      lockTimeoutAndShow();
    }
  }, [booting, user?.id, isAdmin, router]);

  const showOverlay = booting || showTimeout;

  return (
    <View style={{ flex: 1 }}>
      <PushNotificationSetup />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* ✅ Overlay boot screen / timeout */}

      {showAnimatedSplash && (
  <AnimatedSplash onDone={() => setShowAnimatedSplash(false)} />
)}

      <StatusBar style="dark" translucent={false} hidden={false} />
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

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    (async () => {
      try {
        await NavigationBar.setVisibilityAsync('visible'); // Play-friendly

        // ✅ Edge-to-edge: background colour isn't supported (avoids warnings)
        if (Platform.Version < 30) {
          await NavigationBar.setBackgroundColorAsync('#F9FAFB');
        }
        
        await NavigationBar.setButtonStyleAsync('dark');
      } catch {}
    })();
  }, []);

  if (!fontsLoaded && !fontError) return null;

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

const styles = StyleSheet.create({
  bootOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND.softBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  bootTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'Inter-Bold',
  },
  bootMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'Inter-Regular',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    fontFamily: 'Inter-Medium',
  },
});