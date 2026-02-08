// 📁 lib/pushNotifications.ts
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // ✅ Must be a real phone
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  try {
    // ✅ Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5A2D82', // brand purple
      });
    }

    // ✅ Permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Failed to get push notification permissions');
      return null;
    }

    // ✅ Best way: pull projectId from EAS config (fallback to your hardcoded id)
    const projectId =
      Constants.easConfig?.projectId ||
      (Constants.expoConfig as any)?.extra?.eas?.projectId ||
      'a4790542-c5a5-49ed-9721-562bb575964d';

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    // ✅ Never crash the app boot
    console.log('🔕 Push token fetch failed (non-blocking):', error);
    return null;
  }
}

export async function savePushTokenToDatabase(userId: string, token: string): Promise<void> {
  try {
    console.log('🧾 saving token for userId:', userId);

    const deviceType = Platform.OS === 'ios' ? 'ios' : 'android';

    // ✅ IMPORTANT:
    // If your DB only has unique(user_id), this will overwrite tokens when user logs into 2 phones.
    // If you want per device_type uniqueness, change onConflict to: 'user_id,device_type'
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        device_type: deviceType,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('Error saving push token to database:', error);
    } else {
      console.log('✅ Push token saved or updated successfully');
    }
  } catch (error) {
    console.error('Error in savePushTokenToDatabase:', error);
  }
}

export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
): {
  notificationListener: Notifications.Subscription;
  responseListener: Notifications.Subscription;
} {
  try {
    const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('📱 Notification received:', notification.request.content.title);
      onNotificationReceived?.(notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('📱 Notification response received');
      onNotificationResponse?.(response);
    });

    return { notificationListener, responseListener };
  } catch (e) {
    console.log('🔕 Failed to set up notification listeners (non-blocking):', e);

    // dummy so cleanup never crashes
    return {
      notificationListener: { remove() {} } as any,
      responseListener: { remove() {} } as any,
    };
  }
}

export function cleanupNotificationListeners(listeners: {
  notificationListener: Notifications.Subscription;
  responseListener: Notifications.Subscription;
}): void {
  try {
    listeners?.notificationListener?.remove?.();
    listeners?.responseListener?.remove?.();
  } catch (e) {
    console.log('cleanupNotificationListeners failed (non-blocking):', e);
  }
}