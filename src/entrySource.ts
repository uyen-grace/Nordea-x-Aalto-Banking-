import type { CabinetEntry } from './types.js';

/**
 * Where a cabinet entry came from, in the customer's terms. One place decides this, so the
 * badge in the app and the words Abel uses in chat always agree.
 *
 *   you       - the customer set it (in the app, in chat, from their own inputs)
 *   nordea    - Nordea's systems inferred it from account data (salary, spending, rent...)
 *   register  - Nordea fetched it from a public register (e.g. the Population Information System)
 *   document  - read from a document the customer imported
 *   hidden    - a blind spot: something Abel is not allowed to see
 */
export type Origin = 'you' | 'nordea' | 'register' | 'document' | 'hidden';

export function originOf(e: Pick<CabinetEntry, 'type' | 'source' | 'provenance'>): Origin {
  if (e.type === 'blind_spot') return 'hidden';
  if (e.provenance?.channel === 'register') return 'register';
  if (e.source === 'nordea') return 'nordea';
  if (e.source === 'document') return 'document';
  return 'you';
}

/** Short badge text. */
export const ORIGIN_LABEL: Record<Origin, string> = {
  you: 'You set this',
  nordea: 'Nordea noticed this',
  register: 'From a public register',
  document: 'From your document',
  hidden: 'Not shared with Abel',
};

/** How Abel should refer to the source in a reply. */
export const ORIGIN_SAY: Record<Origin, string> = {
  you: 'you told me',
  nordea: 'Nordea noticed this in your account data',
  register: 'this comes from the public register via Nordea',
  document: 'this is from a document you imported',
  hidden: '',
};

/** Filter on the "Abel knows" page. */
export type OriginFilter = 'all' | 'mine' | 'nordea';
export function matchesFilter(e: Pick<CabinetEntry, 'type' | 'source' | 'provenance'>, f: OriginFilter): boolean {
  if (f === 'all') return true;
  const o = originOf(e);
  // "From Nordea" covers everything Nordea brought in: what it inferred and what it fetched from a register.
  return f === 'mine' ? o === 'you' || o === 'document' : o === 'nordea' || o === 'register';
}
