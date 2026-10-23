import * as SecureStore from 'expo-secure-store';

import { API_URL, REQUEST_TIMEOUT_MS } from '@/config/env';
import { SessionManager } from '@/services/auth/session-manager';

import { createApiClient } from './client';

/** Cliente sin sesión: login, registro y refresh. */
const publicApi = createApiClient({ baseUrl: API_URL, timeoutMs: REQUEST_TIMEOUT_MS });

/** Única instancia de sesión de la app (tokens en SecureStore). */
export const session = new SessionManager(SecureStore, publicApi);

/** Cliente autenticado: agrega Bearer, renueva el token en 401 y reintenta una vez. */
export const api = createApiClient({
  baseUrl: API_URL,
  timeoutMs: REQUEST_TIMEOUT_MS,
  auth: {
    getAccessToken: () => session.getAccessToken(),
    refreshSession: () => session.refresh(),
  },
});

export { publicApi };
