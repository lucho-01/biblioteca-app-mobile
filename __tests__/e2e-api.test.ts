/**
 * Integración REAL: el código de la app (cliente HTTP, sesión, SQLite, cola y sincronización)
 * contra library_api + Firebase. Solo se ejecuta si defines la URL de la API y las credenciales de
 * un estudiante y un bibliotecario TUYOS (por variables de entorno: nada queda escrito en el repo):
 *
 * (en library_api) pnpm seed && pnpm dev
 * (en library_app) E2E_API_URL=http://localhost:3000 \
 *   E2E_STUDENT_EMAIL=... E2E_STUDENT_PASSWORD=... \
 *   E2E_LIBRARIAN_EMAIL=... E2E_LIBRARIAN_PASSWORD=... npx jest e2e-api
 * (en library_api) pnpm reset-demo ← deja los préstamos como al inicio
 */
import { randomUUID } from 'node:crypto';

import { nodeFetch } from '../test-utils/node-fetch';
import { createTestDb } from '../test-utils/node-sqlite';
import { migrateDbIfNeeded } from '@/db/migrations';
import { createRepositories } from '@/db/repositories';
import { createApiClient } from '@/services/api/client';
import { createAuthService } from '@/services/auth/auth-service';
import { SessionManager, type SecureStorage } from '@/services/auth/session-manager';
import { createLoanService } from '@/services/loans/loan-service';
import { createSyncService } from '@/services/sync/sync-service';

const BASE = process.env.E2E_API_URL;
const STUDENT = {
  email: process.env.E2E_STUDENT_EMAIL ?? '',
  password: process.env.E2E_STUDENT_PASSWORD ?? '',
};
const LIBRARIAN = {
  email: process.env.E2E_LIBRARIAN_EMAIL ?? '',
  password: process.env.E2E_LIBRARIAN_PASSWORD ?? '',
};
const configured =
  BASE && STUDENT.email && STUDENT.password && LIBRARIAN.email && LIBRARIAN.password;
const maybe = configured ? describe : describe.skip;

class MemoryStorage implements SecureStorage {
  data = new Map<string, string>();
  getItemAsync = async (k: string) => this.data.get(k) ?? null;
  setItemAsync = async (k: string, v: string) => void this.data.set(k, v);
  deleteItemAsync = async (k: string) => void this.data.delete(k);
}

/** Construye una "instalación" completa de la app: sesión + API + BD local + servicios. */
async function installApp(credentials: { email: string; password: string }) {
  const publicApi = createApiClient({ baseUrl: BASE!, timeoutMs: 15_000, fetchImpl: nodeFetch });
  const session = new SessionManager(new MemoryStorage(), publicApi);
  const api = createApiClient({
    baseUrl: BASE!,
    timeoutMs: 15_000,
    fetchImpl: nodeFetch,
    auth: {
      getAccessToken: () => session.getAccessToken(),
      refreshSession: () => session.refresh(),
    },
  });
  const db = createTestDb();
  await migrateDbIfNeeded(db);
  const repos = createRepositories(db);
  const user = await createAuthService(publicApi, session).signIn(
    credentials.email,
    credentials.password,
  );
  return {
    user,
    session,
    repos,
    api,
    sync: createSyncService({ api, repos }),
    loans: createLoanService({ api, repos, newId: randomUUID }),
  };
}

maybe('app ⇄ API real', () => {
  jest.setTimeout(60_000);

  it('el estudiante inicia sesión, sincroniza el catálogo y solicita un libro "sin conexión"', async () => {
    const app = await installApp(STUDENT);
    expect(app.user.role).toBe('student');

    // Primera sincronización: catálogo completo en SQLite.
    const first = await app.sync.run();
    expect(first.booksPulled).toBe(10);
    expect(await app.repos.books.list()).toHaveLength(10);
    expect((await app.repos.books.list({ q: 'colera' })).map((b) => b.title)).toEqual([
      'El amor en los tiempos del cólera',
    ]);

    // Segunda: incremental, no vuelve a bajar nada.
    expect((await app.sync.run()).booksPulled).toBe(0);

    // "Sin conexión": solo se guarda local + cola (no se llama a sync).
    const book = (await app.repos.books.getById('pragmatic-programmer'))!;
    const pending = await app.loans.requestLoan(app.user, book);
    expect(pending.syncState).toBe('pending');
    expect(await app.repos.outbox.count()).toBe(1);

    // "Vuelve la red": se envía y el préstamo local es reemplazado por el del servidor.
    const result = await app.sync.run();
    expect(result.pushed).toBe(1);
    expect(await app.repos.outbox.count()).toBe(0);
    const mine = await app.repos.loans.list(app.user.uid);
    expect(mine).toHaveLength(1);
    expect(mine[0].id.startsWith('local-')).toBe(false);
    expect(mine[0]).toMatchObject({
      bookId: 'pragmatic-programmer',
      status: 'requested',
      syncState: 'synced',
    });

    // El bibliotecario aprueba desde su propia instalación; el estudiante lo ve al sincronizar.
    const librarian = await installApp(LIBRARIAN);
    expect(librarian.user.role).toBe('librarian');
    await librarian.sync.run();
    const toManage = (await librarian.repos.loans.list(null)).find((l) => l.id === mine[0].id);
    expect(toManage?.status).toBe('requested');

    const approved = await librarian.loans.transition(mine[0].id, 'approve');
    expect(approved.status).toBe('approved');
    await app.sync.run();
    expect((await app.repos.loans.list(app.user.uid))[0]).toMatchObject({ status: 'approved' });
    expect((await app.repos.books.getById('pragmatic-programmer'))?.availableCopies).toBe(
      book.availableCopies - 1,
    );

    await librarian.loans.transition(mine[0].id, 'return');
    await app.sync.run();
    expect((await app.repos.loans.list(app.user.uid))[0].status).toBe('returned');
    expect((await app.repos.books.getById('pragmatic-programmer'))?.availableCopies).toBe(
      book.availableCopies,
    );
  });

  it('un estudiante no puede ejecutar acciones de bibliotecario (403 desde el cliente de la app)', async () => {
    const app = await installApp(STUDENT);
    await expect(
      app.api.patch('/api/loans/lo-que-sea', { action: 'approve' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('con un token vencido la app se recupera sola (401 → refresh → reintento)', async () => {
    const app = await installApp(STUDENT);
    // Corrompe el token guardado en memoria para forzar un 401 real del servidor.
    (app.session as unknown as { idToken: string }).idToken = 'token.invalido.xyz';
    (app.session as unknown as { expiresAt: number }).expiresAt = Date.now() + 3_600_000; // "parece" vigente
    await expect(app.api.get('/api/auth/me')).resolves.toMatchObject({
      user: { email: STUDENT.email.toLowerCase() },
    });
  });
});
