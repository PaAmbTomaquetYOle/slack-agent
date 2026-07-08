import axios from 'axios';
import type { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { SETTINGS } from '../settings';

export function createBackendHttpClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: SETTINGS.BACKEND_API_URL,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config) => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: SETTINGS.BACKEND_JWT_ISSUER,
        aud: 'braintrust-backend',
        iat: now,
        exp: now + 300,
      },
      SETTINGS.BACKEND_JWT_SECRET,
    );
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  return instance;
}
