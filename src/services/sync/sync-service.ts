/**
 * Sincronización local ⇄ remota (semana 11). Estrategia offline-first:
 *
 * 1. La UI SIEMPRE lee de SQLite; nunca espera a la red.
 * 2. Las solicitudes de préstamo se guardan primero en local (sync_state = 'pending') y en la cola
 *    `outbox`. Este servicio las envía cuando hay conexión.
 * 3. Después se traen los cambios del servidor: libros desde el último cursor (incremental)
 *    y los préstamos del usuario.
 *
 * Consistencia eventual y conflictos: el servidor es la fuente de verdad ("gana el servidor").
 * Si una solicitud hecha offline ya no es válida al llegar (otro estudiante tomó el último
 * ejemplar, o ya existía una solicitud activa) la API responde 409 y el préstamo local queda
 * marcado como 'conflict' con una explicación para el usuario.
 */
import type { Repositories } from '@/db/repositories';
import { ApiRequestError, NetworkError, type ApiClient } from '@/services/api/client';
import type { Book, Loan } from '@/types';

/** Tras este número de fallos 5xx se abandona el envío y se informa al usuario. */
export const MAX_ATTEMPTS = 5;

/** Se pide al servidor un poco "hacia atrás" del cursor: el upsert es idempotente y evita perder cambios en el borde. */
const CURSOR_OVERLAP_MS = 1000;

const KEYS = { booksCursor: 'books.cursor', lastSyncAt: 'sync.lastSyncAt' } as const;

export interface SyncResult {
  pushed: number;
  conflicts: number;
  booksPulled: number;
  loansPulled: number;
}

export interface SyncDeps {
  api: Pick<ApiClient, 'get' | 'post'>;
  repos: Pick<Repositories, 'books' | 'loans' | 'outbox' | 'meta' | 'activity'>;
  now?: () => Date;
}

/** Explica al usuario, en lenguaje claro, por qué el servidor rechazó una solicitud. */
export function conflictMessage(err: ApiRequestError): string {
  switch (err.code) {
    case 'ALREADY_ACTIVE':
      return 'Ya tenías una solicitud o un préstamo activo de este libro.';
    case 'NO_COPIES':
      return 'Cuando se envió tu solicitud ya no quedaban ejemplares disponibles.';
    case 'NOT_FOUND':
      return 'El libro ya no existe en el catálogo.';
    case 'FORBIDDEN':
      return 'Tu cuenta no tiene permiso para solicitar libros.';
    default:
      return err.message;
  }
}

export function createSyncService({ api, repos, now = () => new Date() }: SyncDeps) {
  const { books, loans, outbox, meta, activity } = repos;

  /** Envía la cola en orden. Devuelve cuántas salieron y cuántas terminaron en conflicto. */
  async function pushOutbox(): Promise<{ pushed: number; conflicts: number }> {
    let pushed = 0;
    let conflicts = 0;
    for (const item of await outbox.pending()) {
      try {
        // Idempotente: la API usa clientRequestId, así que un reintento tras perder la respuesta no duplica.
        const { loan } = await api.post<{ loan: Loan }>('/api/loans', item.payload);
        await loans.upsertFromServer(loan);
        await outbox.remove(item.id);
        pushed++;
        await activity.log('sync.push', `Solicitud de "${loan.bookTitle}" enviada`);
      } catch (err) {
        if (err instanceof NetworkError) throw err; // sigue sin conexión: se conserva toda la cola
        if (err instanceof ApiRequestError) {
          if (err.status === 401) throw err; // sesión inválida: no es un conflicto del préstamo
          const retryable = err.status >= 500 || err.status === 429;
          if (retryable && item.attempts + 1 < MAX_ATTEMPTS) {
            await outbox.recordFailure(item.id, err.message);
            throw err; // se reintenta en la próxima sincronización
          }
          const message = retryable
            ? 'El servidor no pudo procesar la solicitud. Inténtalo de nuevo.'
            : conflictMessage(err);
          await loans.markConflict(item.payload.clientRequestId, message);
          await outbox.remove(item.id);
          conflicts++;
          await activity.log('sync.conflict', `${err.code}: ${message}`);
          continue;
        }
        throw err;
      }
    }
    return { pushed, conflicts };
  }

  async function pullBooks(): Promise<number> {
    const cursor = await meta.get(KEYS.booksCursor);
    const query = cursor ? `?updatedSince=${encodeURIComponent(cursor)}` : '';
    const res = await api.get<{ books: Book[]; serverTime: string }>(`/api/books${query}`);
    await books.upsertMany(res.books);
    const next = new Date(new Date(res.serverTime).getTime() - CURSOR_OVERLAP_MS).toISOString();
    await meta.set(KEYS.booksCursor, next);
    return res.books.length;
  }

  async function pullLoans(): Promise<number> {
    const res = await api.get<{ loans: Loan[] }>('/api/loans');
    await loans.upsertManyFromServer(res.loans);
    return res.loans.length;
  }

  return {
    /** Ciclo completo. Lanza NetworkError/ApiRequestError si no pudo terminar (lo ya hecho se conserva). */
    async run(): Promise<SyncResult> {
      const { pushed, conflicts } = await pushOutbox();
      const booksPulled = await pullBooks();
      const loansPulled = await pullLoans();
      await meta.set(KEYS.lastSyncAt, now().toISOString());
      return { pushed, conflicts, booksPulled, loansPulled };
    },
    async lastSyncAt(): Promise<string | null> {
      return meta.get(KEYS.lastSyncAt);
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
