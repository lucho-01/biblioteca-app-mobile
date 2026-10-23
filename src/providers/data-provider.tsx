import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { createRepositories, type Repositories } from '@/db/repositories';
import { api } from '@/services/api';
import { describeError } from '@/services/api/client';
import { createLoanService } from '@/services/loans/loan-service';
import { createSyncService } from '@/services/sync/sync-service';
import type { Book, LoanAction, LocalLoan } from '@/types';

import { useAuth } from './auth-provider';

interface DataContextValue {
  repos: Repositories;
  /** Hay red y el dispositivo puede salir a internet. */
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  /** Mensaje del último intento fallido de sincronización, o null. */
  lastError: string | null;
  /** Cuántos cambios hechos sin conexión esperan ser enviados. */
  pendingCount: number;
  /** Se incrementa cada vez que cambia SQLite; los hooks de lectura lo usan para volver a consultar. */
  dataVersion: number;
  syncNow: () => Promise<void>;
  requestLoan: (book: Book) => Promise<LocalLoan>;
  transitionLoan: (loanId: string, action: LoanAction) => Promise<void>;
  dismissLoan: (loanId: string) => Promise<void>;
  notifyChanged: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { status, user } = useAuth();
  const repos = useMemo(() => createRepositories(db), [db]);
  const syncService = useMemo(() => createSyncService({ api, repos }), [repos]);
  const loanService = useMemo(() => createLoanService({ api, repos, newId: randomUUID }), [repos]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const wasOnline = useRef(true);
  const uid = user?.uid ?? null;

  const refreshMeta = useCallback(async () => {
    setPendingCount(await repos.outbox.count());
    setLastSyncAt(await syncService.lastSyncAt());
  }, [repos, syncService]);

  const notifyChanged = useCallback(() => {
    setDataVersion((v) => v + 1);
    void refreshMeta();
  }, [refreshMeta]);

  /** Un solo ciclo de sincronización a la vez: llamadas simultáneas comparten la misma promesa. */
  const syncNow = useCallback(async () => {
    if (!uid) return;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setSyncing(true);
      try {
        const result = await syncService.run();
        setLastError(null);
        if (result.pushed + result.conflicts > 0) {
          await repos.activity.log(
            'sync',
            `Enviadas ${result.pushed}, en conflicto ${result.conflicts}`,
          );
        }
      } catch (err) {
        setLastError(describeError(err));
      } finally {
        setSyncing(false);
        inFlight.current = null;
        notifyChanged();
      }
    })();
    inFlight.current = run;
    return run;
  }, [uid, syncService, repos, notifyChanged]);

  // Conectividad: al volver la red se vacía la cola automáticamente.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline && !wasOnline.current) void syncNow();
      wasOnline.current = isOnline;
    });
    return unsubscribe;
  }, [syncNow]);

  // También al volver a primer plano.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  // Al iniciar sesión: proteger los datos de otra cuenta y sincronizar.
  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    (async () => {
      if (uid) {
        // Los préstamos y la cola pertenecen a UNA cuenta. Si cambió el usuario (p. ej. se cerró la
        // sesión a la fuerza con cambios pendientes), se descartan para no enviar solicitudes a nombre de otro.
        const owner = await repos.meta.get('owner.uid');
        if (owner && owner !== uid) {
          await repos.loans.clear();
          await repos.outbox.clear();
        }
        await repos.meta.set('owner.uid', uid);
        if (cancelled) return;
        await refreshMeta();
        notifyChanged();
        await syncNow();
      } else {
        // Sesión cerrada: se borran los datos privados del dispositivo. El catálogo (público) se conserva.
        await repos.loans.clear();
        await repos.outbox.clear();
        await repos.meta.clear();
        if (cancelled) return;
        setLastSyncAt(null);
        setLastError(null);
        notifyChanged();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, uid, repos, refreshMeta, notifyChanged, syncNow]);

  const requestLoan = useCallback(
    async (book: Book) => {
      if (!user) throw new Error('Sesión no iniciada');
      const loan = await loanService.requestLoan(user, book);
      notifyChanged();
      void syncNow(); // intenta enviar ya; si no hay red queda en la cola
      return loan;
    },
    [user, loanService, notifyChanged, syncNow],
  );

  const transitionLoan = useCallback(
    async (loanId: string, action: LoanAction) => {
      await loanService.transition(loanId, action);
      notifyChanged();
      void syncNow(); // el stock del libro cambió: se actualiza el catálogo
    },
    [loanService, notifyChanged, syncNow],
  );

  const dismissLoan = useCallback(
    async (loanId: string) => {
      await loanService.dismiss(loanId);
      notifyChanged();
    },
    [loanService, notifyChanged],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      repos,
      online,
      syncing,
      lastSyncAt,
      lastError,
      pendingCount,
      dataVersion,
      syncNow,
      requestLoan,
      transitionLoan,
      dismissLoan,
      notifyChanged,
    }),
    [
      repos,
      online,
      syncing,
      lastSyncAt,
      lastError,
      pendingCount,
      dataVersion,
      syncNow,
      requestLoan,
      transitionLoan,
      dismissLoan,
      notifyChanged,
    ],
  );

  return <DataContext value={value}>{children}</DataContext>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
