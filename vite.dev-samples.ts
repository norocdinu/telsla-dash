// Dev-only: serves local sample folders so the app can be tried without file dialogs.
// Only `vite serve` uses it; it is never part of a build. It can delete only inside .fake-drive/ copies.
import { createReadStream, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { devDeleteAllowed } from './vite.dev-delete-guard.ts';

const ROOTS = ['Samples', '.fake-drive'];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function devSamples(): Plugin {
  return {
    name: 'dev-samples',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev-samples', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        const root = url.searchParams.get('root') ?? '';
        const top = root.split('/')[0];
        const allowed = resolve(server.config.root, top);
        const base = resolve(server.config.root, root);
        if (!ROOTS.includes(top) || (base !== allowed && !base.startsWith(allowed + sep))) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (url.pathname === '/delete') {
          // Removes one file or one empty folder, and only inside .fake-drive/ (see vite.dev-delete-guard.ts).
          const target = req.method === 'POST' ? devDeleteAllowed(server.config.root, root, url.searchParams.get('path') ?? '') : null;
          if (!target) {
            res.statusCode = 403;
            res.end();
            return;
          }
          try {
            if (statSync(target).isDirectory()) rmdirSync(target);
            else unlinkSync(target);
            res.statusCode = 204;
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            res.statusCode = code === 'ENOENT' ? 404 : code === 'ENOTEMPTY' ? 409 : 500;
          }
          res.end();
          return;
        }
        try {
          if (url.pathname === '/list') {
            const files = walk(base).map((p) => ({ path: relative(base, p).split(sep).join('/'), size: statSync(p).size }));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(files));
            return;
          }
          if (url.pathname === '/file') {
            const p = resolve(base, url.searchParams.get('path') ?? '');
            if (!p.startsWith(base + sep)) {
              res.statusCode = 403;
              res.end();
              return;
            }
            res.setHeader('content-length', String(statSync(p).size));
            res.setHeader('content-type', 'application/octet-stream');
            createReadStream(p).pipe(res);
            return;
          }
        } catch {
          res.statusCode = 404;
          res.end();
          return;
        }
        next();
      });
    },
  };
}
