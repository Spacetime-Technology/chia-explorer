export type ForkType = 'hard' | 'soft';

export interface Fork {
  type: ForkType;
  name: string;
  activation_block: number | null;
  activation_date: string | null;
  build: string | null;
  status: string;
  purpose_url: string | null;
}

export interface ForksDocument {
  last_updated: string | null;
  forks: Fork[];
}

const HEADER_KEYS = {
  block: 'activation block',
  date: 'activation date',
  type: 'type',
  build: 'build',
  status: 'status',
  description: 'description',
} as const;

const LAST_UPDATED_PATTERN = /last updated on\s+(\d{4}-\d{2}-\d{2})/i;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
}

function blankToNull(value: string): string | null {
  const v = value.trim();
  if (!v || v === '-' || v.toLowerCase() === 'n/a' || v.toLowerCase() === 'tbd') return null;
  return v;
}

function parseBlock(raw: string): number | null {
  // Strip backticks, whitespace (incl. NBSP via \s), commas, underscores.
  const cleaned = raw.replace(/[`\s,_]/g, '');
  if (!cleaned) return null;
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseType(raw: string): ForkType | null {
  const v = raw.trim().toLowerCase();
  if (v === 'hard') return 'hard';
  if (v === 'soft') return 'soft';
  return null;
}

function parseDescription(raw: string): { name: string; purpose_url: string | null } {
  const trimmed = raw.trim();
  let firstUrl: string | null = null;
  const stripped = trimmed
    .replace(MARKDOWN_LINK_PATTERN, (_match, text: string, url: string) => {
      if (firstUrl == null) firstUrl = url.trim();
      return text;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { name: stripped, purpose_url: firstUrl };
}

interface ColumnMap {
  block: number;
  date: number;
  type: number;
  build: number;
  status: number;
  description: number;
}

function buildColumnMap(headerCells: string[]): ColumnMap | null {
  const idx: Record<string, number> = {};
  headerCells.forEach((cell, i) => {
    idx[cell.trim().toLowerCase()] = i;
  });
  const block = idx[HEADER_KEYS.block];
  const date = idx[HEADER_KEYS.date];
  const type = idx[HEADER_KEYS.type];
  const build = idx[HEADER_KEYS.build];
  const status = idx[HEADER_KEYS.status];
  const description = idx[HEADER_KEYS.description];
  if (
    block == null ||
    date == null ||
    type == null ||
    build == null ||
    status == null ||
    description == null
  ) {
    return null;
  }
  return { block, date, type, build, status, description };
}

export function parseForksMarkdown(markdown: string): ForksDocument {
  const lastUpdated = markdown.match(LAST_UPDATED_PATTERN)?.[1] ?? null;
  const forks: Fork[] = [];
  const lines = markdown.split(/\r?\n/);

  let cols: ColumnMap | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isTableRow(line)) continue;
    const cells = splitRow(line);
    if (cells.length === 0) continue;

    if (!cols) {
      const candidate = buildColumnMap(cells);
      if (!candidate) continue;
      const next = lines[i + 1];
      if (!next || !isSeparatorRow(splitRow(next))) continue;
      cols = candidate;
      i++;
      continue;
    }

    if (isSeparatorRow(cells)) continue;
    const type = parseType(cells[cols.type] ?? '');
    if (!type) continue;
    const description = parseDescription(cells[cols.description] ?? '');
    if (!description.name) continue;
    forks.push({
      type,
      name: description.name,
      activation_block: parseBlock(cells[cols.block] ?? ''),
      activation_date: blankToNull(cells[cols.date] ?? ''),
      build: blankToNull(cells[cols.build] ?? ''),
      status: cells[cols.status]?.trim() || 'Unknown',
      purpose_url: description.purpose_url,
    });
  }

  return { last_updated: lastUpdated, forks };
}
