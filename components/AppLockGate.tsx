import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSegments, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getBiometricEnabled, promptBiometric } from '@/lib/biometrics';

export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAuthFlow = segments[0] === '(auth)';

  const appState = useRef<AppStateStatus>(AppState.currentState);

  // ✅ prevents flicker loops
  const authInProgressRef = useRef(false);
  const lastAuthTimeRef = useRef(0);

  const runLock = async () => {
    try {
      if (!isInitialized) return;

      // Don’t lock login screens / signed out
      if (!user?.id || isAuthFlow) {
        setLocked(false);
        return;
      }

      // ✅ don't re-trigger while prompt is open
      if (authInProgressRef.current) return;

      const enabled = await getBiometricEnabled();
      if (!enabled) {
        setLocked(false);
        return;
      }

      setLocked(true);
      setBusy(true);

      authInProgressRef.current = true;

      const res = await promptBiometric('Unlock Dritchwear');
      lastAuthTimeRef.current = Date.now();

      if (res.success) setLocked(false);
    } catch (e) {
      setLocked(false);
    } finally {
      authInProgressRef.current = false;
      setBusy(false);
    }
  };

  // Run when user becomes available / route group changes
  useEffect(() => {
    runLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, user?.id, isAuthFlow]);

  // Re-lock on background -> active (but avoid the auth prompt loop)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        // ✅ if we JUST authenticated, ignore this active event
        const justAuthed = Date.now() - lastAuthTimeRef.current < 1500;
        if (authInProgressRef.current || justAuthed) return;

        runLock();
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, user?.id, isAuthFlow]);

  return (
    <View style={{ flex: 1 }}>
      {children}
  
      {locked && (
        <View style={styles.overlay}>
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
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { marginTop: 6, fontSize: 14, opacity: 0.7, textAlign: 'center' },
  btn: { width: '100%', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12, backgroundColor: '#111827' },
  btnText: { color: '#fff', fontWeight: '600' },
  alt: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  altText: { color: '#111827' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
  }
  
});
