import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const handleUrl = async (url: string) => {
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;

      // No code → go to login
      if (!code) {
        router.replace('/(auth)/login');
        return;
      }

      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        router.replace('/(auth)/login');
        return;
      }

      // If session exists → user is now logged in
      if (data.session) {
        router.replace('/'); // your app home
      } else {
        router.replace('/(auth)/login');
      }
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
 