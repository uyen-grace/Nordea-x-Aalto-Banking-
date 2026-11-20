// About you, worked out live from everything Nordea holds, plus what the customer said.
//
// Nothing here is stored: every time the app or Abel asks, it is computed again from the account
// data (salary, rent, saving, spending, transport) and from what the customer told Abel. So it is
// never empty and always current, whatever state the stores are in.
//
// Account-opening details (city, customer since, occupation) are FICTIONAL demo values: a real bank
// collects them when the account is opened (know-your-customer). A user record can override them
// with its own city / customerSince / occupation fields.
import { db } from './db.js';
import * as fin from './finance.js';
import { CabinetEntry, ProfileField } from '../types.js';
import { PROFILE_FIELD } from '../profileFields.js';

const OPENING: Record<string, { city: string; since: number; occupation?: string }> = {
  lauri: { city: 'Helsinki', since: 2017, occupation: 'a UX designer' },
  eeva: { city: 'Tampere', since: 1979, occupation: 'a retired teacher' },
  alex: { city: 'Espoo', since: 2026, occupation: 'a junior developer' },
};

export interface AboutFact {
  /** Which part of About you (profile fields, plus a few bank-only ones). */
  key: ProfileField | 'since' | 'saving' | 'spending' | 'transport';
  label: string;
  text: string;
  from: 'you' | 'nordea';
  /** Why Nordea knows it (bank facts). */
  why?: string;
  /** The customer's own entry behind it (for Change / Delete). */
  entryId?: string;
}
export interface About { text: string; facts: AboutFact[] }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const eur = (n: number) => `${Math.round(n).toLocaleString('fi-FI').replace(/\s/g, ' ')} €`;
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string) => (/^[A-ZÅÄÖ]{2}/.test(s) || /^(I|I’m|I'm)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const clean = (s: string) => s.trim().replace(/[.!]+$/, '');

/** The customer's own current answer for a field (what they said wins over what Nordea worked out). */
function mine(entries: CabinetEntry[], field: ProfileField): CabinetEntry | undefined {
  return entries
    .filter((e) => e.type === 'profile' && e.profileField === field && e.source === 'customer' && e.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** A chat statement reads as a quote; an answer from the interview reads as a phrase. */
const said = (e: CabinetEntry) => (e.detail === 'Said in chat' ? `“${clean(e.title)}”` : clean(e.title));

/**
 * @param entries what this reader may see (Abel: what the access gateway allowed; the app: everything active).
 */
export function aboutFor(userId: string, entries: CabinetEntry[]): About {
  const u = db.getUser(userId);
  if (!u) return { text: '', facts: [] };
  const open = { ...(OPENING[userId] || OPENING[u.persona] || {}), ...((u as any).city ? { city: (u as any).city } : {}), ...((u as any).customerSince ? { since: (u as any).customerSince } : {}), ...((u as any).occupation ? { occupation: (u as any).occupation } : {}) } as { city?: string; since?: number; occupation?: string };
  const facts: AboutFact[] = [];
  const bank = (key: AboutFact['key'], text: string, why: string) => facts.push({ key, label: PROFILE_FIELD[key as ProfileField]?.label || LABEL[key] || key, text, from: 'nordea', why });
  const you = (key: ProfileField, e: CabinetEntry) => facts.push({ key, label: PROFILE_FIELD[key].label, text: said(e), from: 'you', entryId: e.id });

  // ---- what Nordea knows from opening the account
  const basics = mine(entries, 'basics');
  if (basics) you('basics', basics);
  else bank('basics', `${u.age}${open.city ? `, lives in ${open.city}` : ''}`, 'From your ID and address when you opened your account.');
  if (open.since) bank('since', `Nordea customer since ${open.since}`, 'When your first account was opened.');

  // ---- what Nordea sees in the accounts
  const tx = db.getTransactions(userId);
  const pays = tx.filter((t) => t.category === 'salary' || t.category === 'pension').sort((a, b) => a.date.localeCompare(b.date));
  const pension = pays.length > 0 && pays[pays.length - 1].category === 'pension';
  const sal = fin.salaryInfo(userId);

  const life = mine(entries, 'life_situation');
  if (life) you('life_situation', life);
  else if (sal.found) bank('life_situation', pension ? `Retired${open.occupation ? ` (${open.occupation.replace(/^a retired /, '')})` : ''}` : `Works full-time${open.occupation ? ` as ${open.occupation}` : ''}`,
    pension ? 'A pension arrives every month.' : `A salary arrives on the ${sal.payday}th every month; your job is from your account opening.`);

  const income = mine(entries, 'income');
  if (income) you('income', income);
  else if (sal.found) bank('income', `${pension ? 'pension' : 'salary'} ${eur(sal.latest)} a month${sal.changed && sal.difference > 0 ? ` (up ${eur(sal.difference)} in ${monthName(sal.changeMonth!)})` : ''}`,
    `${pension ? 'Your pension' : 'Your salary'} payments into your current account.`);

  const housing = mine(entries, 'housing');
  const rent = tx.filter((t) => t.category === 'housing' && t.amount < 0).sort((a, b) => b.date.localeCompare(a.date));
  if (housing) you('housing', housing);
  else if (new Set(rent.slice(0, 6).map((t) => t.date.slice(0, 7))).size >= 3) {
    const loan = rent.some((t) => /loan|mortgage|laina/i.test(t.description || ''));
    bank('housing', `${loan ? 'pays a home loan of' : 'rents for'} about ${eur(Math.abs(rent[0].amount))} a month`, `A ${loan ? 'loan' : 'rent'} payment goes out on the ${Number(rent[0].date.slice(8, 10))}st every month.`);
  }

  const acc = fin.accounts(userId);
  if (acc && acc.savings.monthlyDeposit > 0) bank('saving', `saves ${eur(acc.savings.monthlyDeposit)} a month (${eur(acc.savings.balance)} saved)`, 'Your monthly transfer to savings and your savings balance.');

  // Eating out: the last 3 months against the 6 before.
  const avg = (from: number, n: number) => {
    let s = 0;
    for (let i = from; i < from + n; i++) s += fin.monthSpend(userId, fin.addMonths(fin.CUR_MONTH, -i)).restaurants || 0;
    return s / n;
  };
  const recent = avg(1, 3), before = avg(4, 6);
  if (recent > 0 && before > 0 && recent > before * 1.5 && recent - before >= 100) {
    bank('spending', `eats out more lately (about ${eur(recent)} a month, usually ${eur(before)})`, 'Restaurant and café payments in the last 3 months compared with the 6 before.');
  }
  if (tx.filter((t) => t.category === 'transport' && /HSL|VR|Nysse|transit/i.test(t.description || '')).length >= 3) {
    bank('transport', 'uses public transport', 'Regular public transport card payments.');
  }

  // ---- what the customer told us
  for (const k of ['household', 'ambition', 'risk'] as const) { const e = mine(entries, k); if (e) you(k, e); }
  const notes = entries.filter((e) => e.type === 'profile' && e.profileField === 'more' && e.source === 'customer' && e.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const e of notes) facts.push({ key: 'more', label: PROFILE_FIELD.more.label, text: said(e), from: 'you', entryId: e.id });
  // In the paragraph, interview answers read as phrases; things said in chat are quoted together, newest first.
  const chatSaid = entries.filter((e) => e.type === 'profile' && e.source === 'customer' && e.status === 'active' && e.detail === 'Said in chat')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const phrase = (k: ProfileField) => { const e = mine(entries, k); return e && e.detail !== 'Said in chat' ? clean(e.title) : undefined; };

  // ---- the paragraph: short, like a memory note
  const get = (k: AboutFact['key']) => facts.find((f) => f.key === k)?.text;
  const join = (...xs: (string | undefined)[]) => xs.filter(Boolean).map((x, i) => (i ? low(x!) : cap(x!))).join(', ');
  const sentences = [
    `${u.name}, ${get('basics')}.${get('since') ? ` ${get('since')}.` : ''}`,
    join(get('life_situation'), get('income')),
    join(get('housing'), get('saving')),
    join(get('spending'), get('transport')),
    join(phrase('household')),
    join(phrase('ambition'), phrase('risk')),
    chatSaid.length ? `Told Abel: ${chatSaid.slice(0, 3).map((e) => `“${clean(e.title)}”`).join(', ')}` : '',
  ].filter(Boolean).map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));
  return { text: sentences.join(' '), facts };
}

const LABEL: Record<string, string> = { since: 'Customer', saving: 'Saving', spending: 'Spending', transport: 'Getting around' };

/** Fields Nordea already answers from its data (the interview doesn't need to ask them). */
export function coveredByBank(about: About): ProfileField[] {
  return about.facts.filter((f) => f.from === 'nordea').map((f) => f.key).filter((k): k is ProfileField => k in PROFILE_FIELD);
}
