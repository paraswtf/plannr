import { z } from "zod";

/**
 * Shape of a people-import CSV.
 *
 * Kept separate from the diffing so the column rules can be read — and tested —
 * on their own.
 */

/** Symbiosis PRNs are 11 digits. One place to change if that ever moves. */
export const PRN_REGEX = /^\d{11}$/;

export const IMPORT_COLUMNS = [
  "name",
  "email",
  "prn",
  "roles",
  "groups",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Header spellings a registry export is likely to use. */
const HEADER_ALIASES: Record<string, ImportColumn> = {
  name: "name",
  "full name": "name",
  fullname: "name",
  student: "name",
  email: "email",
  "email address": "email",
  mail: "email",
  prn: "prn",
  "prn no": "prn",
  "prn number": "prn",
  registration: "prn",
  "roll no": "prn",
  role: "roles",
  roles: "roles",
  group: "groups",
  groups: "groups",
  division: "groups",
  batch: "groups",
};

/** Maps a CSV header to a known column, or null when it is not one we use. */
export function matchColumn(header: string): ImportColumn | null {
  const key = header.trim().toLowerCase().replace(/[_-]+/g, " ");
  return HEADER_ALIASES[key] ?? null;
}

/** Splits a multi-value cell: "BCA-A | BCA-B" or "BCA-A, BCA-B". */
export const splitList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[|,;]/)
    .map((v) => v.trim())
    .filter(Boolean);

export interface ParsedRow {
  line: number;
  name: string;
  email: string;
  prn: string | null;
  roles: string[];
  groups: string[];
}

/** Builds the row validator. The domain is needed to check email addresses. */
export function rowSchema(domain: string) {
  return z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Not a valid email address")
      .refine(
        (v) => v.endsWith(`@${domain.toLowerCase()}`),
        `Must be an @${domain} address`,
      ),
    prn: z
      .string()
      .trim()
      .regex(PRN_REGEX, "PRN must be 11 digits")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    roles: z.string().trim().optional(),
    groups: z.string().trim().optional(),
  });
}

export const MAX_IMPORT_ROWS = 5000;
