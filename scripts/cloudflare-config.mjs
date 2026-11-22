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
  origin: 'https://yennie-booking.yenniesense.workers.dev',
  // Offset from the Apps Script 5-minute trigger is not controllable, so retry often.
  calendarRetryCron: '*/5 * * * *',
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
// Google Calendar auto-retry. The Apps Script holds a script-wide lock while its
// own 5-minute change scan runs, so a booking sent at that moment fails with
// "Lock timeout". Every few minutes, re-send bookings that still need syncing
// (same rule as the admin "기존 예약 전송 · 실패 건 재시도" button). Nothing is sent
// to Google when nothing is pending.
const ORIGIN = ${JSON.stringify(target.origin)};
const NEEDS_SYNC = "SELECT (SELECT count(*) FROM calendar_settings WHERE id='google_script') AS script, (SELECT count(*) FROM calendar_settings WHERE id='google_course_lifecycle_error') AS lifecycle, (SELECT count(*) FROM bookings WHERE (status!='cancelled' AND (date>=? OR calendar_synced_at IS NOT NULL OR attendance_updated_at IS NOT NULL) AND calendar_sync_status!='synced') OR (status='cancelled' AND calendar_synced_at IS NOT NULL AND calendar_sync_status!='synced')) AS pending";
async function retryCalendar(env, ctx) {
  if (!env.DB || String(env.MANAGER_SERVICE_KEY || '').length < 40) return;
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const need = await env.DB.prepare(NEEDS_SYNC).bind(today).first();
  if (!need?.script || (!need.pending && !need.lifecycle)) return;
  const call = (path, init) => app.fetch(new Request(ORIGIN + path, init), {...env, ASSETS}, ctx);
  const {token, status: sessionStatus} = await adminSession(env, ctx);
  const session = {status: sessionStatus};
  if (!token) { const status = {at: new Date().toISOString(), error: 'session ' + session.status}; console.warn(JSON.stringify({event: 'calendar-retry', ...status})); await recordRetry(env, status); return; }
  let processed = 0, failed = 0, last = null;
  for (let i = 0; i < 25; i++) {
    const res = await call('/api/admin/google-calendar', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: ORIGIN, Cookie: 'admin_session=' + token}, body: '{}'});
    last = await res.json().catch(() => null);
    if (!res.ok || !last) break;
    processed += last.processed || 0; failed += last.failed || 0;
    if (!last.hasMore || last.failed) break;
  }
  const status = {at: new Date().toISOString(), pending: need.pending, lifecycle: need.lifecycle, processed, failed, last};
  console.log(JSON.stringify({event: 'calendar-retry', ...status}));
  await recordRetry(env, status);
}
async function adminSession(env, ctx) {
  const res = await app.fetch(new Request(ORIGIN + '/api/admin/manager-session', {method: 'POST', headers: {Authorization: 'Bearer ' + env.MANAGER_SERVICE_KEY, Origin: ORIGIN}}), {...env, ASSETS}, ctx);
  return {status: res.status, token: res.ok ? (await res.json()).token : ''};
}
// OCR results are fetched when someone checks the job; also check in the
// background so uploads finish even if the page was closed.
async function pollOcrJobs(env, ctx) {
  if (!env.DB || String(env.MANAGER_SERVICE_KEY || '').length < 40) return;
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const {results} = await env.DB.prepare("SELECT id FROM learning_ocr_jobs WHERE status='processing' AND request_id IS NOT NULL AND created_at>=? ORDER BY created_at LIMIT 5").bind(since).all();
  if (!results.length) return;
  const {token} = await adminSession(env, ctx);
  if (!token) return;
  for (const job of results) {
    const res = await app.fetch(new Request(ORIGIN + '/api/admin/learning/ocr?job=' + encodeURIComponent(job.id), {headers: {Cookie: 'admin_session=' + token}}), {...env, ASSETS}, ctx);
    const out = await res.json().catch(() => null);
    console.log(JSON.stringify({event: 'ocr-poll', job: job.id, status: res.status, result: out && (out.status || out.error)}));
  }
}
async function recordRetry(env, status) {
  try { await env.DB.prepare("INSERT INTO calendar_settings(id,webhook_encrypted,updated_at) VALUES('calendar_retry_status',?,?) ON CONFLICT(id) DO UPDATE SET webhook_encrypted=excluded.webhook_encrypted,updated_at=excluded.updated_at").bind(JSON.stringify(status).slice(0, 1000), status.at).run(); } catch {}
}
export default {
  async fetch(request, env, ctx) {
    return serve(request) || app.fetch(request, {...env, ASSETS}, ctx);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(retryCalendar(env, ctx).catch(error => recordRetry(env, {at: new Date().toISOString(), error: String(error && error.stack || error).slice(0, 600)})));
    ctx.waitUntil(pollOcrJobs(env, ctx).catch(error => console.warn(JSON.stringify({event: 'ocr-poll', error: String(error).slice(0, 300)}))));
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
// Non-secret: where owners sign in (the manager embeds the booking admin).
config.vars = {...(config.vars || {}), MANAGER_URL: 'https://yennie-manager.yenniesense.workers.dev'};
config.triggers = {crons: [target.calendarRetryCron]};
await writeFile(file, JSON.stringify(config, null, 2));
console.log(`wrangler.json -> ${target.name} (D1 ${target.d1.database_name}, R2 ${target.r2.bucket_name}, ${Object.keys(assets).length} embedded static files)`);
