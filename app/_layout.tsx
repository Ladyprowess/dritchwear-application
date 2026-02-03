// 📁 app/_layout.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

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

// ✅ minimum time to show loader before error (so error doesn’t “pop” instantly)
const MIN_ERROR_LOADING_MS = 700;

function AuthBootOverlay({ showStartError }: { showStartError: boolean }) {
  return (
    <View style={styles.bootOverlay}>
      {showStartError ? (
        <>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.bootTitle}>Oops! Something went wrong</Text>
          <Text style={styles.bootMessage}>
            There is an error while loading this page.{'\n'}
            Kindly exit the app and reopen it again.
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#7C3AED" />
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

  const [showStartError, setShowStartError] = useState(false);
  const errorLockedRef = useRef(false);

  // ✅ NEW: forces a short loading screen before showing error
  const [forceLoadingBeforeError, setForceLoadingBeforeError] = useState(false);
  const bootStartRef = useRef<number>(Date.now());
  const errorDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // derive "booting" (no early return!)
  const booting = !isInitialized || loading || (!!user?.id && !profileLoaded);

  const hideSplashSafely = () => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  };

  const lockErrorAndShow = () => {
    if (errorLockedRef.current) return;
    errorLockedRef.current = true;

    // Hide splash so we can show loader/error overlay
    hideSplashSafely();

    // ✅ Always show a short loader first (so error doesn’t pop instantly)
    setForceLoadingBeforeError(true);
    setShowStartError(false);

    const elapsed = Date.now() - bootStartRef.current;
    const remaining = Math.max(0, MIN_ERROR_LOADING_MS - elapsed);

    if (errorDelayTimerRef.current) {
      clearTimeout(errorDelayTimerRef.current);
      errorDelayTimerRef.current = null;
    }

    errorDelayTimerRef.current = setTimeout(() => {
      setForceLoadingBeforeError(false);
      setShowStartError(true);
    }, remaining);
  };

  // ✅ reset routing guard when user changes
  useEffect(() => {
    const current = user?.id ?? null;
    if (lastUserIdRef.current !== current) {
      lastUserIdRef.current = current;
      didRouteRef.current = false;
      splashHiddenRef.current = false;

      // ✅ reset timer baseline for “loading before error”
      bootStartRef.current = Date.now();

      // ❌ do not reset error here (your original behaviour)
    }
  }, [user?.id]);

  // ✅ cleanup timer
  useEffect(() => {
    return () => {
      if (errorDelayTimerRef.current) {
        clearTimeout(errorDelayTimerRef.current);
        errorDelayTimerRef.current = null;
      }
    };
  }, []);

  // ✅ boot timeout: if still booting after 6s -> lock error and stop everything
  useEffect(() => {
    if (errorLockedRef.current) return;
    if (!booting) return;

    const t = setTimeout(() => {
      if (!isInitialized || loading || !profileLoaded) {
        lockErrorAndShow();
      }
    }, 6000);

    return () => clearTimeout(t);
  }, [booting, isInitialized, loading, profileLoaded]);

  // ✅ routing effect: only route when booting is done AND no error locked
  useEffect(() => {
    if (booting) return;
    if (errorLockedRef.current) return;

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
      lockErrorAndShow();
    }
  }, [booting, user?.id, isAdmin, router]);

  const showOverlay = booting || forceLoadingBeforeError || showStartError;

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

      {/* ✅ Overlay boot screen / forced loading / error */}
      {showOverlay ? (
        <View style={{ ...StyleSheet.absoluteFillObject, pointerEvents: showStartError ? 'auto' : 'none' }}>
          <AuthBootOverlay showStartError={showStartError} />
        </View>
      ) : null}

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
        await NavigationBar.setBackgroundColorAsync('#F9FAFB');
        // Optional: keeps icons readable on light bg
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
    backgroundColor: '#F9FAFB',
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
