/**
 * Configuración por ambiente (semana 9).
 *
 * Expo inyecta en el bundle las variables que empiezan con EXPO_PUBLIC_ leyéndolas de
 * `.env`, `.env.development`, `.env.production`, etc. Deben referenciarse de forma literal
 * (process.env.EXPO_PUBLIC_X), no desestructuradas.
 *
 * ⚠ Todo lo que lleve prefijo EXPO_PUBLIC_ queda visible dentro de la app: nunca pongas secretos aquí.
 */
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

/** URL base de library_api, sin "/" final. En un dispositivo físico usa la IP de tu PC, no localhost. */
export const API_URL = (
  rawApiUrl && rawApiUrl.length > 0 ? rawApiUrl : 'http://localhost:3000'
).replace(/\/+$/, '');

/** Tiempo máximo de espera por petición antes de considerarla un fallo de red. */
export const REQUEST_TIMEOUT_MS = 10_000;
