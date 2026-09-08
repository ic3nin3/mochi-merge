import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ic3nin3.mochimerge',
  appName: 'Mochi Merge',
  webDir: 'dist',
  android: {
    // offline bundled assets; no dev server URL in production
  },
};

export default config;
