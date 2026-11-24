import type { AnkoApi } from '../shared/anko-api';

declare global {
  interface Window {
    anko: AnkoApi;
    Capacitor?: {
      isNativePlatform(): boolean;
    };
  }
}

export {};
