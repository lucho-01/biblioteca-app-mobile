import type { OutboxItem } from '@/db/repositories';
import type { SyncDeps } from '@/services/sync/sync-service';
import type { Book, Loan } from '@/types';

export function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'srv-1',
    bookId: 'b1',
    bookTitle: 'Clean Code',
    userId: 'u1',
    userEmail: 'a@b.co',
    userName: 'Ana',
    status: 'requested',
    clientRequestId: 'req-00000001',
    requestedAt: '2026-10-12T10:00:00.000Z',
    resolvedAt: null,
    dueDate: null,
    returnedAt: null,
    updatedAt: '2026-10-12T10:00:00.000Z',
    ...overrides,
  };
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    category: 'Tecnología',
    year: 2008,
    description: 'x',
    totalCopies: 2,
    availableCopies: 2,
    coverUrl: null,
    updatedAt: '2026-10-12T10:00:00.000Z',
    ...overrides,
  };
}

/** Repositorios en memoria con la misma forma que los de SQLite, para probar la sincronización sin base de datos. */
export function makeFakeRepos(initialOutbox: OutboxItem[] = []) {
  const state = {
    outbox: [...initialOutbox],
    books: [] as Book[],
    serverLoans: [] as Loan[],
    conflicts: [] as { clientRequestId: string; message: string }[],
    meta: new Map<string, string>(),
    log: [] as string[],
  };
  const repos = {
    books: {
      upsertMany: async (b: Book[]) => void state.books.push(...b),
    },
    loans: {
      upsertFromServer: async (l: Loan) => void state.serverLoans.push(l),
      upsertManyFromServer: async (l: Loan[]) => void state.serverLoans.push(...l),
      markConflict: async (clientRequestId: string, message: string) =>
        void state.conflicts.push({ clientRequestId, message }),
    },
    outbox: {
      pending: async () => [...state.outbox],
      remove: async (id: number) => void (state.outbox = state.outbox.filter((i) => i.id !== id)),
      recordFailure: async (id: number, message: string) =>
        void (state.outbox = state.outbox.map((i) =>
          i.id === id ? { ...i, attempts: i.attempts + 1, lastError: message } : i,
        )),
    },
    meta: {
      get: async (k: string) => state.meta.get(k) ?? null,
      set: async (k: string, v: string) => void state.meta.set(k, v),
    },
    activity: { log: async (_k: string, d: string) => void state.log.push(d) },
  };
  return { state, repos: repos as unknown as SyncDeps['repos'] };
}

export function outboxItem(id: number, clientRequestId: string, attempts = 0): OutboxItem {
  return {
    id,
    kind: 'request_loan',
    payload: { bookId: 'b1', clientRequestId },
    attempts,
    lastError: null,
    createdAt: '2026-10-12T10:00:00.000Z',
  };
}
