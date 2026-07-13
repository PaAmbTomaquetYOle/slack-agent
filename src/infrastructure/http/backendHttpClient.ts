import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { SETTINGS } from '../settings/index.js';
import { BackendTokenProvider } from './backendTokenProvider.js';

export function createBackendHttpClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: SETTINGS.BACKEND_API_URL,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  });

  // BE-7: the backend mints the JWT now (correct `aud`), reached via the client-credentials
  // token endpoint; slack-agent just fetches/caches/refreshes it instead of self-signing.
  const tokenProvider = new BackendTokenProvider(
    SETTINGS.BACKEND_API_URL,
    SETTINGS.BACKEND_CLIENT_ID,
    SETTINGS.BACKEND_CLIENT_SECRET,
  );

  instance.interceptors.request.use(async (config) => {
    const token = await tokenProvider.getToken();
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  return instance;
}
