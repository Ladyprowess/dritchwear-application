import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const getHashParams = (url: string) => {
      const hash = url.split('#')[1];
      if (!hash) return {} as Record<string, string>;
      return Object.fromEntries(new URLSearchParams(hash));
    };

    const handleUrl = async (url: string) => {
      const parsed = Linking.parse(url);

      // 1) If Supabase returns ?code=... (PKCE)
      const code = parsed.queryParams?.code as string | undefined;
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error || !data.session) {
          router.replace('/(auth)/login');
          return;
        }

        router.replace({
  pathname: '/(auth)/login',
  params: { confirmed: 'true' },
});
        return;
      }

      // 2) If Supabase returns tokens in the URL hash
      const hashParams = getHashParams(url);
      const access_token = hashParams.access_token;
      const refresh_token = hashParams.refresh_token;

      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error || !data.session) {
          router.replace('/(auth)/login');
          return;
        }

        router.replace({
  pathname: '/(auth)/login',
  params: { confirmed: 'true' },
});
        return;
      }

      // 3) Fallback: maybe session already exists
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace({
  pathname: '/(auth)/login',
  params: { confirmed: 'true' },
});
      else router.replace('/(auth)/login');
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
      else router.replace('/(auth)/login');
    });

    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub.remove();
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Confirming your email…</Text>
    </View>
  );
}
