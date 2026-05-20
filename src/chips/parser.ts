export interface AuthorRef {
  name: string;
  url: string | null;
}

export interface ChipFrontMatter {
  number: number | null;
  title: string | null;
  description: string | null;
  authors: AuthorRef[];
  editors: AuthorRef[];
  comments_uri: string | null;
  status: string | null;
  category: string | null;
  sub_category: string | null;
  type: string | null;
  created: string | null;
  updated: string | null;
  requires: string | null;
  replaces: string | null;
  superseded_by: string | null;
  extra: Record<string, string>;
}

const KEY_MAP: Record<string, keyof ChipFrontMatter> = {
  'chip number': 'number',
  'chip-number': 'number',
  number: 'number',
  title: 'title',
  description: 'description',
  author: 'authors',
  authors: 'authors',
  editor: 'editors',
  editors: 'editors',
  'comments-uri': 'comments_uri',
  comments_uri: 'comments_uri',
  status: 'status',
  category: 'category',
  'sub-category': 'sub_category',
  sub_category: 'sub_category',
  type: 'type',
  created: 'created',
  updated: 'updated',
  requires: 'requires',
  replaces: 'replaces',
  'superseded-by': 'superseded_by',
  superseded_by: 'superseded_by',
};

function stripTablePipes(line: string): string {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s;
}

function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function isBlankOrNone(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === '' || v === 'none' || v === '-' || v === 'n/a';
}

export function parseAuthors(raw: string): AuthorRef[] {
  const trimmed = raw.trim();
  if (isBlankOrNone(trimmed)) return [];
  const out: AuthorRef[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const seen: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(trimmed)) !== null) {
    out.push({ name: match[1]!.trim(), url: match[2]!.trim() });
    seen.push({ start: match.index, end: match.index + match[0].length });
  }
  if (out.length > 0) return out;
  for (const part of trimmed.split(',')) {
    const name = part.trim();
    if (name) out.push({ name, url: null });
  }
  return out;
}

function parseChipNumber(raw: string): number | null {
  const m = raw.trim().match(/^\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function assignField(fm: ChipFrontMatter, field: keyof ChipFrontMatter, value: string): void {
  switch (field) {
    case 'number':
      fm.number = parseChipNumber(value);
      return;
    case 'authors':
      fm.authors = parseAuthors(value);
      return;
    case 'editors':
      fm.editors = parseAuthors(value);
      return;
    case 'extra':
      return;
  }
  const normalized = isBlankOrNone(value) ? null : value;
  switch (field) {
    case 'title':
      fm.title = normalized;
      return;
    case 'description':
      fm.description = normalized;
      return;
    case 'comments_uri':
      fm.comments_uri = normalized;
      return;
    case 'status':
      fm.status = normalized;
      return;
    case 'category':
      fm.category = normalized;
      return;
    case 'sub_category':
      fm.sub_category = normalized;
      return;
    case 'type':
      fm.type = normalized;
      return;
    case 'created':
      fm.created = normalized;
      return;
    case 'updated':
      fm.updated = normalized;
      return;
    case 'requires':
      fm.requires = normalized;
      return;
    case 'replaces':
      fm.replaces = normalized;
      return;
    case 'superseded_by':
      fm.superseded_by = normalized;
      return;
  }
}

function emptyFrontMatter(): ChipFrontMatter {
  return {
    number: null,
    title: null,
    description: null,
    authors: [],
    editors: [],
    comments_uri: null,
    status: null,
    category: null,
    sub_category: null,
    type: null,
    created: null,
    updated: null,
    requires: null,
    replaces: null,
    superseded_by: null,
    extra: {},
  };
}

export function parseChipFrontMatter(markdown: string): ChipFrontMatter {
  const fm = emptyFrontMatter();
  const lines = markdown.split(/\r?\n/);

  for (const raw of lines) {
    if (/^##\s/.test(raw)) break;
    if (/^#\s/.test(raw)) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!trimmed.includes('|')) continue;
    const cells = stripTablePipes(trimmed)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (isSeparatorRow(cells)) continue;
    const key = cells[0]!.toLowerCase();
    const value = cells.slice(1).join('|').trim();
    const mapped = KEY_MAP[key];
    if (!mapped) {
      if (key) fm.extra[key] = value;
      continue;
    }

    assignField(fm, mapped, value);
  }

  return fm;
}

export function extractAbstract(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    if (/^##\s+abstract\s*$/i.test(lines[i]!.trim())) break;
    i++;
  }
  if (i >= lines.length) return null;
  i++;
  const buf: string[] = [];
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^#{1,6}\s/.test(line.trim())) break;
    buf.push(line);
    i++;
  }
  const text = buf.join('\n').trim();
  return text || null;
}

export function buildChipFileName(number: number): string {
  return `chip-${String(number).padStart(4, '0')}.md`;
}

const CHIP_FILE_PATTERN = /CHIPs\/chip-(\d{1,5})\.md$/i;

export function extractChipPathInfo(path: string): { number: number; filename: string } | null {
  const m = CHIP_FILE_PATTERN.exec(path);
  if (!m) return null;
  return { number: Number(m[1]), filename: path };
}
