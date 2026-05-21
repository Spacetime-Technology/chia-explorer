import { describe, expect, it } from 'vitest';
import { parseForksMarkdown } from '../src/chia-docs/parser.js';

const FORKS_FIXTURE = `---
title: Forks
slug: /chia-blockchain/consensus/forks
---

This page lists every hard fork and soft fork of the Chia blockchain. It was last updated on 2026-04-29.

| Activation Block | Activation Date | Type | Build             | Status    | Description                                                                                                                                                    |
| :--------------- | :-------------- | :--- | :---------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \`2 300 000\`      | 2022-07-22      | Soft | 1.3.0             | Activated | [Disallow negative division](https://www.chia.net/2022/03/04/divided-we-fork/)                                                                                 |
| \`5 496 000\`      | 2024-06-13      | Hard | 2.4.0             | Activated | [CHIP-12 Decrease plot filter](https://github.com/Chia-Network/chips/blob/main/CHIPs/chip-0012.md)                                                             |
| \`5 940 000\`      | 2024-09-17      | Soft | 2.4.4             | Activated | Disallow infinity G1 points                                                                                                                                    |
| \`9 562 000\`      | 2026-11         | Hard | ?                 | Planned   | [CHIP-48 & CHIP-49 New Proof of Space](https://github.com/Chia-Network/chips/pull/160)                                                                          |
`;

describe('parseForksMarkdown', () => {
  it('extracts the last updated date', () => {
    const doc = parseForksMarkdown(FORKS_FIXTURE);
    expect(doc.last_updated).toBe('2026-04-29');
  });

  it('parses every row of the combined hard+soft fork table', () => {
    const doc = parseForksMarkdown(FORKS_FIXTURE);
    expect(doc.forks).toHaveLength(4);
  });

  it('parses a soft fork row with a markdown-linked description', () => {
    const doc = parseForksMarkdown(FORKS_FIXTURE);
    const fork = doc.forks.find((f) => f.name === 'Disallow negative division');
    expect(fork).toBeDefined();
    expect(fork!.type).toBe('soft');
    expect(fork!.activation_block).toBe(2_300_000);
    expect(fork!.activation_date).toBe('2022-07-22');
    expect(fork!.build).toBe('1.3.0');
    expect(fork!.status).toBe('Activated');
    expect(fork!.purpose_url).toBe('https://www.chia.net/2022/03/04/divided-we-fork/');
  });

  it('parses a hard fork row', () => {
    const doc = parseForksMarkdown(FORKS_FIXTURE);
    const fork = doc.forks.find((f) => f.name === 'CHIP-12 Decrease plot filter');
    expect(fork).toBeDefined();
    expect(fork!.type).toBe('hard');
    expect(fork!.activation_block).toBe(5_496_000);
    expect(fork!.purpose_url).toBe(
      'https://github.com/Chia-Network/chips/blob/main/CHIPs/chip-0012.md'
    );
  });

  it('falls back to null purpose_url when the description has no link', () => {
    const doc = parseForksMarkdown(FORKS_FIXTURE);
    const fork = doc.forks.find((f) => f.name === 'Disallow infinity G1 points');
    expect(fork).toBeDefined();
    expect(fork!.purpose_url).toBeNull();
    expect(fork!.type).toBe('soft');
  });

  it('handles planned forks with non-ISO dates and unknown builds', () => {
    const doc = parseForksMarkdown(FORKS_FIXTURE);
    const planned = doc.forks.find((f) => f.status === 'Planned');
    expect(planned).toBeDefined();
    expect(planned!.type).toBe('hard');
    expect(planned!.activation_block).toBe(9_562_000);
    expect(planned!.activation_date).toBe('2026-11');
    // "?" is the doc's placeholder for unknown build; we keep the literal value.
    expect(planned!.build).toBe('?');
  });

  it('handles a description with multiple markdown links', () => {
    const md = `It was last updated on 2026-04-29.

| Activation Block | Activation Date | Type | Build | Status  | Description                                                                                                       |
| :--------------- | :-------------- | :--- | :---- | :------ | :---------------------------------------------------------------------------------------------------------------- |
| \`9 562 000\`      | 2026-11         | Hard | 3.0.0 | Planned | [CHIP-48](https://github.com/Chia-Network/chips/pull/160), [CHIP-49](https://github.com/Chia-Network/chips/pull/161) -- New Proof of Space |
`;
    const doc = parseForksMarkdown(md);
    const fork = doc.forks[0]!;
    expect(fork.name).toBe('CHIP-48, CHIP-49 -- New Proof of Space');
    expect(fork.purpose_url).toBe('https://github.com/Chia-Network/chips/pull/160');
  });

  it('returns an empty fork list and null last_updated for an empty document', () => {
    const doc = parseForksMarkdown('');
    expect(doc.last_updated).toBeNull();
    expect(doc.forks).toHaveLength(0);
  });
});
