import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  name: 'Dritchwear',
  slug: 'dritchwear',
  version: '1.0.0',
  runtimeVersion: "1.0.0",
  orientation: 'default',

  icon: './assets/images/icon.png',

  scheme: 'dritchwear',

  userInterfaceStyle: 'light',

  splash: {
    image: './assets/images/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#ffffff',
  },

  androidStatusBar: {
    barStyle: 'dark-content',
    backgroundColor: '#F9FAFB',
    translucent: false,
  },
  
  androidNavigationBar: {
    visible: 'visible',
    barStyle: 'dark-content',
    backgroundColor: '#F9FAFB',
  },
  

  assetBundlePatterns: ['**/*'],
  updates: {
    enabled: false,
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.dritchwear.app',
  },

  android: {
    package: 'com.dritchwear.app',
    googleServicesFile: './google-services.json',
    softwareKeyboardLayoutMode: 'resize',
    versionCode: 102,
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
          enableEdgeToEdge: false,
        },
      },
    ],
  ],
});
