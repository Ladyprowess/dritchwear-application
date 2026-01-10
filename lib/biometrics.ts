import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export async function isBiometricSupported() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return { hasHardware, isEnrolled };
}

export async function getBiometricEnabled() {
  const v = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return v === 'true';
}

export async function setBiometricEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function promptBiometric(reason = 'Unlock Dritchwear') {
  return LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false, // set true if you want NO passcode fallback
  });
}
