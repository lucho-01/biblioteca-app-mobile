import { makeBook, makeFakeRepos, makeLoan, outboxItem } from '../test-utils/fakes';
import { ApiRequestError, NetworkError } from '@/services/api/client';
import { createSyncService, MAX_ATTEMPTS } from '@/services/sync/sync-service';

const NOW = new Date('2026-10-12T12:00:00.000Z');

function setup(
  opts: { outbox?: ReturnType<typeof outboxItem>[]; post?: jest.Mock; get?: jest.Mock } = {},
) {
  const { state, repos } = makeFakeRepos(opts.outbox ?? []);
  const get =
    opts.get ??
    jest.fn(async (path: string) =>
      path.startsWith('/api/books')
        ? { books: [makeBook()], categories: [], serverTime: '2026-10-12T11:59:59.000Z' }
        : { loans: [makeLoan()] },
    );
  const post = opts.post ?? jest.fn();
  const sync = createSyncService({ api: { get, post } as never, repos, now: () => NOW });
  return { state, get, post, sync };
}

describe('sync: enviar la cola (outbox)', () => {
  it('envía la solicitud pendiente, la quita de la cola y guarda la versión del servidor', async () => {
    const post = jest.fn().mockResolvedValue({ loan: makeLoan({ id: 'srv-9' }) });
    const { state, sync } = setup({ outbox: [outboxItem(1, 'req-00000001')], post });
    const result = await sync.run();
    expect(post).toHaveBeenCalledWith('/api/loans', {
      bookId: 'b1',
      clientRequestId: 'req-00000001',
    });
    expect(result.pushed).toBe(1);
    expect(state.outbox).toHaveLength(0);
    expect(state.serverLoans.some((l) => l.id === 'srv-9')).toBe(true);
  });

  it('respeta el orden de creación (FIFO)', async () => {
    const post = jest.fn().mockImplementation(async (_p, body) => ({
      loan: makeLoan({ clientRequestId: body.clientRequestId }),
    }));
    const { sync } = setup({
      outbox: [outboxItem(1, 'req-aaaaaaaa'), outboxItem(2, 'req-bbbbbbbb')],
      post,
    });
    await sync.run();
    expect(post.mock.calls.map((c) => c[1].clientRequestId)).toEqual([
      'req-aaaaaaaa',
      'req-bbbbbbbb',
    ]);
  });

  it('sin conexión conserva TODA la cola y propaga NetworkError', async () => {
    const post = jest.fn().mockRejectedValue(new NetworkError());
    const { state, sync } = setup({
      outbox: [outboxItem(1, 'req-00000001'), outboxItem(2, 'req-00000002')],
      post,
    });
    await expect(sync.run()).rejects.toBeInstanceOf(NetworkError);
    expect(state.outbox).toHaveLength(2);
    expect(state.conflicts).toHaveLength(0);
    expect(post).toHaveBeenCalledTimes(1); // no insiste con las demás
  });

  it('409 NO_COPIES → conflicto: gana el servidor, se informa y se saca de la cola', async () => {
    const post = jest
      .fn()
      .mockRejectedValue(new ApiRequestError(409, 'NO_COPIES', 'No hay ejemplares disponibles'));
    const { state, sync } = setup({ outbox: [outboxItem(1, 'req-00000001')], post });
    const result = await sync.run();
    expect(result.conflicts).toBe(1);
    expect(state.outbox).toHaveLength(0);
    expect(state.conflicts[0]).toMatchObject({ clientRequestId: 'req-00000001' });
    expect(state.conflicts[0].message).toMatch(/ejemplares/i);
  });

  it('un conflicto no bloquea las solicitudes siguientes', async () => {
    const post = jest
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(409, 'ALREADY_ACTIVE', 'x'))
      .mockResolvedValueOnce({ loan: makeLoan({ id: 'srv-2', clientRequestId: 'req-bbbbbbbb' }) });
    const { state, sync } = setup({
      outbox: [outboxItem(1, 'req-aaaaaaaa'), outboxItem(2, 'req-bbbbbbbb')],
      post,
    });
    const result = await sync.run();
    expect(result).toMatchObject({ pushed: 1, conflicts: 1 });
    expect(state.outbox).toHaveLength(0);
  });

  it('error 5xx: reintenta después (suma intentos) sin descartar la solicitud', async () => {
    const post = jest.fn().mockRejectedValue(new ApiRequestError(503, 'INTERNAL_ERROR', 'caído'));
    const { state, sync } = setup({ outbox: [outboxItem(1, 'req-00000001')], post });
    await expect(sync.run()).rejects.toBeInstanceOf(ApiRequestError);
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0].attempts).toBe(1);
    expect(state.conflicts).toHaveLength(0);
  });

  it(`tras ${MAX_ATTEMPTS} fallos 5xx se abandona y se informa al usuario`, async () => {
    const post = jest.fn().mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'x'));
    const { state, sync } = setup({
      outbox: [outboxItem(1, 'req-00000001', MAX_ATTEMPTS - 1)],
      post,
    });
    const result = await sync.run();
    expect(result.conflicts).toBe(1);
    expect(state.outbox).toHaveLength(0);
  });

  it('401 (sesión inválida) no se confunde con un conflicto del préstamo', async () => {
    const post = jest.fn().mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'x'));
    const { state, sync } = setup({ outbox: [outboxItem(1, 'req-00000001')], post });
    await expect(sync.run()).rejects.toMatchObject({ status: 401 });
    expect(state.outbox).toHaveLength(1);
    expect(state.conflicts).toHaveLength(0);
  });
});

describe('sync: traer cambios del servidor', () => {
  it('la primera vez pide todos los libros y guarda el cursor (con 1 s de solape)', async () => {
    const { get, state, sync } = setup();
    await sync.run();
    expect(get).toHaveBeenCalledWith('/api/books');
    expect(state.books).toHaveLength(1);
    expect(state.meta.get('books.cursor')).toBe('2026-10-12T11:59:58.000Z');
    expect(state.meta.get('sync.lastSyncAt')).toBe(NOW.toISOString());
  });

  it('después pide solo lo modificado desde el cursor (sincronización incremental)', async () => {
    const { get, sync, state } = setup();
    state.meta.set('books.cursor', '2026-10-12T09:00:00.000Z');
    await sync.run();
    expect(get).toHaveBeenCalledWith('/api/books?updatedSince=2026-10-12T09%3A00%3A00.000Z');
  });

  it('si la descarga falla NO avanza el cursor ni marca la sincronización como exitosa', async () => {
    const get = jest.fn().mockRejectedValue(new NetworkError());
    const { state, sync } = setup({ get });
    state.meta.set('books.cursor', 'viejo');
    await expect(sync.run()).rejects.toBeInstanceOf(NetworkError);
    expect(state.meta.get('books.cursor')).toBe('viejo');
    expect(state.meta.has('sync.lastSyncAt')).toBe(false);
  });
});
