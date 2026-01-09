import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.warn('Push notifications require a physical device');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7F',
      });
    }

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

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'a4790542-c5a5-49ed-9721-562bb575964d',
    });

    return token.data;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}



export async function savePushTokenToDatabase(
  userId: string,
  token: string
): Promise<void> {
  try {
    console.log("🧾 saving token for userId:", userId); // ✅ CORRECT

    const deviceType = Platform.OS === 'ios' ? 'ios' : 'android';

    const { error } = await supabase
  .from('push_tokens')
  .upsert(
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
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('📱 Notification received:', notification.request.content.title);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    }
  );

  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('📱 Notification response received');
      if (onNotificationResponse) {
        onNotificationResponse(response);
      }
    }
  );

  return {
    notificationListener,
    responseListener,
  };
}

export function cleanupNotificationListeners(listeners: {
  notificationListener: Notifications.Subscription;
  responseListener: Notifications.Subscription;
}): void {
  if (listeners.notificationListener) {
    listeners.notificationListener.remove();
  }
  if (listeners.responseListener) {
    listeners.responseListener.remove();
  }
}
