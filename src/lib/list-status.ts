export type ListStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface ListStatusInput {
  /** La consulta local a SQLite ya respondió al menos una vez. */
  loaded: boolean;
  count: number;
  syncing: boolean;
  /** Mensaje del último intento de sincronización fallido (null si el último salió bien). */
  error: string | null;
  /** Ya hubo al menos una sincronización exitosa en este dispositivo. */
  everSynced: boolean;
}

/**
 * Los cuatro estados de una lista que consume API (semana 9): cargando, listo, vacío y error.
 * Con caché local (semana 11) hay una regla clave: si hay datos guardados, SIEMPRE se muestran,
 * aunque la red falle; el fallo solo se comunica con un aviso (OfflineBanner).
 */
export function deriveListStatus({
  loaded,
  count,
  syncing,
  error,
  everSynced,
}: ListStatusInput): ListStatus {
  if (!loaded) return 'loading';
  if (count > 0) return 'ready';
  if (syncing) return 'loading';
  if (error) return 'error';
  // Sin datos ni error: o aún no se sincronizó nunca (se mostrará cargando) o el catálogo está realmente vacío.
  return everSynced ? 'empty' : 'loading';
}
