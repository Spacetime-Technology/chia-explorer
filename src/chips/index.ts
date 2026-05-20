import { FileNotFoundError, fetchRawFile, githubApi } from '../github/client.js';
import { getCached } from '../github/cache.js';
import {
  buildChipFileName,
  extractAbstract,
  extractChipPathInfo,
  parseChipFrontMatter,
  type AuthorRef,
  type ChipFrontMatter,
} from './parser.js';

const REPO = 'Chia-Network/chips';
const DEFAULT_REF = 'main';
const CHIPS_DIR = 'CHIPs';
const LISTING_TTL_MS = 5 * 60_000;
const CONTENT_TTL_MS = 10 * 60_000;
const PR_LIST_TTL_MS = 2 * 60_000;

interface ContentsEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

interface PullsEntry {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  requested_reviewers: Array<{ login: string }>;
  head: { sha: string; ref: string };
  base: { ref: string };
}

interface PullFileEntry {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'changed' | 'copied' | 'unchanged';
  previous_filename?: string;
}

export interface ChipSummary {
  number: number | null;
  title: string | null;
  status: string | null;
  category: string | null;
  sub_category: string | null;
  type: string | null;
  authors: AuthorRef[];
  editors: AuthorRef[];
  description: string | null;
  abstract: string | null;
  created: string | null;
  updated: string | null;
  comments_uri: string | null;
  requires: string | null;
  replaces: string | null;
  superseded_by: string | null;
  source_url: string;
  filename: string;
}

export interface MergedChip extends ChipSummary {
  source: 'merged';
  ref: 'main';
  body?: string;
}

export interface DraftChip extends ChipSummary {
  source: 'draft';
  ref: string;
  pr: PrContext;
  modifies_existing: boolean;
  body?: string;
}

export interface PrContext {
  number: number;
  url: string;
  title: string;
  state: string;
  draft: boolean;
  author: string | null;
  requested_reviewers: string[];
  created_at: string;
  updated_at: string;
  head_sha: string;
  head_ref: string;
  base_ref: string;
}

function summarize(fm: ChipFrontMatter, body: string, ref: string, filename: string): ChipSummary {
  return {
    number: fm.number,
    title: fm.title,
    status: fm.status,
    category: fm.category,
    sub_category: fm.sub_category,
    type: fm.type,
    authors: fm.authors,
    editors: fm.editors,
    description: fm.description,
    abstract: extractAbstract(body),
    created: fm.created,
    updated: fm.updated,
    comments_uri: fm.comments_uri,
    requires: fm.requires,
    replaces: fm.replaces,
    superseded_by: fm.superseded_by,
    source_url: `https://github.com/${REPO}/blob/${ref}/${filename}`,
    filename,
  };
}

async function listChipFilenames(): Promise<string[]> {
  return getCached(
    `chips:contents:${DEFAULT_REF}`,
    async () => {
      const entries = await githubApi<ContentsEntry[]>(
        `/repos/${REPO}/contents/${CHIPS_DIR}?ref=${DEFAULT_REF}`
      );
      return entries
        .filter((e) => e.type === 'file' && /^chip-\d{1,5}\.md$/i.test(e.name))
        .map((e) => e.path)
        .sort();
    },
    LISTING_TTL_MS
  );
}

async function fetchChipFile(ref: string, path: string): Promise<string> {
  return getCached(`chips:raw:${ref}:${path}`, () => fetchRawFile(REPO, ref, path), CONTENT_TTL_MS);
}

export async function listMergedChips(): Promise<ChipSummary[]> {
  const paths = await listChipFilenames();
  const summaries = await Promise.all(
    paths.map(async (path) => {
      const body = await fetchChipFile(DEFAULT_REF, path);
      const fm = parseChipFrontMatter(body);
      return summarize(fm, body, DEFAULT_REF, path);
    })
  );
  summaries.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return summaries;
}

export async function getMergedChip(
  number: number,
  options: { includeBody?: boolean } = {}
): Promise<MergedChip | null> {
  const filename = `${CHIPS_DIR}/${buildChipFileName(number)}`;
  try {
    const body = await fetchChipFile(DEFAULT_REF, filename);
    const fm = parseChipFrontMatter(body);
    const summary = summarize(fm, body, DEFAULT_REF, filename);
    const chip: MergedChip = {
      ...summary,
      source: 'merged',
      ref: 'main',
    };
    if (options.includeBody) chip.body = body;
    return chip;
  } catch (err) {
    if (err instanceof FileNotFoundError) return null;
    throw err;
  }
}

async function listOpenChipPrs(): Promise<PullsEntry[]> {
  return getCached(
    `chips:prs:open`,
    () =>
      githubApi<PullsEntry[]>(
        `/repos/${REPO}/pulls?state=open&per_page=100&sort=updated&direction=desc`
      ),
    PR_LIST_TTL_MS
  );
}

