/** Loose normalization for comparing spoken names with stored names. */
export const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\b(the|a|an|your|his|her|their|my)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
