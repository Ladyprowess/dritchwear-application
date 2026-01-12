import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  name: 'Dritchwear',
  slug: 'dritchwear',
  version: '1.0.0',
  orientation: 'portrait',

  icon: './assets/images/icon.png',

  scheme: 'dritchwear',

  userInterfaceStyle: 'light',

  splash: {
    image: './assets/images/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },

  androidStatusBar: {
    barStyle: 'dark-content',
    backgroundColor: '#000000',
    translucent: true,
  },

  androidNavigationBar: {
    visible: 'leanback',
    barStyle: 'dark-content',
    backgroundColor: '#000000',
  },

  assetBundlePatterns: ['**/*'],

  ios: {
    supportsTablet: true,
  },

  android: {
    package: 'com.dritchwear.app',
    googleServicesFile: './google-services.json',
    softwareKeyboardLayoutMode: 'resize',
    versionCode: 50,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
    permissions: ['NOTIFICATIONS', 'READ_MEDIA_IMAGES'],
  },

  web: {
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    // ✅ Date picker plugin (required)
    '@react-native-community/datetimepicker',
    'expo-secure-store',

    // ✅ Existing build properties (kept exactly as-is)
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          minSdkVersion: 24,
          enableEdgeToEdge: true,
        },
      },
    ],
  ],
});
