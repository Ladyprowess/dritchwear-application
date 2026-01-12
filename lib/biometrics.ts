// 📁 lib/biometrics.ts
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

function getBiometricKey(userId: string) {
  return `biometric_enabled_${userId}`;
}

export async function isBiometricSupported() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return { hasHardware, isEnrolled };
  } catch {
    return { hasHardware: false, isEnrolled: false };
  }
}

export async function getBiometricEnabled(userId: string) {
  if (!userId) return false;

  try {
    const v = await SecureStore.getItemAsync(getBiometricKey(userId));
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(userId: string, enabled: boolean) {
  if (!userId) return;

  try {
    const key = getBiometricKey(userId);

    if (enabled) {
      await SecureStore.setItemAsync(key, 'true', {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } else {
      // ✅ OFF means remove the key completely
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // fail silently
  }
}

// ✅ Call this on sign out
export async function clearBiometricEnabled(userId: string) {
  if (!userId) return;

  try {
    await SecureStore.deleteItemAsync(getBiometricKey(userId));
  } catch {
    // ignore
  }
}

export async function promptBiometric(reason = 'Unlock Dritchwear') {
  try {
    return await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
  } catch {
    return { success: false } as any;
  }
}
