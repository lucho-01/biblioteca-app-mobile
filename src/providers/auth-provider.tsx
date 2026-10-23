import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { publicApi, session } from '@/services/api';
import { createAuthService } from '@/services/auth/auth-service';
import type { User } from '@/types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const authService = createAuthService(publicApi, session);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    // Cualquier cambio de sesión (login, logout, o cierre forzado porque el refreshToken ya no sirve)
    // actualiza el estado; las rutas protegidas reaccionan solas.
    const unsubscribe = session.subscribe((next) => {
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    session.restore().then((restored) => {
      if (!active) return;
      setUser(restored);
      setStatus(restored ? 'signedIn' : 'signedOut');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await authService.signUp(name, email, password);
  }, []);

  const signOut = useCallback(() => authService.signOut(), []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
