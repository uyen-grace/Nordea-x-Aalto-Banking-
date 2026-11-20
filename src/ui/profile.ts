import { CabinetEntry, ProfileField } from '../types.js';
import { PROFILE_FIELDS } from '../profileFields.js';
import { originOf } from '../entrySource.js';

/** The entry that currently fills one "About you" field. What the customer said wins over what Nordea
 *  inferred; a confirmed Nordea entry wins over one still waiting; newest wins after that. */
export function profileEntryFor(entries: CabinetEntry[], field: ProfileField): CabinetEntry | undefined {
  const rank = (e: CabinetEntry) => (originOf(e) === 'you' ? 2 : e.reviewed ? 1 : 0);
  return entries
    .filter((e) => e.type === 'profile' && e.profileField === field && e.status !== 'archived' && e.status !== 'disputed')
    .sort((a, b) => rank(b) - rank(a) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** A Nordea or register entry the customer hasn't said yes to yet. Abel doesn't use it until they do. */
export const isUnconfirmed = (e?: CabinetEntry) => !!e && originOf(e) !== 'you' && originOf(e) !== 'document' && !e.reviewed;

/** What the onboarding interview should ask about, most useful first, at most `max`:
 *  empty fields first, then Nordea's guesses that still need a yes or a correction. */
export function interviewFields(entries: CabinetEntry[], max = 5): ProfileField[] {
  const askable = PROFILE_FIELDS.filter((f) => f.question);
  const empty = askable.filter((f) => !profileEntryFor(entries, f.key)).map((f) => f.key);
  const toConfirm = askable.filter((f) => isUnconfirmed(profileEntryFor(entries, f.key))).map((f) => f.key);
  return [...empty, ...toConfirm].slice(0, max);
}

/** Fields nobody has filled yet (Nordea's unconfirmed guesses don't count as empty: they wait for a yes). */
export const emptyFields = (entries: CabinetEntry[]): ProfileField[] =>
  PROFILE_FIELDS.filter((f) => f.question && !profileEntryFor(entries, f.key)).map((f) => f.key);

/** About you as one short paragraph, like Claude's memory: "Lauri, 31, lives in Helsinki. Works full-time. …"
 *  Only what Abel may use: the customer's own answers and what they confirmed. */
export function aboutParagraph(name: string, entries: CabinetEntry[]): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return PROFILE_FIELDS.map((f) => {
    const e = profileEntryFor(entries, f.key);
    if (!e || isUnconfirmed(e)) return '';
    const t = e.title.trim().replace(/[.!]+$/, '');
    return f.key === 'basics' ? `${name}, ${t}.` : `${cap(t)}.`;
  }).filter(Boolean).join(' ');
}
