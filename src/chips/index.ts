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
import { getChipReadmeIndex, type ChipReadmeEntry } from './readme-index.js';

const REPO = 'Chia-Network/chips';
const DEFAULT_REF = 'main';
const CONTENT_TTL_MS = 10 * 60_000;
const PR_LIST_TTL_MS = 2 * 60_000;

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
  filename: string | null;
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

export interface ChipIndexEntry extends ChipSummary {
  kind: 'file' | 'pr' | 'external';
  pr: PrContext | null;
  ref: string | null;
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

async function fetchChipFile(ref: string, path: string): Promise<string> {
  return getCached(`chips:raw:${ref}:${path}`, () => fetchRawFile(REPO, ref, path), CONTENT_TTL_MS);
}

export async function getMergedChip(
  number: number,
  options: { includeBody?: boolean } = {}
): Promise<MergedChip | null> {
  const filename = `CHIPs/${buildChipFileName(number)}`;
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

function sparseEntry(idx: ChipReadmeEntry): ChipIndexEntry {
  return {
    number: idx.number,
    title: idx.title,
    status: idx.status,
    category: null,
    sub_category: null,
    type: null,
    authors: [],
    editors: [],
    description: null,
    abstract: null,
    created: null,
    updated: null,
    comments_uri: null,
    requires: null,
    replaces: null,
    superseded_by: null,
    source_url: idx.url,
    filename: idx.filename,
    kind: idx.kind,
    pr: null,
    ref: null,
  };
}

async function buildIndexEntry(
  idx: ChipReadmeEntry,
  openPrs: Map<number, PullsEntry>
): Promise<ChipIndexEntry> {
  if (idx.kind === 'file' && idx.filename) {
    try {
      const body = await fetchChipFile(DEFAULT_REF, idx.filename);
      const fm = parseChipFrontMatter(body);
      const summary = summarize(fm, body, DEFAULT_REF, idx.filename);
      return {
        ...summary,
        number: idx.number ?? summary.number,
        title: summary.title ?? idx.title,
        status: idx.status,
        source_url: idx.url,
        kind: 'file',
        pr: null,
        ref: DEFAULT_REF,
      };
    } catch (err) {
      if (err instanceof FileNotFoundError) return sparseEntry(idx);
      throw err;
    }
  }
  if (idx.kind === 'pr' && idx.prNumber != null) {
    const pr = openPrs.get(idx.prNumber);
    if (pr) {
      const files = await listPrChipFiles(pr.number).catch(() => [] as PullFileEntry[]);
      const chipFiles = files.filter(
        (f) => f.status !== 'removed' && extractChipPathInfo(f.filename)
      );
      let chipFile: PullFileEntry | undefined;
      if (idx.number != null) {
        const target = buildChipFileName(idx.number);
        chipFile = chipFiles.find((f) => f.filename.toLowerCase().endsWith(target.toLowerCase()));
      }
      if (!chipFile) chipFile = chipFiles[0];
      if (chipFile) {
        const body = await fetchChipFile(pr.head.sha, chipFile.filename).catch(() => null);
        if (body) {
          const fm = parseChipFrontMatter(body);
          const summary = summarize(fm, body, pr.head.sha, chipFile.filename);
          return {
            ...summary,
            number: idx.number ?? summary.number,
            title: summary.title ?? idx.title,
            status: idx.status,
            source_url: idx.url,
            kind: 'pr',
            pr: prContext(pr),
            ref: pr.head.sha,
          };
        }
      }
    }
    return sparseEntry(idx);
  }
  return sparseEntry(idx);
}

export async function listChipsFromReadme(): Promise<ChipIndexEntry[]> {
  const [index, openPrsList] = await Promise.all([getChipReadmeIndex(), listOpenChipPrs()]);
  const openPrs = new Map(openPrsList.map((pr) => [pr.number, pr]));
  const entries = await Promise.all(index.map((idx) => buildIndexEntry(idx, openPrs)));
  entries.sort((a, b) => {
    if (a.number == null && b.number == null) return 0;
    if (a.number == null) return 1;
    if (b.number == null) return -1;
    return a.number - b.number;
  });
  return entries;
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

function kindToSource(kind: ChipIndexEntry['kind']): 'merged' | 'draft' {
  return kind === 'pr' ? 'draft' : 'merged';
}

export interface SearchMatch extends ChipIndexEntry {
  source: 'merged' | 'draft';
}

export async function searchChips(
  query: string,
  options: SearchOptions = {}
): Promise<SearchMatch[]> {
  const source = options.source ?? 'both';
  const limit = options.limit ?? 20;
  const statusFilter = options.status?.toLowerCase();

  const entries = await listChipsFromReadme();
  const filtered = entries
    .map((e): SearchMatch => ({ ...e, source: kindToSource(e.kind) }))
    .filter((e) => {
      if (source !== 'both' && e.source !== source) return false;
      if (statusFilter && (e.status?.toLowerCase() ?? '') !== statusFilter) return false;
      return matchesQuery(e, query);
    });

  return filtered.slice(0, limit);
}

export { resetCache } from '../github/cache.js';
