/** `fetch` real sobre node:http: el entorno de jest-expo sustituye el fetch global por un mock. */
import http from 'node:http';
import https from 'node:https';

export const nodeFetch = ((input: string, init: RequestInit = {}) =>
  new Promise<Response>((resolve, reject) => {
    const url = new URL(input);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      url,
      { method: init.method ?? 'GET', headers: init.headers as Record<string, string> },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers))
            if (typeof v === 'string') headers.set(k, v);
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
        });
      },
    );
    req.on('error', reject);
    init.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
    if (init.body) req.write(init.body as string);
    req.end();
  })) as unknown as typeof fetch;
