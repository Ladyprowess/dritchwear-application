import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSegments, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getBiometricEnabled, promptBiometric } from '@/lib/biometrics';

type GateState = 'boot' | 'locked' | 'unlocked';

type Props = {
  children: React.ReactNode;
  onLockedChange?: (locked: boolean) => void;
};

function getBiometricFailMessage(res: any) {
  // Expo LocalAuthentication commonly returns { success, error, warning }
  const err = (res?.error || '').toString();

  // Messages with NO "try again" — only clear next step
  const restartMsg = 'Please close the app and open it again. If it continues, go to Login.';

  if (!err) {
    return `Authentication failed. ${restartMsg}`;
  }

  // Common cases
  if (err.includes('user_cancel') || err.includes('user_cancelled')) {
    return `Authentication was cancelled. ${restartMsg}`;
  }

  if (err.includes('system_cancel')) {
    return `Authentication was interrupted by your phone. ${restartMsg}`;
  }

  if (err.includes('lockout')) {
    return `Authentication is temporarily blocked by your phone security settings. ${restartMsg}`;
  }

  if (err.includes('not_enrolled')) {
    return `Biometrics is not set up on this phone. ${restartMsg}`;
  }

  if (err.includes('not_available') || err.includes('not_supported')) {
    return `Biometric authentication is not available on this device. ${restartMsg}`;
  }

  return `We could not verify your identity. ${restartMsg}`;
}

export default function AppLockGate({ children, onLockedChange }: Props) {
  const { user, isInitialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const isAuthFlow = segments[0] === '(auth)';
  const shouldGate = isInitialized && !!user?.id && !isAuthFlow;

  const [gate, setGate] = useState<GateState>('boot');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const authInProgressRef = useRef(false);
  const lastAuthTimeRef = useRef(0);

  // Tell parent when locked/unlocked
  useEffect(() => {
    const lockedNow = shouldGate && gate !== 'unlocked';
    onLockedChange?.(lockedNow);
  }, [shouldGate, gate, onLockedChange]);

  const runLock = async () => {
    // If no user, unlock immediately and exit early
    if (!user?.id) {
      console.log('🔓 AppLockGate: No user, unlocking immediately');
      setError(null);
      setGate('unlocked');
      setBusy(false);
      authInProgressRef.current = false;
      return;
    }

    // Signed out or in auth flow → allow app
    if (!shouldGate) {
      console.log('🔓 AppLockGate: Not gating (auth flow or not initialized)');
      setError(null);
      setGate('unlocked');
      return;
    }

    // Don't re-trigger while prompt is open
    if (authInProgressRef.current || busy) {
      console.log('🔓 AppLockGate: Already busy, skipping');
      return;
    }

    // Immediately cover UI
    console.log('🔒 AppLockGate: Checking biometric lock');
    setGate('locked');
    setBusy(true);
    setError(null);

    try {
      const enabled = await getBiometricEnabled(user.id);

      // If biometrics isn't enabled, allow app
      if (!enabled) {
        console.log('🔓 AppLockGate: Biometric not enabled, unlocking');
        setError(null);
        setGate('unlocked');
        return;
      }

      authInProgressRef.current = true;

      const res = await promptBiometric('Unlock Dritchwear');
      lastAuthTimeRef.current = Date.now();

      console.log(`🔓 AppLockGate: Biometric result: ${res.success ? 'success' : 'failed'}`);

      if (res.success) {
        setError(null);
        setGate('unlocked');
      } else {
        setGate('locked');
        setError(getBiometricFailMessage(res));
      }
    } catch (e) {
      console.log('🔒 AppLockGate: Unlock error:', e);
      setGate('locked');
      setError('We could not verify your identity. Please close the app and open it again. If it continues, go to Login.');
    } finally {
      authInProgressRef.current = false;
      setBusy(false);
    }
  };

  // Watch user.id changes directly
  useEffect(() => {
    // If user signs out, immediately unlock (highest priority)
    if (!user?.id) {
      console.log('🚪 AppLockGate: User signed out, unlocking immediately');
      setGate('unlocked');
      setBusy(false);
      setError(null);
      authInProgressRef.current = false;
      onLockedChange?.(false);
      return;
    }

    // If we should gate and gate is not unlocked, run lock check
    if (shouldGate && gate !== 'unlocked') {
      console.log('🔐 AppLockGate: Should gate, running lock check');
      runLock();
    } else if (!shouldGate) {
      setError(null);
      setGate('unlocked');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGate, user?.id]);

  // Re-lock on background -> active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      // Don't lock if user is signed out
      if (!user?.id) {
        console.log('🔓 AppLockGate: No user on resume, staying unlocked');
        return;
      }

      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        const justAuthed = Date.now() - lastAuthTimeRef.current < 4000;
        if (busy || authInProgressRef.current || justAuthed) {
          console.log('🔓 AppLockGate: Skipping lock on resume (recently authed or busy)');
          return;
        }

        console.log('🔐 AppLockGate: App resumed, re-checking lock');
        runLock();
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGate, user?.id, busy]);

  // Don't render overlay for signed-out users
  const showOverlay = shouldGate && gate !== 'unlocked' && !!user?.id;

  return (
    <View style={{ flex: 1 }}>
      {children}

      {showOverlay && (
        <View style={styles.fullOverlay} pointerEvents="auto">
          <View style={styles.card}>
            <Text style={styles.title}>App Locked</Text>
            <Text style={styles.sub}>Use biometric authentication to continue.</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable style={styles.btn} onPress={runLock} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Checking…' : 'Unlock'}</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.alt]}
              disabled={busy}
              onPress={async () => {
                try {
                  setError(null);
                  setBusy(true);

                  // Clean sign out so login doesn’t throw errors
                  await supabase.auth.signOut();

                  router.replace('/(auth)/login');
                } catch (e) {
                  console.log('🔒 AppLockGate: signOut error:', e);
                  setError('Please close the app and open it again, then go to Login.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Text style={[styles.btnText, styles.altText]}>Go to Login</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700' },
  sub: { marginTop: 6, fontSize: 14, opacity: 0.7, textAlign: 'center' },

  errorText: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },

  btn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: '#111827',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  alt: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  altText: { color: '#111827' },

  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
  },

  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
    elevation: 9999,
  },
});
