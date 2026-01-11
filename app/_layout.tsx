import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
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
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function AuthBootScreen({ onTryAgain, onGoLogin }: { onTryAgain: () => void; onGoLogin: () => void }) {
  return (
    <View style={styles.bootWrap}>
      <Text style={styles.bootTitle}>Initialising…</Text>
      <Text style={styles.bootSub}>Restoring your session</Text>

      <View style={{ height: 18 }} />

      <Pressable style={styles.bootBtn} onPress={onTryAgain}>
        <Text style={styles.bootBtnText}>Try Again</Text>
      </Pressable>

      <Pressable style={[styles.bootBtn, styles.bootBtnAlt]} onPress={onGoLogin}>
        <Text style={[styles.bootBtnText, styles.bootBtnTextAlt]}>Go to Login</Text>
      </Pressable>
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
  }, [user?.id, isInitialized, loading]);



  return null;
}

function RootLayoutContent() {
  const { user, isAdmin, isInitialized, loading, profileLoaded } = useAuth();
  const router = useRouter();

  const didRouteRef = useRef(false);

  const onTryAgain = async () => {
    didRouteRef.current = false;
  
    try {
      const { data, error } = await supabase.auth.getSession();
  
      if (error) {
        console.log('Try again getSession error:', error.message);
        return;
      }
  
      // If no session, go to auth immediately
      if (!data?.session?.user?.id) {
        router.replace('/(auth)');
        return;
      }
  
      // If session exists, DO NOT force customer/admin here.
      // Let your routing effect handle it correctly based on isAdmin.
      // (The effect will run because didRouteRef was reset.)
    } catch (e) {
      console.log('Try again failed:', e);
    }
  };
  
  const onGoLogin = () => {
    didRouteRef.current = false;
    router.replace('/(auth)/login');
  };

  useEffect(() => {
    if (!isInitialized || loading || !profileLoaded) return;
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
  }, [isInitialized, loading, profileLoaded, user?.id, isAdmin, router]);
  
  

  if (!isInitialized || loading || !profileLoaded) {
    return <AuthBootScreen onTryAgain={onTryAgain} onGoLogin={onGoLogin} />;
  }
  
  

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
          <AppLockGate>
            <RootLayoutContent />
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
  bootSub: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
  },
  bootBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  bootBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bootBtnAlt: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bootBtnTextAlt: {
    color: '#111827',
  },
});
