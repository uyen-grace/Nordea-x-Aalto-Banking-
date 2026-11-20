// Everything the customer tells Abel about themselves is saved to About you, as they said it.
//
// Runs on every chat message, before Abel answers (so Abel already knows it). Questions, greetings,
// thanks and one-word replies are skipped. A sentence about work, home life, housing, plans or risk
// replaces that part of About you; anything else personal becomes a note. Health and similar topics
// are saved as private (only Abel). Every save shows in the chat with Undo, and can be changed or
// deleted in What Abel knows.
import { db } from './db.js';
import { CabinetEntry, ProfileField } from '../types.js';

const QUESTION = /\?\s*$|^(what|how|can|could|should|would|will|am|is|are|do|does|did|where|when|why|which|who|tell me|show me|help me|plan|give me|explain)\b/i;
const SMALL = /^(hi|hey|hello|moi|thanks|thank you|kiitos|ok|okay|yes|no|sure|great|nice|cool|bye|good (morning|evening|night))\b[\s!.]*$/i;
const PERSONAL = /\b(i|i'm|i’m|im|i've|i’ve|my|we|we're|we’re|our|me)\b/i;
const SENSITIVE = /\b(pregnan|baby on the way|ill|illness|sick|cancer|diagnos|therapy|depress|anxiety|divorce|break ?up|debt collector|gambl)/i;

const FIELDS: [ProfileField, RegExp][] = [
  ['life_situation', /\b(student|studying|studies|master['’]?s|bachelor|university|new job|start(ed|ing)? (a |my )?(job|work)|lost my job|unemployed|laid off|parental leave|maternity|paternity|retir(ed|ing)|work as|working as)\b/i],
  ['household', /\b(partner|girlfriend|boyfriend|wife|husband|married|engaged|wedding|kids?|children|child|son|daughter|baby|single|live alone|flatmates?|roommates?)\b/i],
  ['housing', /\b(rent(ing)?|our flat|my flat|my apartment|own (a|my|our) (flat|home|house|apartment)|bought (a|our) (flat|home|house)|mortgage|moved|moving)\b/i],
  ['ambition', /\b(want to|wanna|plan to|planning to|hope to|dream|saving for|goal is|would like to)\b/i],
  ['risk', /\b(risk|risky|stocks?|shares|funds?|crypto|keep (it|my savings) safe|safe savings)\b/i],
];

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Saves what the customer said about themselves. Returns chat notes ("📌 Saved to About you: …"). */
export function rememberFromChat(userId: string, text: string): { text: string; undoToken?: string; entryId?: string }[] {
  const notes: { text: string; undoToken?: string; entryId?: string }[] = [];
  const now = () => new Date().toISOString();
  const all = db.getCabinetEntries(userId);
  for (const raw of sentencesOf(text).slice(0, 4)) {
    const s = raw.replace(/[.!]+$/, '').slice(0, 140);
    if (s.split(/\s+/).length < 4 || QUESTION.test(s) || SMALL.test(s) || !PERSONAL.test(s)) continue;
    // Work, housing and income are what Nordea already sees in the accounts: what they say about those is
    // kept as a note next to it (it never silently replaces the bank's facts). Home life, plans and risk
    // are the customer's to tell, so a statement there becomes that part of About you.
    const hit = FIELDS.find(([, re]) => re.test(s))?.[0];
    const field = (hit === 'household' || hit === 'ambition' || hit === 'risk' ? hit : 'more') as ProfileField;
    const priv = SENSITIVE.test(s);
    const existing = field === 'more' ? undefined : all.find((e) => e.type === 'profile' && e.profileField === field && e.source === 'customer' && e.status === 'active');
    if (existing && existing.title.toLowerCase() === s.toLowerCase()) continue;
    if (all.some((e) => e.type === 'profile' && e.status === 'active' && e.title.toLowerCase() === s.toLowerCase())) continue;
    const undoToken = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (existing) {
      const prev = { ...existing };
      db.updateCabinetEntry(existing.id, { title: s, detail: 'Said in chat', private: priv || existing.private, confirmedAt: now() }, { by: 'you', how: 'From your chat' });
      db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'update', description: `Updated "${prev.title}"`, previousEntry: prev, entryId: existing.id });
      notes.push({ text: `📌 Updated in About you: ${s}${priv ? ' 🔒' : ''}`, undoToken, entryId: existing.id });
    } else {
      const e: CabinetEntry = {
        id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId, type: 'profile', profileField: field,
        title: s, detail: 'Said in chat', source: 'customer', status: 'active', private: priv,
        readableBy: { abel: true, offers: !priv }, provenance: { channel: 'app' }, reviewed: true,
        confirmedAt: now(), createdAt: now(), updatedAt: now(),
      };
      db.addCabinetEntry(e, { by: 'you', how: 'From your chat' });
      db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'create', description: `Added "${s}"`, previousEntry: null, entryId: e.id });
      notes.push({ text: `📌 Saved to About you: ${s}${priv ? ' 🔒 private' : ''}`, undoToken, entryId: e.id });
      all.push(e);
    }
  }
  return notes;
}
