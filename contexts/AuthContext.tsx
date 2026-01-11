// 📁 contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Profile, getProfile } from '@/lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';


interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  isInitialized: boolean;
  profileLoaded: boolean; // ✅ add
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
  isInitialized: false,
  profileLoaded: false, // ✅ add
});


const LOGIN_TS_KEY = 'last_login_at';
const MAX_LOGIN_AGE_DAYS = 365; // or remove the entire check


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


  // ✅ must be inside component
  const profileRef = useRef<Profile | null>(null);
const isCheckingResume = useRef(false);




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

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  

  // ✅ On resume: if session is missing/broken → sign out fast (no hanging)
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
          await supabase.auth.signOut();
          await clearLastLoginAt();
  
          setUser(null);
          setProfile(null);
          setLoading(false);
          setIsInitialized(true);
          return;
        }
  
        // ✅ 2) If session is missing/broken → sign out immediately
        const { data, error } = await supabase.auth.getSession();
  
        if (error) {
          console.log('⚠️ getSession error on resume:', error.message);
        }
  
        if (!data?.session) {
          console.log('⚠️ No session on resume — not signing out (will wait for auth listener)');
          setUser(null);
          setProfile(null);
          setProfileLoaded(true); // ✅ add
          setLoading(false);
          setIsInitialized(true);
          return;
        }
        
        
  
        // ✅ Session exists
        console.log('✅ Session exists on resume for:', data.session.user.email);
        setUser(data.session.user);
        await setLastLoginNow();

  
        try {
          const { profile } = await getProfile();
          setProfile(profile);
        } catch (err) {
          console.log('⚠️ Resume profile refresh failed:', err);
        }
  
        setLoading(false);
        setIsInitialized(true);
      } catch (e) {
        console.log('⚠️ Auth check failed on resume — signing out:', e);
        await supabase.auth.signOut();
        await clearLastLoginAt();
  
        setUser(null);
        setProfile(null);
        setLoading(false);
        setIsInitialized(true);
      } finally {
        isCheckingResume.current = false;
      }
    });
  
    return () => {
      isCheckingResume.current = false;
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
          await supabase.auth.signOut();
          await clearLastLoginAt();
    
          if (mounted) {
            setUser(null);
            setProfile(null);
            setLoading(false);
            setIsInitialized(true);
          }
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
    
          // ✅ wipe broken persisted auth
          if (mounted) {
            await supabase.auth.signOut();
            await clearLastLoginAt();
    
            setUser(null);
            setProfile(null);
            setLoading(false);
            setIsInitialized(true);
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
    setProfileLoaded(true); // ✅ add
  }
}

    
        if (mounted) {
          setLoading(false);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
    
        // ✅ wipe broken persisted auth here too
        if (mounted) {
          await supabase.auth.signOut();
          await clearLastLoginAt();
    
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
  setUser(null);
  setProfile(null);
  setProfileLoaded(true); // ✅ add
  await clearLastLoginAt();
  break;


  case 'SIGNED_IN':
    if (session?.user) {
      console.log('👋 User signed in:', session.user.email);
      setUser(session.user);
      await setLastLoginNow();
  
      setProfileLoaded(false); // ✅ start
  
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
        setProfileLoaded(true); // ✅ end
      }
    }
    break;
  

    case 'TOKEN_REFRESHED':
      if (session?.user) {
        setUser(session.user);
        await setLastLoginNow();
    
        // ✅ mark that profile is being resolved
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
    profileLoaded, // ✅ ADD THIS
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
