import { describe, expect, it } from 'vitest';
import {
  buildChipFileName,
  extractAbstract,
  extractChipPathInfo,
  parseAuthors,
  parseChipFrontMatter,
} from '../src/chips/parser.js';

const SIMPLE_CHIP = `CHIP Number   | 0042
:-------------|:----
Title         | Protected Single Sided Offers
Description   | Describes a way for wallets to securely make and take single sided offers.
Author        | [Brandon Haggstrom](https://github.com/Rigidity)
Editor        | [Dan Perry](https://github.com/danieljperry)
Comments-URI  | [CHIPs repo, PR #143](https://github.com/Chia-Network/chips/pull/143)
Status        | Final
Category      | Informational
Sub-Category  | Guideline
Created       | 2025-02-04
Requires      | None
Replaces      | None
Superseded-By | None

## Abstract

Currently many Chia wallets support making offer files which either offer or request assets for nothing in return.

## Motivation

The primary use case for single sided offers...
`;

const PIPE_TABLE_CHIP = `| CHIP Number   | 0020   |
| :------------ | :----- |
| Title         | Wallet Hinted Coin Discovery |
| Authors       | [Brandon Haggstrom](https://github.com/Rigidity), [Yak](https://github.com/Yakuhito) |
| Status        | Final  |
| Category      | Informational |
| Sub-Category  | Guideline |
| Created       | 2023-08-21 |
| Requires      | None |
| Replaces      | - |
| Superseded-By | None |

## Abstract

A paragraph
across two lines.
`;

describe('parseChipFrontMatter', () => {
  it('parses plain-table front matter', () => {
    const fm = parseChipFrontMatter(SIMPLE_CHIP);
    expect(fm.number).toBe(42);
    expect(fm.title).toBe('Protected Single Sided Offers');
    expect(fm.status).toBe('Final');
    expect(fm.category).toBe('Informational');
    expect(fm.sub_category).toBe('Guideline');
    expect(fm.created).toBe('2025-02-04');
    expect(fm.requires).toBeNull();
    expect(fm.replaces).toBeNull();
    expect(fm.superseded_by).toBeNull();
    expect(fm.authors).toEqual([{ name: 'Brandon Haggstrom', url: 'https://github.com/Rigidity' }]);
    expect(fm.editors).toEqual([{ name: 'Dan Perry', url: 'https://github.com/danieljperry' }]);
    expect(fm.comments_uri).toContain('PR #143');
  });

  it('parses pipe-bordered table with plural Authors and multiple authors', () => {
    const fm = parseChipFrontMatter(PIPE_TABLE_CHIP);
    expect(fm.number).toBe(20);
    expect(fm.title).toBe('Wallet Hinted Coin Discovery');
    expect(fm.authors).toHaveLength(2);
    expect(fm.authors[0]).toEqual({
      name: 'Brandon Haggstrom',
      url: 'https://github.com/Rigidity',
    });
    expect(fm.authors[1]).toEqual({ name: 'Yak', url: 'https://github.com/Yakuhito' });
    expect(fm.replaces).toBeNull();
  });

  it('returns nulls for a CHIP without recognised front matter', () => {
    const fm = parseChipFrontMatter('# Just a doc\n\nNo table here.\n');
    expect(fm.number).toBeNull();
    expect(fm.title).toBeNull();
    expect(fm.authors).toEqual([]);
  });
});

describe('parseAuthors', () => {
  it('parses one linked author', () => {
    expect(parseAuthors('[Alice](https://example.com)')).toEqual([
      { name: 'Alice', url: 'https://example.com' },
    ]);
  });

  it('parses comma-separated linked authors', () => {
    expect(parseAuthors('[A](https://a), [B](https://b)')).toEqual([
      { name: 'A', url: 'https://a' },
      { name: 'B', url: 'https://b' },
    ]);
  });

  it('falls back to plain names when no link syntax is used', () => {
    expect(parseAuthors('Alice, Bob')).toEqual([
      { name: 'Alice', url: null },
      { name: 'Bob', url: null },
    ]);
  });

  it('returns empty for None / blank', () => {
    expect(parseAuthors('None')).toEqual([]);
    expect(parseAuthors('-')).toEqual([]);
    expect(parseAuthors('')).toEqual([]);
  });
});

describe('extractAbstract', () => {
  it('returns the paragraph under ## Abstract', () => {
    expect(extractAbstract(SIMPLE_CHIP)).toContain('Currently many Chia wallets');
  });

  it('captures multi-line abstracts up to the next heading', () => {
    const abstract = extractAbstract(PIPE_TABLE_CHIP);
    expect(abstract).toBe('A paragraph\nacross two lines.');
  });

  it('returns null when no Abstract heading is present', () => {
    expect(extractAbstract('# No abstract here')).toBeNull();
  });
});

describe('chip file path helpers', () => {
  it('pads chip numbers to 4 digits', () => {
    expect(buildChipFileName(1)).toBe('chip-0001.md');
    expect(buildChipFileName(42)).toBe('chip-0042.md');
  });

  it('extracts chip path info', () => {
    expect(extractChipPathInfo('CHIPs/chip-0042.md')).toEqual({
      number: 42,
      filename: 'CHIPs/chip-0042.md',
    });
    expect(extractChipPathInfo('CHIPs/chip-0001.md')).toEqual({
      number: 1,
      filename: 'CHIPs/chip-0001.md',
    });
    expect(extractChipPathInfo('README.md')).toBeNull();
  });
});
