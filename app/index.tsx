import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text, Pressable } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

const SESSION_TIMEOUT_MS = 7000;

export default function IndexScreen() {
  const { user, profile, loading, isAdmin, isInitialized } = useAuth();
  const router = useRouter();

  const [timedOut, setTimedOut] = useState(false);

  // 1) Safety timeout: if auth restore hangs, show fallback UI
  useEffect(() => {
    if (isInitialized && !loading) {
      setTimedOut(false);
      return;
    }

    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), SESSION_TIMEOUT_MS);

    return () => clearTimeout(t);
  }, [isInitialized, loading]);

  const goToWelcome = useCallback(() => {
    router.replace('/(auth)/welcome');
  }, [router]);

  const retry = useCallback(() => {
    // “Retry” by reloading this route.
    setTimedOut(false);
    router.replace('/'); // re-enter index screen
  }, [router]);

  // 2) Normal routing once auth is ready
  useEffect(() => {
    if (!isInitialized || loading) return;

    console.log('🧭 Navigation Logic:', {
      hasUser: !!user,
      userEmail: user?.email,
      hasProfile: !!profile,
      profileRole: profile?.role,
      isAdmin,
    });

    if (!user) {
      router.replace('/(auth)/welcome');
    } else if (isAdmin) {
      router.replace('/(admin)');
    } else {
      router.replace('/(customer)');
    }
  }, [user, profile, loading, isAdmin, isInitialized, router]);

  // Loading UI
  if (!isInitialized || loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>
          {!isInitialized ? 'Initializing...' : 'Loading...'}
        </Text>
        <Text style={styles.subText}>Restoring your session</Text>

        {/* Timeout fallback */}
        {timedOut && (
          <View style={styles.timeoutBox}>
            <Text style={styles.timeoutText}>
              This is taking longer than expected.
            </Text>

            <Pressable style={styles.primaryBtn} onPress={retry}>
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={goToWelcome}>
              <Text style={styles.secondaryBtnText}>Continue to Login</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // Rare fallback
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#7C3AED" />
      <Text style={styles.loadingText}>Redirecting...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    textAlign: 'center',
  },
  subText: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },

  timeoutBox: {
    marginTop: 18,
    width: '100%',
    maxWidth: 320,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  timeoutText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  primaryBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  secondaryBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: {
    color: '#111827',
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
});
