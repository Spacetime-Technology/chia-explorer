import { z } from 'zod';

export const chipNumberSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .pipe(z.number().int().min(0).max(99999))
  .describe('CHIP number, e.g. 42 or "0042". Accepts the integer or a zero-padded string.');

export const chipStatusFilterSchema = z
  .string()
  .min(1)
  .max(40)
  .optional()
  .describe(
    "Restrict to a status, e.g. 'Final', 'Review', 'Draft', 'Last Call', 'Living', 'Stagnant', 'Withdrawn', 'Obsolete'. Case-insensitive."
  );

export const chipCategoryFilterSchema = z
  .string()
  .min(1)
  .max(40)
  .optional()
  .describe(
    "Restrict to a category, e.g. 'Standards Track', 'Process', 'Informational'. Case-insensitive."
  );

export const includeBodySchema = z
  .boolean()
  .default(false)
  .describe('If true, include the full markdown body of the CHIP. Defaults to false.');

export const searchQuerySchema = z
  .string()
  .min(1)
  .max(200)
  .describe('Case-insensitive keyword matched against title, description, abstract, and authors.');

export const searchSourceSchema = z
  .enum(['merged', 'draft', 'both'])
  .default('both')
  .describe("Where to search: 'merged' (CHIPs on main), 'draft' (open PRs), or 'both' (default).");

export const searchLimitSchema = z
  .number()
  .int()
  .positive()
  .max(100)
  .default(20)
  .describe('Maximum results. Default 20, max 100.');
