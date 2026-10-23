/**
 * Hooks de lectura. La UI nunca llama a la API directamente para listar: lee SQLite, y la
 * sincronización (DataProvider) mantiene SQLite al día. Cuando cambia `dataVersion` se vuelve a consultar.
 */
import { useEffect, useState } from 'react';

import { deriveListStatus, type ListStatus } from '@/lib/list-status';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';
import type { Book, LocalLoan } from '@/types';

/** Ejecuta una consulta local y la repite cuando cambian los datos. */
function useLocalQuery<T>(
  query: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | null; loaded: boolean } {
  const { dataVersion } = useData();
  const [state, setState] = useState<{ data: T | null; loaded: boolean }>({
    data: null,
    loaded: false,
  });
  useEffect(() => {
    let active = true;
    query().then((data) => {
      if (active) setState({ data, loaded: true });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, dataVersion]);
  return state;
}

export function useBooks(filters: { q: string; category: string | null }) {
  const { repos, syncing, lastError, lastSyncAt } = useData();
  const { data, loaded } = useLocalQuery(
    () => repos.books.list({ q: filters.q, category: filters.category }),
    [repos, filters.q, filters.category],
  );
  const books: Book[] = data ?? [];
  const status: ListStatus = deriveListStatus({
    loaded,
    count: books.length,
    syncing,
    error: lastError,
    everSynced: lastSyncAt !== null,
  });
  return { books, status };
}

export function useCategories(): string[] {
  const { repos } = useData();
  const { data } = useLocalQuery(() => repos.books.categories(), [repos]);
  return data ?? [];
}

export function useBook(id: string) {
  const { repos } = useData();
  const { data, loaded } = useLocalQuery(() => repos.books.getById(id), [repos, id]);
  return { book: data, loaded };
}

/** Estudiante: sus préstamos. Bibliotecario: todos. */
export function useLoans() {
  const { repos, syncing, lastError, lastSyncAt } = useData();
  const { user } = useAuth();
  const scope = user?.role === 'librarian' ? null : (user?.uid ?? '');
  const { data, loaded } = useLocalQuery(() => repos.loans.list(scope), [repos, scope]);
  const loans: LocalLoan[] = data ?? [];
  const status: ListStatus = deriveListStatus({
    loaded,
    count: loans.length,
    syncing,
    error: lastError,
    everSynced: lastSyncAt !== null,
  });
  return { loans, status };
}

/** Último préstamo del usuario actual para un libro (para mostrar "ya solicitado"). */
export function useMyLoanForBook(bookId: string) {
  const { repos } = useData();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { data } = useLocalQuery(
    () => repos.loans.latestForBook(uid, bookId),
    [repos, uid, bookId],
  );
  return data;
}
