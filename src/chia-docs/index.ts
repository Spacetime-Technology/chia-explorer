import { fetchRawFile } from '../github/client.js';
import { getCached } from '../github/cache.js';
import { parseForksMarkdown, type Fork, type ForksDocument } from './parser.js';

export type { Fork, ForkType, ForksDocument } from './parser.js';

const REPO = 'Chia-Network/chia-docs';
const REF = 'main';
const FORKS_PATH = 'docs/chia-blockchain/consensus/forks.md';
const FORKS_TTL_MS = 10 * 60_000;

export const FORKS_SOURCE_URL = 'https://docs.chia.net/chia-blockchain/consensus/forks/';
export const FORKS_MARKDOWN_URL = `https://github.com/${REPO}/blob/${REF}/${FORKS_PATH}`;

export interface ForksResult {
  source_url: string;
  markdown_url: string;
  last_updated: string | null;
  count: number;
  forks: Fork[];
}

async function fetchForksDocument(): Promise<ForksDocument> {
  const body = await fetchRawFile(REPO, REF, FORKS_PATH);
  return parseForksMarkdown(body);
}

export async function getForks(): Promise<ForksResult> {
  const doc = await getCached('chia-docs:forks', fetchForksDocument, FORKS_TTL_MS);
  return {
    source_url: FORKS_SOURCE_URL,
    markdown_url: FORKS_MARKDOWN_URL,
    last_updated: doc.last_updated,
    count: doc.forks.length,
    forks: doc.forks,
  };
}
