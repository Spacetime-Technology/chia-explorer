const GITHUB_API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'chia-explorer-mcp';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': USER_AGENT,
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

function rateLimitMessage(res: Response, body: string): string | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (remaining === '0' || /rate limit/i.test(body)) {
    const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : 'unknown';
    const tokenHint = process.env.GITHUB_TOKEN
      ? ''
      : ' Set GITHUB_TOKEN to raise the limit from 60/hr to 5000/hr.';
    return `github rate limit exhausted (resets at ${resetAt}).${tokenHint}`;
  }
  return null;
}

export async function githubApi<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${GITHUB_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const rateLimit = rateLimitMessage(res, body);
    if (rateLimit) throw new Error(rateLimit);
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    throw new Error(`github ${res.status} ${res.statusText}${detail}`);
  }

  return (await res.json()) as T;
}

export async function fetchRawFile(repo: string, ref: string, path: string): Promise<string> {
  const url = `${RAW_BASE}/${repo}/${ref}/${path}`;
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 404) {
    throw new FileNotFoundError(`raw file not found: ${repo}@${ref}/${path}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    throw new Error(`raw.githubusercontent ${res.status} ${res.statusText}${detail}`);
  }

  return await res.text();
}

export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}
