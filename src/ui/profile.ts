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
export function interviewFields(entries: CabinetEntry[], max = 5, covered: string[] = []): ProfileField[] {
  // Nordea already knows some fields from the account data (covered): no need to ask those.
  const askable = PROFILE_FIELDS.filter((f) => f.question && !f.optional && !covered.includes(f.key));
  const empty = askable.filter((f) => !profileEntryFor(entries, f.key)).map((f) => f.key);
  const toConfirm = askable.filter((f) => isUnconfirmed(profileEntryFor(entries, f.key))).map((f) => f.key);
  return [...empty, ...toConfirm].slice(0, max);
}

/** Fields nobody has filled yet (Nordea's unconfirmed guesses don't count as empty: they wait for a yes). */
export const emptyFields = (entries: CabinetEntry[], covered: string[] = []): ProfileField[] =>
  PROFILE_FIELDS.filter((f) => f.question && !f.optional && !covered.includes(f.key) && !profileEntryFor(entries, f.key)).map((f) => f.key);

/** The profile fields Nordea's data already answers (from the server's About you). */
export const coveredFields = (about?: { facts: { key: string; from: string }[] }): string[] =>
  (about?.facts || []).filter((f) => f.from === 'nordea').map((f) => f.key);

/** About you as one short paragraph, like Claude's memory: "Lauri, 31, lives in Helsinki. Works full-time. …"
 *  Only what Abel may use: the customer's own answers and what they confirmed. */
export function aboutParagraph(name: string, entries: CabinetEntry[], age?: number): string {
  const val = (f: ProfileField) => {
    const e = profileEntryFor(entries, f);
    return e && !isUnconfirmed(e) ? e.title.trim().replace(/[.!]+$/, '') : '';
  };
  const low = (s: string) => (s && !/^[A-ZÅÄÖ]{2}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Short: related facts share one sentence. "Lauri, 31. Works, steady salary. Lives with a partner, rents. …"
  const sentence = (...fs: ProfileField[]) => {
    const vs = fs.map(val).filter(Boolean);
    return vs.length ? `${cap(vs[0])}${vs.slice(1).map((v) => `, ${low(v)}`).join('')}.` : '';
  };
  // No basics entry yet: start with what Nordea always knows - the name and age on the account.
  const first = val('basics') ? `${name}, ${val('basics')}.` : age ? `${name}, ${age}.` : `${name}.`;
  return [first, sentence('life_situation', 'income'), sentence('household', 'housing'), sentence('ambition', 'risk'), sentence('more')].filter(Boolean).join(' ');
}
