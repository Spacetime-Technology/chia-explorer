import { describe, expect, it } from 'vitest';
import { parseChipReadmeIndex } from '../src/chips/readme-index.js';

const README_FIXTURE = `# CHia Improvement Proposals (CHIPs)

This repository contains a list of improvements related to Chia.

## CHIP list

### Living
* [1 - CHia Improvement Proposal (CHIP) process](/CHIPs/chip-0001.md)

### Draft
* [53 - Secure the Bag for distributed payouts](https://github.com/Chia-Network/chips/pull/183)
* [57 - Silent Payments](https://github.com/Chia-Network/chips/pull/198)

### Review (Fast Track)
* None

### Final
* [42 - Protected Single Sided Offers](/CHIPs/chip-0042.md)

### Grandfathered
* [Singletons](https://chialisp.com/singletons) -- A standard for creating puzzles with unique IDs
`;

describe('parseChipReadmeIndex', () => {
  it('parses entries grouped by status section', () => {
    const entries = parseChipReadmeIndex(README_FIXTURE);
    const byStatus = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = byStatus.get(e.status) ?? [];
      arr.push(e);
      byStatus.set(e.status, arr);
    }
    expect(byStatus.get('Living')).toHaveLength(1);
    expect(byStatus.get('Draft')).toHaveLength(2);
    expect(byStatus.get('Final')).toHaveLength(1);
    expect(byStatus.get('Grandfathered')).toHaveLength(1);
  });

  it('skips "None" placeholders', () => {
    const entries = parseChipReadmeIndex(README_FIXTURE);
    expect(entries.find((e) => e.status === 'Review (Fast Track)')).toBeUndefined();
  });

  it('classifies file links and resolves to absolute URLs', () => {
    const entries = parseChipReadmeIndex(README_FIXTURE);
    const chip42 = entries.find((e) => e.number === 42);
    expect(chip42).toBeDefined();
    expect(chip42!.kind).toBe('file');
    expect(chip42!.filename).toBe('CHIPs/chip-0042.md');
    expect(chip42!.url).toBe('https://github.com/Chia-Network/chips/blob/main/CHIPs/chip-0042.md');
    expect(chip42!.prNumber).toBeNull();
  });

  it('classifies PR links', () => {
    const entries = parseChipReadmeIndex(README_FIXTURE);
    const chip57 = entries.find((e) => e.number === 57);
    expect(chip57).toBeDefined();
    expect(chip57!.kind).toBe('pr');
    expect(chip57!.prNumber).toBe(198);
    expect(chip57!.status).toBe('Draft');
    expect(chip57!.url).toBe('https://github.com/Chia-Network/chips/pull/198');
    expect(chip57!.title).toBe('Silent Payments');
  });

  it('classifies external (non-PR, non-file) links', () => {
    const entries = parseChipReadmeIndex(README_FIXTURE);
    const grandfathered = entries.find((e) => e.status === 'Grandfathered');
    expect(grandfathered).toBeDefined();
    expect(grandfathered!.kind).toBe('external');
    expect(grandfathered!.number).toBeNull();
    expect(grandfathered!.title).toBe('Singletons');
  });

  it('handles labels with various separators', () => {
    const entries = parseChipReadmeIndex(README_FIXTURE);
    const chip1 = entries.find((e) => e.number === 1);
    expect(chip1).toBeDefined();
    expect(chip1!.title).toBe('CHia Improvement Proposal (CHIP) process');
  });
});
