export default ({ config }) => ({
  ...config,

  name: 'Dritchwear',
  slug: 'dritchwear',
  version: '1.0.0',
  orientation: 'default',

  icon: './assets/images/icon.png',
  scheme: 'dritchwear',
  userInterfaceStyle: 'light',

  splash: {
    image: './assets/images/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#ffffff',
  },

  assetBundlePatterns: ['**/*'],

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

    // ✅ move these inside android
    statusBar: {
      barStyle: 'dark-content',
      backgroundColor: '#FFFFFF',
      translucent: false,
    },

    navigationBar: {
      visible: 'visible',
      barStyle: 'dark-content',
      backgroundColor: '#FFFFFF',
    },
  },

  web: {
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    '@react-native-community/datetimepicker',
    'expo-secure-store',
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

  extra: {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
