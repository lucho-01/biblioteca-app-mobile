import type { ApiClient } from '@/services/api/client';
import type { AuthResult } from '@/types';

import type { SessionManager } from './session-manager';

/** Validación en el cliente: mejora la experiencia, pero la API vuelve a validar todo. */
export function validateCredentials(
  input: { email: string; password: string; name?: string },
  mode: 'signIn' | 'signUp',
) {
  const errors: { name?: string; email?: string; password?: string } = {};
  if (mode === 'signUp' && (input.name ?? '').trim().length < 2) {
    errors.name = 'Escribe tu nombre (mínimo 2 letras)';
  }
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) {
    errors.email = 'Escribe un correo válido';
  }
  if (mode === 'signUp' ? input.password.length < 6 : input.password.length === 0) {
    errors.password =
      mode === 'signUp'
        ? 'La contraseña debe tener al menos 6 caracteres'
        : 'Escribe tu contraseña';
  }
  return errors;
}

export function createAuthService(publicApi: Pick<ApiClient, 'post'>, session: SessionManager) {
  return {
    async signIn(email: string, password: string) {
      const result = await publicApi.post<AuthResult>(
        '/api/auth/login',
        { email: email.trim(), password },
        { auth: false },
      );
      await session.save(result);
      return result.user;
    },
    async signUp(name: string, email: string, password: string) {
      const result = await publicApi.post<AuthResult>(
        '/api/auth/register',
        { displayName: name.trim(), email: email.trim(), password },
        { auth: false },
      );
      await session.save(result);
      return result.user;
    },
    signOut: () => session.clear(),
  };
}
