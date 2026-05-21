import { fetchRawFile } from '../github/client.js';
import { getCached } from '../github/cache.js';

const REPO = 'Chia-Network/chips';
const DEFAULT_REF = 'main';
const README_PATH = 'README.md';
const README_TTL_MS = 5 * 60_000;

export type ChipReadmeEntryKind = 'file' | 'pr' | 'external';

export interface ChipReadmeEntry {
  number: number | null;
  title: string;
  status: string;
  url: string;
  kind: ChipReadmeEntryKind;
  filename: string | null;
  prNumber: number | null;
}

const BULLET_PATTERN = /^\*\s+\[(.+?)\]\((.+?)\)/;
const FILE_LINK_PATTERN = /^\/?CHIPs\/(chip-\d{1,5}\.md)$/i;
const PR_LINK_PATTERN = /^https?:\/\/github\.com\/Chia-Network\/chips\/pull\/(\d+)\/?$/i;

function parseLabel(label: string): { number: number | null; title: string } {
  const m = label.match(/^\s*(\d+)\s*[-–—:]\s*(.+?)\s*$/);
  if (m) {
    return { number: Number(m[1]), title: m[2]!.trim() };
  }
  return { number: null, title: label.trim() };
}

function classify(url: string): {
  kind: ChipReadmeEntryKind;
  filename: string | null;
  prNumber: number | null;
  absoluteUrl: string;
} {
  const fileMatch = url.match(FILE_LINK_PATTERN);
  if (fileMatch) {
    const filename = `CHIPs/${fileMatch[1]!}`;
    return {
      kind: 'file',
      filename,
      prNumber: null,
      absoluteUrl: `https://github.com/${REPO}/blob/${DEFAULT_REF}/${filename}`,
    };
  }
  const prMatch = url.match(PR_LINK_PATTERN);
  if (prMatch) {
    return {
      kind: 'pr',
      filename: null,
      prNumber: Number(prMatch[1]),
      absoluteUrl: url,
    };
  }
  return { kind: 'external', filename: null, prNumber: null, absoluteUrl: url };
}

export function parseChipReadmeIndex(markdown: string): ChipReadmeEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ChipReadmeEntry[] = [];
  let currentStatus: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      currentStatus = heading[1]!.trim();
      continue;
    }
    if (line.startsWith('## ')) {
      currentStatus = null;
      continue;
    }
    if (!currentStatus) continue;
    const bullet = line.match(BULLET_PATTERN);
    if (!bullet) continue;
    const [, label, url] = bullet;
    if (!label || !url) continue;
    const { number, title } = parseLabel(label);
    const { kind, filename, prNumber, absoluteUrl } = classify(url);
    entries.push({
      number,
      title,
      status: currentStatus,
      url: absoluteUrl,
      kind,
      filename,
      prNumber,
    });
  }

  return entries;
}

export async function getChipReadmeIndex(): Promise<ChipReadmeEntry[]> {
  return getCached(
    `chips:readme:${DEFAULT_REF}`,
    async () => {
      const body = await fetchRawFile(REPO, DEFAULT_REF, README_PATH);
      return parseChipReadmeIndex(body);
    },
    README_TTL_MS
  );
}
