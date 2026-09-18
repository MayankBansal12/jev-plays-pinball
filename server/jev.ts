import { TypeSafeClient } from '@typesafe-ai/sdk';
import { config } from 'dotenv';
import type { JevInput } from '../shared/jev-context.js';

export function configured() { config({ path: '.env.local', quiet: true }); return Boolean(process.env.TYPESAFE_API_KEY); }
export const modelName = () => process.env.TYPESAFE_DEFAULT_MODEL || 'jev-1.13.0';
let client: TypeSafeClient | undefined;
export async function decide(input: JevInput, signal: AbortSignal) {
  if (!configured()) throw new Error('not-configured');
  client ??= new TypeSafeClient({ timeout: 1800, retry: { maxRetries: 0 }, logLevel: 'off' });
  return client.systemOne(input, { signal });
}
export function safeError(error: unknown) {
  const e = error as { status?: number; name?: string };
  if (e.status === 401 || e.status === 403) return 'Jev rejected the API key. Check TypeSafe access.';
  if (e.status === 429) return 'Jev rate limit reached. Retrying with a fresh observation shortly.';
  if (e.status === 402) return 'TypeSafe account needs credits.';
  if (e.name?.includes('Timeout')) return 'Jev timed out. The ball kept moving.';
  if (e.name?.includes('Connection')) return 'Could not reach Jev. The ball kept moving.';
  return 'Jev request failed. The ball kept moving; no bot took over.';
}
