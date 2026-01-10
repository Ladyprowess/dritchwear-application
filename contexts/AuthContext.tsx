// 📁 contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Profile, getProfile } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  isInitialized: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
  isInitialized: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // ✅ must be inside component
  const hasResetOnResume = useRef(false);

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

  // ✅ On resume: NEVER signOut locally just because session is momentarily null
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;

      if (hasResetOnResume.current) return;

      console.log('🔄 App resumed — checking auth state');

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.log('⚠️ getSession error on resume:', error.message);
        }

        // If no session, just clear UI state (do NOT wipe persisted session storage)
        if (!data.session) {
          console.log('⚠️ No session on resume — clearing local state only');
          setUser(null);
          setProfile(null);
          setLoading(false);
          setIsInitialized(true);

          hasResetOnResume.current = false;
          return;
        }

        // If session exists, refresh local state
        if (data.session.user) {
          console.log('✅ Session exists on resume for:', data.session.user.email);
          setUser(data.session.user);

          try {
            const { profile } = await getProfile();
            setProfile(profile);
          } catch (err) {
            console.log('⚠️ Resume profile refresh failed:', err);
          }

          setLoading(false);
          setIsInitialized(true);
          hasResetOnResume.current = false;
        }
      } catch (e) {
        console.log('⚠️ Auth check failed on resume (no signOut):', e);
        setUser(null);
        setProfile(null);
        setLoading(false);
        setIsInitialized(true);
        hasResetOnResume.current = false;
      }
    });

    return () => {
      hasResetOnResume.current = false;
      sub.remove();
    };
  }, []);

  // ✅ Init auth once on app start (NOT dependent on profile)
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
      return (await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session restore timeout')), ms)
        ),
      ])) as Awaited<ReturnType<typeof supabase.auth.getSession>>;
    };

    const initializeAuth = async () => {
      try {
        console.log('🚀 Initializing authentication...');

        const { data: { session }, error } = await getSessionWithTimeout(6000);

        if (error) {
          console.error('❌ Error getting session:', error);

          const msg = (error.message || '').toLowerCase();
          if (retryCount < maxRetries && msg.includes('network')) {
            retryCount++;
            console.log(`🔄 Retrying session fetch (${retryCount}/${maxRetries})...`);

            retryTimer = setTimeout(() => {
              if (!mounted) return;
              initializeAuth();
            }, 1000 * retryCount);

            return;
          }

          if (mounted) {
            setLoading(false);
            setIsInitialized(true);
          }
          return;
        }

        if (session?.user && mounted) {
          console.log('✅ Session found for user:', session.user.email);
          setUser(session.user);

          try {
            console.log('📋 Loading user profile...');
            const { profile } = await getProfile();
            if (mounted) {
              setProfile(profile);
              console.log('✅ Profile loaded successfully');
            }
          } catch (profileError) {
            console.error('❌ Error loading profile:', profileError);
          }
        } else {
          console.log('ℹ️ No active session found');
          if (mounted) {
            setUser(null);
            setProfile(null);
          }
        }

        if (mounted) {
          setLoading(false);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (mounted) {
          setUser(null);
          setProfile(null);
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
          case 'SIGNED_OUT':
            console.log('👋 User signed out');
            setUser(null);
            setProfile(null);
            break;

          case 'SIGNED_IN':
            if (session?.user) {
              console.log('👋 User signed in:', session.user.email);
              setUser(session.user);

              try {
                const { profile } = await getProfile();
                setProfile(profile);
                console.log('✅ Profile loaded after sign in');
              } catch (err) {
                console.error('❌ Error loading profile after sign in:', err);
              }
            }
            break;

          case 'TOKEN_REFRESHED':
            if (session?.user) {
              console.log('🔄 Token refreshed for user:', session.user.email);
              setUser(session.user);

              // Only load profile if missing
              if (!profile) {
                try {
                  const { profile: newProfile } = await getProfile();
                  setProfile(newProfile);
                } catch (err) {
                  console.error('❌ Error loading profile after token refresh:', err);
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
  }, []); // ✅ run once

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
        isInitialized,
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