async function listPrChipFiles(prNumber: number): Promise<PullFileEntry[]> {
  return getCached(
    `chips:pr-files:${prNumber}`,
    () => githubApi<PullFileEntry[]>(`/repos/${REPO}/pulls/${prNumber}/files?per_page=100`),
    PR_LIST_TTL_MS
  );
}

function prContext(pr: PullsEntry): PrContext {
  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    author: pr.user?.login ?? null,
    requested_reviewers: pr.requested_reviewers.map((r) => r.login),
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    head_sha: pr.head.sha,
    head_ref: pr.head.ref,
    base_ref: pr.base.ref,
  };
}

async function buildDraftFromPr(
  pr: PullsEntry,
  file: PullFileEntry,
  options: { includeBody?: boolean } = {}
): Promise<DraftChip | null> {
  if (file.status === 'removed') return null;
  const info = extractChipPathInfo(file.filename);
  if (!info) return null;
  let body: string;
  try {
    body = await fetchChipFile(pr.head.sha, file.filename);
  } catch (err) {
    if (err instanceof FileNotFoundError) return null;
    throw err;
  }
  const fm = parseChipFrontMatter(body);
  const summary = summarize(fm, body, pr.head.sha, file.filename);
  if (summary.number == null) summary.number = info.number;
  const draft: DraftChip = {
    ...summary,
    source: 'draft',
    ref: pr.head.sha,
    pr: prContext(pr),
    modifies_existing: file.status === 'modified' || file.status === 'renamed',
  };
  if (options.includeBody) draft.body = body;
  return draft;
}

export async function listChipDrafts(): Promise<DraftChip[]> {
  const prs = await listOpenChipPrs();
  const results: DraftChip[] = [];
  for (const pr of prs) {
    const files = await listPrChipFiles(pr.number).catch(() => [] as PullFileEntry[]);
    const chipFiles = files.filter((f) => extractChipPathInfo(f.filename));
    for (const file of chipFiles) {
      const draft = await buildDraftFromPr(pr, file).catch(() => null);
      if (draft) results.push(draft);
    }
  }
  return results;
}

export async function getChipFromPr(
  prNumber: number,
  options: { includeBody?: boolean } = {}
): Promise<DraftChip | null> {
  const prs = await listOpenChipPrs();
  const pr = prs.find((p) => p.number === prNumber);
  if (!pr) return null;
  const files = await listPrChipFiles(prNumber);
  for (const file of files) {
    if (!extractChipPathInfo(file.filename)) continue;
    const draft = await buildDraftFromPr(pr, file, options);
    if (draft) return draft;
  }
  return null;
}

export async function findChipByNumber(
  number: number,
  options: { includeBody?: boolean } = {}
): Promise<{ merged: MergedChip | null; drafts: DraftChip[] }> {
  const merged = await getMergedChip(number, options);
  const allDrafts = await listChipDrafts();
  const drafts: DraftChip[] = [];
  for (const d of allDrafts) {
    if (d.number !== number) continue;
    if (options.includeBody) {
      const full = await getChipFromPr(d.pr.number, { includeBody: true });
      if (full) drafts.push(full);
      else drafts.push(d);
    } else {
      drafts.push(d);
    }
  }
  return { merged, drafts };
}

export interface SearchOptions {
  status?: string;
  source?: 'merged' | 'draft' | 'both';
  limit?: number;
}

function matchesQuery(s: ChipSummary, q: string): boolean {
  const needle = q.toLowerCase();
  const haystacks: string[] = [];
  if (s.title) haystacks.push(s.title);
  if (s.description) haystacks.push(s.description);
  if (s.abstract) haystacks.push(s.abstract);
  for (const a of s.authors) haystacks.push(a.name);
  if (s.number != null) haystacks.push(String(s.number));
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

export async function searchChips(
  query: string,
  options: SearchOptions = {}
): Promise<Array<MergedChip | DraftChip>> {
  const source = options.source ?? 'both';
  const limit = options.limit ?? 20;
  const statusFilter = options.status?.toLowerCase();

  const pool: Array<MergedChip | DraftChip> = [];
  if (source === 'merged' || source === 'both') {
    const merged = await listMergedChips();
    for (const m of merged) {
      pool.push({ ...m, source: 'merged' as const, ref: 'main' as const });
    }
  }
  if (source === 'draft' || source === 'both') {
    const drafts = await listChipDrafts();
    pool.push(...drafts);
  }

  const filtered = pool.filter((c) => {
    if (statusFilter && (c.status?.toLowerCase() ?? '') !== statusFilter) return false;
    return matchesQuery(c, query);
  });

  return filtered.slice(0, limit);
}

export { resetCache } from '../github/cache.js';
