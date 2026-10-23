/**
 * Gestión de sesión (semana 10).
 *
 * - Los tokens viven SOLO en almacenamiento seguro (Keychain en iOS, Keystore en Android),
 *   nunca en AsyncStorage/SQLite ni en logs.
 * - Se guardan en llaves separadas: iOS puede rechazar valores de SecureStore mayores a ~2 KB
 *   y un idToken de Firebase (JWT) ronda 1 KB.
 * - Si no hay red al renovar, la sesión NO se cierra: la app sigue funcionando sin conexión.
 */
import type { ApiClient } from '@/services/api/client';
import { ApiRequestError, NetworkError } from '@/services/api/client';
import type { AuthResult, User } from '@/types';

/** Subconjunto de expo-secure-store; permite sustituirlo por una versión en memoria en pruebas. */
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const KEYS = {
  idToken: 'auth.idToken',
  refreshToken: 'auth.refreshToken',
  expiresAt: 'auth.expiresAt',
  user: 'auth.user',
} as const;

/** Renovar el token un poco antes de que venza para evitar peticiones que fallen por 401. */
const EXPIRY_MARGIN_MS = 60_000;

export type SessionListener = (user: User | null) => void;

export class SessionManager {
  private idToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;
  private user: User | null = null;
  private refreshing: Promise<boolean> | null = null;
  private listeners = new Set<SessionListener>();

  /**
   * @param storage almacenamiento seguro
   * @param publicApi cliente SIN hooks de autenticación (el refresh no puede depender de sí mismo)
   */
  constructor(
    private readonly storage: SecureStorage,
    private readonly publicApi: Pick<ApiClient, 'post'>,
    private readonly now: () => number = Date.now,
  ) {}

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l(this.user);
  }

  getUser(): User | null {
    return this.user;
  }

  /** Restaura la sesión guardada al abrir la app (funciona sin conexión). */
  async restore(): Promise<User | null> {
    try {
      const [idToken, refreshToken, expiresAt, user] = await Promise.all([
        this.storage.getItemAsync(KEYS.idToken),
        this.storage.getItemAsync(KEYS.refreshToken),
        this.storage.getItemAsync(KEYS.expiresAt),
        this.storage.getItemAsync(KEYS.user),
      ]);
      if (!idToken || !refreshToken || !user) return null;
      this.idToken = idToken;
      this.refreshToken = refreshToken;
      this.expiresAt = Number(expiresAt) || 0;
      this.user = JSON.parse(user) as User;
      return this.user;
    } catch {
      // Datos corruptos o Keystore invalidado: se parte de cero.
      await this.clear();
      return null;
    }
  }

  async save({ tokens, user }: AuthResult): Promise<void> {
    this.idToken = tokens.idToken;
    this.refreshToken = tokens.refreshToken;
    this.expiresAt = this.now() + tokens.expiresIn * 1000;
    this.user = user;
    await Promise.all([
      this.storage.setItemAsync(KEYS.idToken, tokens.idToken),
      this.storage.setItemAsync(KEYS.refreshToken, tokens.refreshToken),
      this.storage.setItemAsync(KEYS.expiresAt, String(this.expiresAt)),
      this.storage.setItemAsync(KEYS.user, JSON.stringify(user)),
    ]);
    this.emit();
  }

  async clear(): Promise<void> {
    this.idToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
    this.user = null;
    await Promise.all(
      Object.values(KEYS).map((k) => this.storage.deleteItemAsync(k).catch(() => {})),
    );
    this.emit();
  }

  /** Para AuthHooks: devuelve un token vigente, renovándolo si está por vencer. */
  async getAccessToken(): Promise<string | null> {
    if (!this.idToken) return null;
    if (this.now() >= this.expiresAt - EXPIRY_MARGIN_MS) await this.refresh();
    // Si el refresh falló por red, se devuelve el token actual: el servidor decidirá.
    return this.idToken;
  }

  /**
   * Renueva la sesión con el refreshToken. Una sola renovación en vuelo a la vez:
   * si varias peticiones reciben 401 juntas, comparten la misma promesa.
   */
  refresh(): Promise<boolean> {
    if (!this.refreshToken) return Promise.resolve(false);
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const result = await this.publicApi.post<AuthResult>(
        '/api/auth/refresh',
        { refreshToken: this.refreshToken },
        { auth: false },
      );
      await this.save(result);
      return true;
    } catch (err) {
      if (err instanceof NetworkError) return false; // sin red: conservar la sesión
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        await this.clear(); // refreshToken inválido o cuenta deshabilitada
      }
      return false;
    }
  }
}
