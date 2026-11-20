// About you starts with what Nordea already knows, so it is never empty.
//
// When a customer has no answer yet for a profile field, Nordea fills it from data it already holds:
//   (age comes straight from the customer record, so the paragraph always starts "Lauri, 31.")
//   life situation  - a salary every month -> "Works"; a pension -> "Retired"
//   income          - the same amount on the same day each month -> "Steady salary"
//   housing         - a monthly rent payment -> "Rents" (a guess: waits for the customer's yes)
// Each one is marked as Nordea's, with a one-line reason, and the customer can change or delete it.
// A field is never filled again once it has any entry (even a deleted one), so a "no" stays a no.
import { db } from './db.js';
import * as fin from './finance.js';
import { CabinetEntry, ProfileField } from '../types.js';

const REGISTER = 'Finland’s population register';

export function ensureDerivedProfile(userId: string): number {
  const user = db.getUser(userId);
  if (!user) return 0;
  const profile = db.getCabinetEntries(userId).filter((e) => e.type === 'profile');
  const has = (f: ProfileField) => profile.some((e) => e.profileField === f);
  const now = new Date().toISOString();
  let added = 0;
  // The payments it is based on go with it as evidence, so it counts as observed (not guessed) and can be checked.
  const add = (field: ProfileField, title: string, why: string, opts: { reviewed: boolean; register?: boolean; txIds?: string[] }) => {
    const e: CabinetEntry = {
      id: `${userId}-prof-${field}-nordea`, userId, type: 'profile', profileField: field, title, detail: '', why,
      source: 'nordea', status: 'active', private: false, readableBy: { abel: true, offers: false },
      provenance: opts.register ? { channel: 'register', register: REGISTER } : { channel: 'system', detectedFrom: 'transactions' },
      ...(opts.txIds?.length ? { evidence: { transactionIds: opts.txIds, computedAt: now } } : {}),
      reviewed: opts.reviewed, ...(opts.reviewed ? { confirmedAt: now } : {}), createdAt: now, updatedAt: now,
    };
    db.addCabinetEntry(e, { by: 'nordea', how: 'From what Nordea already knew' });
    added++;
  };

  const tx = db.getTransactions(userId);
  const pays = tx.filter((t) => t.category === 'salary' || t.category === 'pension').sort((a, b) => a.date.localeCompare(b.date));
  const pension = pays.length > 0 && pays[pays.length - 1].category === 'pension';
  const sal = fin.salaryInfo(userId);
  if (sal.found && !has('life_situation')) {
    add('life_situation', pension ? 'Retired' : 'Works',
      pension ? 'A pension arrives every month.' : `A salary arrives on the ${sal.payday}th every month.`, { reviewed: true, txIds: pays.slice(-3).map((t) => t.id) });
  }
  if (sal.found && !has('income')) {
    const last = pays.slice(-3).map((t) => t.amount);
    const steady = last.length >= 3 && Math.max(...last) - Math.min(...last) <= Math.max(...last) * 0.05;
    add('income', pension ? 'Pension' : steady ? 'Steady salary' : 'Income varies',
      steady ? `The same amount has arrived on the same day for the last ${last.length} months.` : 'The amount changes from month to month.', { reviewed: true, txIds: pays.slice(-3).map((t) => t.id) });
  }

  if (!has('housing')) {
    const rent = tx.filter((t) => t.category === 'housing' && t.amount < 0).sort((a, b) => b.date.localeCompare(a.date));
    const months = new Set(rent.slice(0, 6).map((t) => t.date.slice(0, 7)));
    if (months.size >= 3) {
      const loan = rent.some((t) => /loan|mortgage|laina/i.test(t.description || ''));
      const amount = Math.round(Math.abs(rent[0].amount)).toLocaleString('fi-FI');
      add('housing', loan ? 'Owns a home' : 'Rents',
        loan ? `A home loan payment of ${amount} € goes out every month.` : `${amount} € rent goes out every month.`, { reviewed: false, txIds: rent.slice(0, 3).map((t) => t.id) });
    }
  }
  return added;
}
