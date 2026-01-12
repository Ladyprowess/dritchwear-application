// 📁 contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Profile, getProfile } from '@/lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearBiometricEnabled } from '@/lib/biometrics';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  hardSignOut: () => Promise<void>; // ✅ ADD
  isInitialized: boolean;
  profileLoaded: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
  hardSignOut: async () => {}, // ✅ ADD
  isInitialized: false,
  profileLoaded: false,
});

const LOGIN_TS_KEY = 'last_login_at';
const MAX_LOGIN_AGE_DAYS = 30;

const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;

const setLastLoginNow = async () => {
  await AsyncStorage.setItem(LOGIN_TS_KEY, Date.now().toString());
};

const getLastLoginAt = async () => {
  const v = await AsyncStorage.getItem(LOGIN_TS_KEY);
  return v ? Number(v) : null;
};

const clearLastLoginAt = async () => {
  await AsyncStorage.removeItem(LOGIN_TS_KEY);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const profileRef = useRef<Profile | null>(null);
  const isCheckingResume = useRef(false);

  // ✅ Track last user id so we can clean up even after user becomes null
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    lastUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const refreshProfile = async () => {
    if (!user) return;

    try {
      console.log('🔄 Refreshing profile for user:', user.email);
      const { profile } = await getProfile();
      setProfile(profile);
      console.log('✅ Profile refreshed successfully');
    } catch (error) {
      console.error('❌ Error refreshing profile:', error);
    }
  };

  // ✅ HARD SIGN OUT: always clears local state, always navigates app to "signed out" state
  const hardSignOut = async () => {
    const uid = lastUserIdRef.current || user?.id || null;

    console.log('🚪 hardSignOut: clearing local auth state', { uid });

    // 1) Clear local state FIRST (guarantees UI logs out)
    setUser(null);
    setProfile(null);
    setProfileLoaded(true);
    setLoading(false);
    setIsInitialized(true);

    // 2) Clear login timestamp
    await clearLastLoginAt();

    // 3) Clear biometric state (SecureStore) for this user on this device
    if (uid) {
      await clearBiometricEnabled(uid);
    }

    // 4) Try Supabase signOut (ignore "session missing")
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        const msg = String((error as any)?.message || '').toLowerCase();
        if (msg.includes('auth session missing')) {
          console.log('ℹ️ hardSignOut: no session — already signed out');
          return;
        }
        console.log('⚠️ hardSignOut: supabase signOut error:', error);
      }
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('auth session missing')) {
        console.log('ℹ️ hardSignOut catch: no session — already signed out');
        return;
      }
      console.log('⚠️ hardSignOut catch error:', e);
    }
  };

  // ✅ On resume: auth check
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;

      if (isCheckingResume.current) return;
      isCheckingResume.current = true;

      console.log('🔄 App resumed — checking auth state');

      try {
        // ✅ 1) Enforce 30-day rule on resume
        const last = await getLastLoginAt();
        if (last && Date.now() - last > daysToMs(MAX_LOGIN_AGE_DAYS)) {
          console.log('⏳ Login expired (30 days) — signing out');

          // Use hardSignOut so local state is always cleared
          await hardSignOut();
          return;
        }

        // ✅ 2) Check session
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.log('⚠️ getSession error on resume:', error.message);
        }

        if (!data?.session) {
          console.log('⚠️ No session on resume — will wait for auth listener');

          // IMPORTANT:
          // Do NOT clear user/profile here. Supabase can return null briefly on resume.
          // If the user is truly signed out, onAuthStateChange('SIGNED_OUT') will handle it.
          setProfileLoaded(true);
          setLoading(false);
          setIsInitialized(true);
          return;
        }

        // ✅ Session exists
        console.log('✅ Session exists on resume for:', data.session.user.email);
        setUser(data.session.user);
        await setLastLoginNow();

        setProfileLoaded(false);

        try {
          const { profile } = await getProfile();
          setProfile(profile);
        } catch (err) {
          console.log('⚠️ Resume profile refresh failed:', err);
          setProfile(null);
        } finally {
          setProfileLoaded(true);
          setLoading(false);
          setIsInitialized(true);
        }
      } catch (e) {
        console.log('⚠️ Auth check failed on resume:', e);

        // Don’t risk half-logout states: hardSignOut cleans everything
        await hardSignOut();
      } finally {
        isCheckingResume.current = false;
      }
    });

    return () => {
      isCheckingResume.current = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Init auth once on app start
  useEffect(() => {
    let mounted = true;

    let retryCount = 0;
    const maxRetries = 3;
    let retryTimer: any = null;

    const failSafe = setTimeout(() => {
      if (!mounted) return;
      console.log('⏱️ Failsafe triggered: ending auth loading');
      setLoading(false);
      setIsInitialized(true);
    }, 7000);

    const getSessionWithTimeout = async (ms = 6000) => {
      const res = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session restore timeout')), ms)
        ),
      ]);

      return res as Awaited<ReturnType<typeof supabase.auth.getSession>>;
    };

    const initializeAuth = async () => {
      try {
        console.log('🚀 Initializing authentication...');

        // ✅ Enforce 30-day rule on cold start
        const last = await getLastLoginAt();
        if (last && Date.now() - last > daysToMs(MAX_LOGIN_AGE_DAYS)) {
          console.log('⏳ Login expired (30 days) — signing out on boot');

          // Use hardSignOut so local state is always cleared
          await hardSignOut();
          return;
        }

        const { data: { session }, error } = await getSessionWithTimeout(6000);

        if (error) {
          console.error('❌ Error getting session:', error);

          const msg = (error.message || '').toLowerCase();
          if (retryCount < maxRetries && (msg.includes('network') || msg.includes('timeout'))) {
            retryCount++;
            console.log(`🔄 Retrying session fetch (${retryCount}/${maxRetries})...`);

            retryTimer = setTimeout(() => {
              if (!mounted) return;
              initializeAuth();
            }, 1000 * retryCount);

            return;
          }

          // ✅ wipe broken persisted auth (use hardSignOut to avoid stuck UI)
          if (mounted) {
            await hardSignOut();
          }
          return;
        }

        if (session?.user && mounted) {
          console.log('✅ Session found for user:', session.user.email);
          setUser(session.user);
          await setLastLoginNow();

          setProfileLoaded(false);

          try {
            const { profile: dbProfile } = await getProfile();

            if (!dbProfile) {
              await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                role: 'customer',
                preferred_currency: 'NGN',
                updated_at: new Date().toISOString(),
              });

              const { profile: created } = await getProfile();
              if (mounted) setProfile(created ?? null);
            } else {
              if (mounted) setProfile(dbProfile);
            }
          } catch (e) {
            if (mounted) setProfile(null);
          } finally {
            if (mounted) setProfileLoaded(true);
          }
        } else {
          console.log('ℹ️ No active session found');
          if (mounted) {
            setUser(null);
            setProfile(null);
            setProfileLoaded(true);
          }
        }

        if (mounted) {
          setLoading(false);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);

        // Do NOT force signOut here.
        // If it's a temporary error, signing out will log users out incorrectly.
        if (mounted) {
          setProfileLoaded(true);
          setLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth state changed:', event, session?.user?.email || 'No user');

      if (!mounted) return;

      try {
        switch (event) {
          case 'SIGNED_OUT': {
            const uid = lastUserIdRef.current;

            setUser(null);
            setProfile(null);
            setProfileLoaded(true);
            await clearLastLoginAt();

            // ✅ Clear biometric SecureStore key (device-based)
            if (uid) {
              await clearBiometricEnabled(uid);
            }
            break;
          }

          case 'SIGNED_IN':
            if (session?.user) {
              console.log('👋 User signed in:', session.user.email);
              setUser(session.user);
              await setLastLoginNow();

              setProfileLoaded(false);

              try {
                const { profile } = await getProfile();

                if (!profile) {
                  await supabase.from('profiles').upsert({
                    id: session.user.id,
                    email: session.user.email,
                    role: 'customer',
                    preferred_currency: 'NGN',
                    updated_at: new Date().toISOString(),
                  });

                  const { profile: created } = await getProfile();
                  setProfile(created ?? null);
                } else {
                  setProfile(profile);
                }

                console.log('✅ Profile loaded after sign in');
              } catch (err) {
                console.error('❌ Error loading profile after sign in:', err);
                setProfile(null);
              } finally {
                setProfileLoaded(true);
              }
            }
            break;

          case 'TOKEN_REFRESHED':
            if (session?.user) {
              setUser(session.user);
              await setLastLoginNow();

              if (!profileRef.current) {
                setProfileLoaded(false);
                try {
                  const { profile: newProfile } = await getProfile();
                  setProfile(newProfile);
                } catch (err) {
                  console.error('❌ Error loading profile after token refresh:', err);
                  setProfile(null);
                } finally {
                  setProfileLoaded(true);
                }
              }
            }
            break;

          case 'PASSWORD_RECOVERY':
            console.log('🔑 Password recovery initiated');
            break;

          default:
            console.log('ℹ️ Unhandled auth event:', event);
        }
      } catch (err) {
        console.error('❌ Error handling auth state change:', err);
      }

      setLoading(false);
      setIsInitialized(true);
    });

    return () => {
      mounted = false;
      clearTimeout(failSafe);
      if (retryTimer) clearTimeout(retryTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Admin check
  const adminEmails = [
    'dritchwear@gmail.com',
    'admin@dritchwear.com',
    'support@dritchwear.com',
    'info@dritchwear.com',
  ];

  const isAdmin =
    profile?.role === 'admin' &&
    !!user?.email &&
    adminEmails.includes(user.email);

  useEffect(() => {
    if (isInitialized) {
      console.log('📊 Auth State Summary:', {
        hasUser: !!user,
        userEmail: user?.email,
        hasProfile: !!profile,
        profileRole: profile?.role,
        preferredCurrency: profile?.preferred_currency,
        isAdmin,
        loading,
      });
    }
  }, [user, profile, isAdmin, loading, isInitialized]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        refreshProfile,
        hardSignOut, // ✅ ADD
        isInitialized,
        profileLoaded,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
