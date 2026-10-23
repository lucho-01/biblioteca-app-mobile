import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migraciones básicas con PRAGMA user_version.
 *
 * SQLite guarda un entero (user_version) dentro del archivo de la base de datos.
 * Al abrir la app comparamos ese número con DATABASE_VERSION y aplicamos, en orden,
 * solo las migraciones que falten. Cada migración nueva se agrega como un `if` más y
 * se sube DATABASE_VERSION; NUNCA se edita una migración que ya salió en una versión publicada.
 */
export const DATABASE_VERSION = 2;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  // WAL permite leer mientras se escribe (la UI consulta mientras la sincronización inserta).
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
CREATE TABLE books (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  description TEXT NOT NULL,
  total_copies INTEGER NOT NULL,
  available_copies INTEGER NOT NULL,
  cover_url TEXT,
  updated_at TEXT NOT NULL,
  search_text TEXT NOT NULL -- título + autor sin tildes ni mayúsculas, para buscar
);
CREATE TABLE loans (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL,
  book_title TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','approved','rejected','returned')),
  client_request_id TEXT NOT NULL UNIQUE,
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  due_date TEXT,
  returned_at TEXT,
  updated_at TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced','pending','conflict')),
  sync_error TEXT
);
-- Cola de cambios hechos sin conexión, en orden de creación.
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
-- Clave/valor: cursor de sincronización, etc.
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
    });
    version = 1;
  }

  if (version < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
CREATE INDEX idx_books_category ON books (category);
CREATE INDEX idx_loans_user ON loans (user_id, requested_at DESC);
CREATE INDEX idx_loans_book ON loans (book_id);
-- Trazabilidad (semana 12): qué hizo la app con servicios del dispositivo y de sincronización.
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);
    });
    version = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
