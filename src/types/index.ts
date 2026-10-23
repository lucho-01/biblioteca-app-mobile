export type Role = 'student' | 'librarian';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

export interface TokenSet {
  idToken: string;
  refreshToken: string;
  /** Segundos de vigencia del idToken. */
  expiresIn: number;
}

export interface AuthResult {
  tokens: TokenSet;
  user: User;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  year: number;
  description: string;
  totalCopies: number;
  availableCopies: number;
  /** Ruta relativa a la API o null. */
  coverUrl: string | null;
  updatedAt: string;
}

export type LoanStatus = 'requested' | 'approved' | 'rejected' | 'returned';
export type LoanAction = 'approve' | 'reject' | 'return';

/**
 * Estado de sincronización de un préstamo guardado en SQLite:
 * - synced: coincide con el servidor
 * - pending: creado sin conexión, esperando en la cola (outbox)
 * - conflict: el servidor lo rechazó al sincronizar (gana el servidor); ver `syncError`
 */
export type SyncState = 'synced' | 'pending' | 'conflict';

export interface Loan {
  id: string;
  bookId: string;
  bookTitle: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: LoanStatus;
  clientRequestId: string;
  requestedAt: string;
  resolvedAt: string | null;
  dueDate: string | null;
  returnedAt: string | null;
  updatedAt: string;
}

export interface LocalLoan extends Loan {
  syncState: SyncState;
  syncError: string | null;
}
