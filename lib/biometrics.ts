import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

// ✅ Each user gets their own biometric setting on this device
function getBiometricKey(userId: string) {
  return `biometric_enabled_${userId}`;
}

export async function isBiometricSupported() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return { hasHardware, isEnrolled };
}

export async function getBiometricEnabled(userId: string) {
  const v = await SecureStore.getItemAsync(getBiometricKey(userId));
  return v === 'true';
}

export async function setBiometricEnabled(userId: string, enabled: boolean) {
  await SecureStore.setItemAsync(getBiometricKey(userId), enabled ? 'true' : 'false');
}

export async function promptBiometric(reason = 'Unlock Dritchwear') {
  return LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
}