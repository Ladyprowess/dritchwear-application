import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSegments, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getBiometricEnabled, promptBiometric } from '@/lib/biometrics';

type GateState = 'boot' | 'locked' | 'unlocked';

type Props = {
  children: React.ReactNode;
  onLockedChange?: (locked: boolean) => void; // ✅ used by RootLayoutContent to pause routing
};

export default function AppLockGate({ children, onLockedChange }: Props) {
  const { user, isInitialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const isAuthFlow = segments[0] === '(auth)';
  const shouldGate = isInitialized && !!user?.id && !isAuthFlow;

  const [gate, setGate] = useState<GateState>('boot');
  const [busy, setBusy] = useState(false);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const authInProgressRef = useRef(false);
  const lastAuthTimeRef = useRef(0);

  // Tell parent when locked/unlocked (so it can pause routing)
  useEffect(() => {
    const lockedNow = shouldGate && gate !== 'unlocked';
    onLockedChange?.(lockedNow);
  }, [shouldGate, gate, onLockedChange]);

  const runLock = async () => {
    // Signed out or in auth flow → allow app
    if (!shouldGate) {
      setGate('unlocked');
      return;
    }

    // Don’t re-trigger while prompt is open
    if (authInProgressRef.current || busy) return;

    // ✅ Immediately cover UI (prevents profile flash behind prompt)
    setGate('locked');
    setBusy(true);

    try {
      const enabled = await getBiometricEnabled();

      // If biometrics isn't enabled, allow app
      if (!enabled) {
        setGate('unlocked');
        return;
      }

      authInProgressRef.current = true;

      const res = await promptBiometric('Unlock Dritchwear');
      lastAuthTimeRef.current = Date.now();

      setGate(res.success ? 'unlocked' : 'locked');
    } catch (e) {
      // Fail open if anything breaks
      setGate('unlocked');
    } finally {
      authInProgressRef.current = false;
      setBusy(false);
    }
  };

  // Run when user becomes available / route group changes
  useEffect(() => {
    // When gating becomes relevant, lock immediately (UI cover) then authenticate
    if (shouldGate) setGate('locked');
    runLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGate, user?.id]);

  // Re-lock on background -> active (avoid loop right after auth prompt)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        const justAuthed = Date.now() - lastAuthTimeRef.current < 4000;
        if (busy || authInProgressRef.current || justAuthed) return;

        runLock();
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGate, user?.id, busy]);

  return (
    <View style={{ flex: 1 }}>
      {/* ✅ Keep app mounted */}
      {children}

      {/* ✅ Opaque lock overlay when needed */}
      {shouldGate && gate !== 'unlocked' && (
        <View style={styles.fullOverlay} pointerEvents="auto">
          <View style={styles.card}>
            <Text style={styles.title}>App Locked</Text>
            <Text style={styles.sub}>Use biometric authentication to continue.</Text>

            <Pressable style={styles.btn} onPress={runLock} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Checking…' : 'Unlock'}</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.alt]}
              onPress={() => router.replace('/(auth)/login')}
              disabled={busy}
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
