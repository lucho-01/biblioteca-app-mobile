/**
 * Escenario completo de la semana 11 con SQL real (node:sqlite) y una API simulada:
 * sin conexión → solicitar → se guarda local + cola → vuelve la red → se envía → llega la versión del servidor.
 */
import { makeBook, makeLoan } from '../test-utils/fakes';
import { createTestDb } from '../test-utils/node-sqlite';
import { migrateDbIfNeeded } from '@/db/migrations';
import { createRepositories } from '@/db/repositories';
import { ApiRequestError, NetworkError } from '@/services/api/client';
import { createLoanService, LoanRuleError } from '@/services/loans/loan-service';
import { createSyncService } from '@/services/sync/sync-service';
import type { Loan, User } from '@/types';

const student: User = { uid: 'u1', email: 'a@b.co', name: 'Ana', role: 'student' };

async function setup() {
  const db = createTestDb();
  await migrateDbIfNeeded(db);
  const repos = createRepositories(db);
  let n = 0;
  const loanService = createLoanService({
    api: { patch: jest.fn() },
    repos,
    newId: () => `req-${String(++n).padStart(8, '0')}`,
  });
  return { repos, loanService };
}

/** API simulada que se comporta como la real: idempotente por clientRequestId y con control de ejemplares. */
function fakeServer(options: { online: boolean; copies: number }) {
  const created = new Map<string, Loan>();
  const server = {
    options,
    post: jest.fn(async (_path: string, body: { bookId: string; clientRequestId: string }) => {
      if (!options.online) throw new NetworkError();
      const existing = created.get(body.clientRequestId);
      if (existing) return { loan: existing };
      if (options.copies <= 0)
        throw new ApiRequestError(409, 'NO_COPIES', 'No hay ejemplares disponibles');
      const loan = makeLoan({
        id: `srv-${created.size + 1}`,
        clientRequestId: body.clientRequestId,
        bookId: body.bookId,
      });
      created.set(body.clientRequestId, loan);
      return { loan };
    }),
    get: jest.fn(async (path: string) => {
      if (!options.online) throw new NetworkError();
      return path.startsWith('/api/books')
        ? {
            books: [makeBook({ availableCopies: options.copies })],
            serverTime: '2026-10-12T12:00:00.000Z',
          }
        : { loans: [...created.values()] };
    }),
  };
  return server;
}

describe('flujo offline-first', () => {
  it('solicitar sin red → pendiente → al reconectar se envía y se reemplaza por la del servidor', async () => {
    const { repos, loanService } = await setup();
    await repos.books.upsertMany([makeBook()]);
    const server = fakeServer({ online: false, copies: 2 });
    const sync = createSyncService({ api: server as never, repos });

    // 1) Sin conexión: la solicitud se acepta de inmediato.
    const loan = await loanService.requestLoan(student, (await repos.books.getById('b1'))!);
    expect(loan.syncState).toBe('pending');
    expect(await repos.outbox.count()).toBe(1);

    // 2) Intento de sincronizar sin red: nada se pierde.
    await expect(sync.run()).rejects.toBeInstanceOf(NetworkError);
    expect(await repos.outbox.count()).toBe(1);
    expect((await repos.loans.list('u1'))[0].syncState).toBe('pending');

    // 3) Vuelve la red.
    server.options.online = true;
    const result = await sync.run();
    expect(result.pushed).toBe(1);
    expect(await repos.outbox.count()).toBe(0);
    const loans = await repos.loans.list('u1');
    expect(loans).toHaveLength(1); // sin duplicados
    expect(loans[0]).toMatchObject({ id: 'srv-1', syncState: 'synced' });
  });

  it('reintentar tras perder la respuesta no duplica la solicitud en el servidor (idempotencia)', async () => {
    const { repos, loanService } = await setup();
    await repos.books.upsertMany([makeBook()]);
    const server = fakeServer({ online: true, copies: 2 });
    const sync = createSyncService({ api: server as never, repos });

    await loanService.requestLoan(student, (await repos.books.getById('b1'))!);
    await sync.run();

    // Simula que la respuesta se perdió: la cola vuelve a tener el mismo clientRequestId.
    const [loan] = await repos.loans.list('u1');
    await repos.outbox.enqueue('request_loan', {
      bookId: 'b1',
      clientRequestId: loan.clientRequestId,
    });
    await sync.run();
    expect(await repos.loans.list('u1')).toHaveLength(1);
  });

  it('conflicto: otro estudiante tomó el último ejemplar mientras estabas offline → gana el servidor', async () => {
    const { repos, loanService } = await setup();
    await repos.books.upsertMany([makeBook({ availableCopies: 1 })]); // el catálogo guardado aún muestra 1
    const server = fakeServer({ online: false, copies: 1 });
    const sync = createSyncService({ api: server as never, repos });

    await loanService.requestLoan(student, (await repos.books.getById('b1'))!);
    server.options.online = true;
    server.options.copies = 0; // mientras tanto se agotaron

    const result = await sync.run();
    expect(result.conflicts).toBe(1);
    expect(await repos.outbox.count()).toBe(0);
    const [loan] = await repos.loans.list('u1');
    expect(loan.syncState).toBe('conflict');
    expect(loan.syncError).toMatch(/ejemplares/i);
    // El catálogo ya refleja la realidad del servidor.
    expect((await repos.books.getById('b1'))?.availableCopies).toBe(0);
    // Y el usuario puede volver a intentarlo cuando haya stock (el conflicto no bloquea).
    expect(await repos.loans.hasActiveForBook('u1', 'b1')).toBe(false);
  });

  it('reglas locales: no se puede pedir dos veces el mismo libro ni uno sin ejemplares', async () => {
    const { repos, loanService } = await setup();
    await repos.books.upsertMany([
      makeBook({ id: 'b1' }),
      makeBook({ id: 'b2', availableCopies: 0 }),
    ]);
    await loanService.requestLoan(student, (await repos.books.getById('b1'))!);
    await expect(
      loanService.requestLoan(student, (await repos.books.getById('b1'))!),
    ).rejects.toBeInstanceOf(LoanRuleError);
    await expect(
      loanService.requestLoan(student, (await repos.books.getById('b2'))!),
    ).rejects.toThrow(/disponibles/);
    expect(await repos.outbox.count()).toBe(1);
  });
});
