import type { AnkoApi } from '../preload/index';

declare global {
  interface Window {
    anko: AnkoApi;
  }
}

export {};
