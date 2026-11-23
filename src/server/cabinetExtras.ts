// What Abel knows, made dynamic and consent-based:
//   - Sources: which sources may fill the cabinet (only Nordea data works today; the rest are "coming later").
//   - Updated automatically: what Nordea's data or a payslip changed in the cabinet, each with Undo.
//   - Demo: bring in a new payslip and new bank data, to show the cabinet updating itself.
import type { Express, Request } from 'express';
import { db } from './db.js';
import { loadHistory } from './arch/store/cmStore.js';
import { loadBus } from './arch/store/busStore.js';
import { decideProposal } from './arch/orchestrator.js';
import type { CabinetEntry, EntryEvent } from '../types.js';

export const SOURCES = ['nordea', 'register', 'chats', 'assistant'] as const;
export type SourceId = (typeof SOURCES)[number];
/** Only Nordea's own data is connected in this prototype. */
export const WORKING: SourceId[] = ['nordea'];

const now = () => new Date().toISOString();
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const uidOf = (req: Request) => String((req.method === 'GET' ? req.query.userId : req.body?.userId) || 'lauri');

/** The customer's source switches. Nordea data is on unless they turned it off. */
export function sourcesOf(userId: string): Record<SourceId, boolean> {
  const saved = ((db.getUser(userId) as unknown as { sources?: Record<string, boolean> } | undefined)?.sources) || {};
  return { nordea: saved.nordea !== false, register: false, chats: false, assistant: false };
}

/** A write the customer already agreed to (by keeping the source on) lands straight away. */
function landNow(userId: string, entryId: string) {
  const waiting = loadBus(userId).messages.find((m) => m.type === 'propose' && m.status === 'pending'
    && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === entryId);
  if (waiting) decideProposal(userId, waiting.id, true);
}

/** Automatic updates: events made by Nordea's data or a payslip, newest first, with whether they were undone. */
function recent(userId: string) {
  let events: EntryEvent[] = [];
  try { events = loadHistory(userId); } catch { events = []; }
  const auto = (e: EntryEvent) => e.by === 'nordea' && /automatic/i.test(e.how || '');
  const undone = (e: EntryEvent) => events.some((x) => x.entryId === e.entryId && x.at >= e.at && /^You undid/.test(x.how || ''));
  return events.filter(auto).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8).map((e) => ({
    id: e.id, entryId: e.entryId, at: e.at, action: e.action, title: e.title, how: e.how || '',
    from: /payslip/i.test(e.how || '') ? 'payslip' : 'bank', undone: undone(e),
  }));
}

export function registerCabinetExtraRoutes(app: Express) {
  app.get('/api/sources', (req, res) => res.json({ sources: sourcesOf(uidOf(req)), working: WORKING }));

  app.post('/api/sources', (req, res) => {
    const userId = uidOf(req);
    const source = String(req.body?.source || '') as SourceId;
    if (!WORKING.includes(source)) return res.status(400).json({ error: 'That source isn’t available yet' });
    const u = db.getUser(userId) as unknown as { sources?: Record<string, boolean> } | undefined;
    if (!u) return res.status(404).json({ error: 'Customer not found' });
    db.updateUser(userId, { sources: { ...(u.sources || {}), [source]: !!req.body?.on } } as never);
    res.json({ sources: sourcesOf(userId), working: WORKING });
  });

  app.get('/api/cabinet/recent', (req, res) => res.json({ updates: recent(uidOf(req)) }));

  // Undo one automatic update: a new item is removed, a changed item gets its old values back.
  app.post('/api/cabinet/recent/undo', (req, res) => {
    const userId = uidOf(req);
    let events: EntryEvent[] = [];
    try { events = loadHistory(userId); } catch { events = []; }
    const ev = events.find((e) => e.id === req.body?.id);
    if (!ev) return res.status(404).json({ error: 'That update is gone' });
    const entry = db.getCabinetEntry(ev.entryId);
    if (!entry || entry.userId !== userId) return res.status(404).json({ error: 'That item is gone' });
    const how = 'You undid an automatic update';
    if (ev.action === 'added') {
      db.updateCabinetEntry(entry.id, { status: 'archived' }, { by: 'you', how });
    } else {
      const back: Partial<CabinetEntry> = {};
      for (const c of ev.changes || []) (back as Record<string, unknown>)[c.field] = c.from ?? undefined;
      db.updateCabinetEntry(entry.id, back, { by: 'you', how });
    }
    res.json({ updates: recent(userId) });
  });

  // Demo: a new payslip and a month of bank data arrive. Only works while Nordea data is on.
  app.post('/api/cabinet/demo/new-data', (req, res) => {
    const userId = uidOf(req);
    if (!sourcesOf(userId).nordea) return res.status(400).json({ error: 'Nordea data is off, so nothing was updated. Turn it on in Sources.' });
    const entries = db.getCabinetEntries(userId);
    const added: string[] = [];
    const put = (key: string, e: Omit<CabinetEntry, 'id' | 'userId' | 'status' | 'reviewed' | 'createdAt' | 'updatedAt' | 'readableBy'>, how: string) => {
      const existing = entries.find((x) => x.provenance?.detectedFrom === key && x.status !== 'archived');
      if (existing) {
        db.updateCabinetEntry(existing.id, { title: e.title, detail: e.detail, status: 'active' }, { by: 'nordea', how });
        return;
      }
      const full: CabinetEntry = { ...e, id: newId('entry'), userId, status: 'active', reviewed: true, readableBy: { abel: true, offers: false }, createdAt: now(), updatedAt: now() };
      db.addCabinetEntry(full, { by: 'nordea', how });
      landNow(userId, full.id);
      added.push(full.title);
    };
    put('payslip-bonus', {
      type: 'fact', title: 'Bonus of 1 200 € on 20 December', detail: 'Before tax. From your November payslip.',
      source: 'document', private: false, provenance: { channel: 'app', detectedFrom: 'payslip-bonus' },
      why: 'Your employer’s payslip came in to your Nordea account.',
    }, 'Updated automatically from your payslip');
    put('bank-gym', {
      type: 'fact', title: 'New monthly payment: gym, 49 €', detail: 'Paid around the 18th of each month.',
      source: 'nordea', private: false, provenance: { channel: 'system', detectedFrom: 'bank-gym' },
      why: 'The same 49 € gym payment showed up two months in a row.',
    }, 'Updated automatically from your bank data');
    res.json({ updates: recent(userId), added });
  });
}
