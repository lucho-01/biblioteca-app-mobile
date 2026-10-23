/**
 * Cliente HTTP de la app (semana 9) con soporte de sesión (semana 10).
 *
 * Distingue dos clases de fallo, porque la app reacciona distinto a cada una:
 * - NetworkError: no hubo respuesta (sin internet, servidor caído, timeout) → se puede reintentar luego.
 * - ApiRequestError: el servidor respondió con un error (4xx/5xx) → trae `status` y `code` estables.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_IN_USE'
  | 'ALREADY_ACTIVE'
  | 'NO_COPIES'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'CONFIG_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class NetworkError extends Error {
  constructor(message = 'No hay conexión con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false para endpoints públicos (login, registro, refresh). Por defecto true. */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface AuthHooks {
  /** Devuelve el idToken vigente (o null si no hay sesión). */
  getAccessToken: () => Promise<string | null>;
  /** Intenta renovar la sesión. true si se renovó y vale la pena reintentar la petición. */
  refreshSession: () => Promise<boolean>;
}

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  auth?: AuthHooks;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
}

function toApiError(status: number, body: unknown): ApiRequestError {
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
  return new ApiRequestError(
    status,
    (err?.code as ApiErrorCode | undefined) ?? 'UNKNOWN',
    err?.message ?? `Error del servidor (${status})`,
  );
}

export function createApiClient({
  baseUrl,
  timeoutMs,
  fetchImpl,
  auth,
}: ApiClientOptions): ApiClient {
  const doFetch = fetchImpl ?? fetch;

  async function send(
    path: string,
    options: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Si el llamador también cancela (ej. al desmontar una pantalla), se propaga.
    options.signal?.addEventListener('abort', () => controller.abort());
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      // fetch solo rechaza cuando no hay respuesta: red caída, DNS, timeout o cancelación.
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const useAuth = options.auth !== false && auth !== undefined;
    let token = useAuth ? await auth!.getAccessToken() : null;
    let res = await send(path, options, token);
    // 401 con sesión: el idToken venció → renovar una vez y reintentar.
    if (res.status === 401 && useAuth) {
      if (await auth!.refreshSession()) {
        token = await auth!.getAccessToken();
        res = await send(path, options, token);
      }
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Respuesta sin cuerpo JSON (ej. 502 de un proxy).
    }
    if (!res.ok) throw toApiError(res.status, body);
    return body as T;
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  };
}

/** Mensaje legible para mostrar al usuario a partir de cualquier error. */
export function describeError(err: unknown): string {
  if (err instanceof NetworkError)
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  if (err instanceof ApiRequestError) return err.message;
  return 'Ocurrió un error inesperado.';
}
