import { deriveListStatus } from '@/lib/list-status';

const base = { loaded: true, count: 0, syncing: false, error: null, everSynced: true };

describe('deriveListStatus', () => {
  it('cargando hasta que SQLite responda', () => {
    expect(deriveListStatus({ ...base, loaded: false })).toBe('loading');
  });

  it('con datos locales los muestra SIEMPRE, aunque haya error de red (offline-first)', () => {
    expect(deriveListStatus({ ...base, count: 3, error: 'Sin conexión' })).toBe('ready');
    expect(deriveListStatus({ ...base, count: 3, syncing: true })).toBe('ready');
  });

  it('sin datos y sincronizando → cargando', () => {
    expect(deriveListStatus({ ...base, syncing: true })).toBe('loading');
  });

  it('sin datos y con error → error (con reintento)', () => {
    expect(deriveListStatus({ ...base, error: 'Sin conexión', everSynced: false })).toBe('error');
  });

  it('sin datos tras sincronizar bien → vacío', () => {
    expect(deriveListStatus(base)).toBe('empty');
  });

  it('sin datos y aún sin primera sincronización ni error → cargando', () => {
    expect(deriveListStatus({ ...base, everSynced: false })).toBe('loading');
  });
});
