// Rewrites the build's generated dist/server/wrangler.json so the same build
// deploys to the owner's own Cloudflare account instead of ChatGPT Sites.
// Usage (after `pnpm run build`): node scripts/cloudflare-config.mjs
// Then: wrangler deploy --config dist/server/wrangler.json
//
// Static files from dist/client are embedded into the Worker (served by
// dist/server/cf-entry.js) instead of using Workers Static Assets, so a deploy
// needs only an API token (no separate asset-upload session) and code and
// assets always ship atomically.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const target = {
  name: 'yennie-booking',
  d1: {binding: 'DB', database_name: 'yennie-booking', database_id: '06f35184-ab06-4f20-850f-023f16a2b4f9'},
  r2: {binding: 'LEARNING_FILES', bucket_name: 'yennie-booking-files'},
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'dist/server');
const clientDir = path.join(root, 'dist/client');

const types = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const assets = {};
for (const file of await walk(clientDir)) {
  const rel = '/' + path.relative(clientDir, file).split(path.sep).join('/');
  if (rel === '/_headers' || rel === '/_redirects') continue;
  const ext = path.extname(file).toLowerCase();
  const type = types[ext] || 'application/octet-stream';
  const bytes = await readFile(file);
  const {createHash} = await import('node:crypto');
  assets[rel] = {type, etag: '"' + createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '"', b64: bytes.toString('base64')};
}
await writeFile(path.join(serverDir, 'static-assets.js'), 'export default ' + JSON.stringify(assets) + ';\n');

await writeFile(path.join(serverDir, 'cf-entry.js'), `import app from './index.js';
import table from './static-assets.js';
const decoded = new Map();
function body(p) { let b = decoded.get(p); if (!b) { const s = atob(table[p].b64); b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); decoded.set(p, b); } return b; }
function serve(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  let p; try { p = decodeURIComponent(new URL(request.url).pathname); } catch { return null; }
  const entry = table[p]; if (!entry) return null;
  const headers = new Headers({'Content-Type': entry.type, ETag: entry.etag, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': p.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'});
  if (p === '/sw.js') headers.set('Service-Worker-Allowed', '/');
  if (request.headers.get('If-None-Match') === entry.etag) return new Response(null, {status: 304, headers});
  return new Response(request.method === 'HEAD' ? null : body(p), {headers});
}
const ASSETS = {fetch: async (request) => serve(request instanceof Request ? request : new Request(request)) || new Response('Not Found', {status: 404})};
export default {
  async fetch(request, env, ctx) {
    return serve(request) || app.fetch(request, {...env, ASSETS}, ctx);
  },
};
`);

const file = path.join(serverDir, 'wrangler.json');
const config = JSON.parse(await readFile(file, 'utf8'));
config.name = target.name;
delete config.topLevelName;
delete config.assets;
config.main = 'cf-entry.js';
config.workers_dev = true;
config.preview_urls = false;
config.d1_databases = [target.d1];
config.r2_buckets = [target.r2];
config.observability = {enabled: true};
await writeFile(file, JSON.stringify(config, null, 2));
console.log(`wrangler.json -> ${target.name} (D1 ${target.d1.database_name}, R2 ${target.r2.bucket_name}, ${Object.keys(assets).length} embedded static files)`);
