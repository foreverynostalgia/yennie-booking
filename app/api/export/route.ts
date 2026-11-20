import { env } from 'cloudflare:workers';
import { handleExport } from '@/lib/export-core';

// Temporary owner-only migration export. See lib/export-core.ts.
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const e = env as unknown as Record<string, unknown>;
  return handleExport(req, { db: e.DB as never, bucket: e.LEARNING_FILES as never, token: typeof e.EXPORT_TOKEN === 'string' ? e.EXPORT_TOKEN : undefined });
}
