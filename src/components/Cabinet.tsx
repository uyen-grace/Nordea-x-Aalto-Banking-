import React, { useEffect, useState } from 'react';
import { AppState, ApprovalCard, PipeItem, fetchApprovalCards, decideApprovalCard, fetchPipelineWaiting, decidePipelineItem, SOURCE_NAME, confirmObservation, updateCabinetEntry, deleteCabinetEntry } from '../services/api.js';
import { Decide, Decision } from '../ui/Decide.js';
import { CabinetEntry, ProfileField } from '../types.js';
import { Icon, Chevron } from '../ui/icons.js';
import { eur, monthShort, n0 } from '../ui/format.js';
import { BAND_BG } from './Nordea.js';
import { HistoryList, DocsSection } from './Pages.js';
import { Choice } from '../ui/Choice.js';
import { PROFILE_FIELDS, PROFILE_FIELD } from '../profileFields.js';
import { profileEntryFor, isUnconfirmed, emptyFields, aboutParagraph } from '../ui/profile.js';
import { originOf } from '../entrySource.js';

/**
 * What Abel knows: four parts, nothing else.
 *   About you         - a short paragraph (like Claude's memory). Tap to see and edit the details.
 *   Waiting for you   - everything that needs a yes or no.
 *   Added by you      - goals and notes the customer set.
 *   Added by Nordea   - what Nordea noticed and the customer confirmed. "Why" opens on tap.
 * Every item gets the same three choices: Share / Keep private / Delete (src/ui/Decide.tsx).
 */

export interface KnowsProps {
  state: AppState;
  onAddGoal: () => void;
  onTellAbel: () => void;
  onImport: () => void;
  onPrivacy: () => void;
  onAskAbout: (text: string) => void;
  onUpdate: (e: CabinetEntry, updates: Partial<CabinetEntry>) => void;
  onArchive: (e: CabinetEntry) => void;
  /** Confirming what Nordea noticed (+10 points; Abel follows up on a salary change). */
  onConfirm: (e: CabinetEntry) => void;
  /** An out-of-date goal is still a plan. */
  onKeep: (e: CabinetEntry) => void;
  onDeleteDoc: (id: string) => void;
  onChanged?: () => void;
  /** Open the About you interview (everything missing, or one field). */
  onInterview: (only?: ProfileField) => void;
  onToast?: (message: string, undoToken?: string) => void;
}

/** Share / Keep private / Delete on one entry. Used here and on Home, so both behave the same. */
export async function applyDecision(userId: string, e: CabinetEntry, d: Decision): Promise<{ message: string; undoToken?: string }> {
  const guess = fromNordea(e) && !e.reviewed;
  try {
    if (d === 'keep') {
      const r = await updateCabinetEntry(e.id, { status: 'active', confirmedAt: new Date().toISOString() });
      return { message: 'Kept', undoToken: r.undoToken };
    }
    if (d === 'delete') {
      // A Nordea guess the customer rejects is marked wrong (so the same data doesn't suggest it again);
      // anything else is archived. Both stay at the bottom of the page and can be restored.
      if (guess) { await updateCabinetEntry(e.id, { status: 'disputed' }); return { message: 'Deleted' }; }
      const r = await deleteCabinetEntry(e.id);
      return { message: 'Deleted', undoToken: r.undoToken };
    }
    if (guess) await confirmObservation(userId, e.id);
    const priv = d === 'private';
    const r = await updateCabinetEntry(e.id, { private: priv, readableBy: { ...e.readableBy, abel: true, offers: !priv } });
    return { message: priv ? 'Kept private' : 'Shared', undoToken: r.undoToken };
  } catch {
    return { message: 'That didn’t work. Try again.' };
  }
}

/** Share / Keep private / Delete, applied to one entry. */
type Apply = (e: CabinetEntry, d: Decision) => void;
const currentOf = (e: CabinetEntry): Decision => (e.private ? 'private' : 'share');

const fromNordea = (e: CabinetEntry) => originOf(e) === 'nordea' || originOf(e) === 'register';
const SHORT_ORIGIN = { you: 'You', document: 'You', nordea: 'Nordea', register: 'Register', hidden: '' } as const;

/** A section heading: title, optional count, optional action on the right. */
const Head: React.FC<{ title: string; count?: number; action?: React.ReactNode }> = ({ title, count, action }) => (
  <div className="cab-h">
    <h2>{title}{count ? <span className="cab-n">{count}</span> : null}</h2>
    {action}
  </div>
);

/** "Why Nordea noticed this" - closed until tapped. */
const Why: React.FC<{ e: CabinetEntry }> = ({ e }) => {
  const [open, setOpen] = useState(false);
  if (!e.why || !fromNordea(e)) return null;
  return (
    <>
      <button className="cab-why" aria-expanded={open} onClick={(ev) => { ev.stopPropagation(); setOpen(!open); }}>
        Why Nordea noticed this <Chevron rotate={open ? -90 : 90} size={13} />
      </button>
      {open && <p className="cab-why-t">{e.why}</p>}
    </>
  );
};

/** One item in Added by you / Added by Nordea. Tap to show its actions. */
const Item: React.FC<{ e: CabinetEntry; apply: Apply }> = ({ e, apply }) => {
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState(false);
  return (
    <div className={`cab-item${open ? ' open' : ''}`}>
      <button className="cab-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="cab-t">
          <b>{e.title}{e.private && <Icon name="lock" size={13} className="cab-lock" />}</b>
          {e.detail && <span className={open ? '' : 'clamp1'}>{e.detail}</span>}
        </span>
        <Chevron rotate={open ? -90 : 90} size={14} />
      </button>
      <Why e={e} />
      {open && (
        <div className="cab-act">
          <Decide current={currentOf(e)} onPick={(d) => apply(e, d)} label={e.title} />
          <button className="cab-more" aria-expanded={hist} onClick={() => setHist(!hist)}>{hist ? 'Hide history' : 'History'}</button>
          {hist && <HistoryList userId={e.userId} entryId={e.id} />}
        </div>
      )}
    </div>
  );
};

export const KnowsPage: React.FC<KnowsProps> = (p) => {
  const { state } = p;
  const name = state.user.name;
  const [aboutOpen, setAboutOpen] = useState(false);
  const [oldOpen, setOldOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);

  // Inputs from glasses / WhatsApp / documents, and cards waiting for approval, also wait here.
  const [pipe, setPipe] = useState<PipeItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const loadPipe = () => fetchPipelineWaiting(state.user.id).then(setPipe);
  const loadApprovals = () => fetchApprovalCards(state.user.id).then(setApprovals);
  useEffect(() => { loadPipe(); loadApprovals(); }, [state.user.id, state.entries.length]);
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) loadPipe(); }, 4000); return () => window.clearInterval(t); }, [state.user.id]);
  const decidePipe = async (id: string, a: 'save' | 'private' | 'drop') => { await decidePipelineItem(state.user.id, id, a); await loadPipe(); p.onChanged?.(); };
  const decideApproval = async (id: string, ok: boolean) => { await decideApprovalCard(state.user.id, id, ok); await loadApprovals(); };

  const apply: Apply = async (e, d) => {
    const r = await applyDecision(state.user.id, e, d);
    p.onToast?.(r.message, r.undoToken);
    p.onChanged?.();
  };

  const live = state.entries.filter((e) => e.status !== 'archived' && e.type !== 'blind_spot');
  // Waiting for you
  const guesses = live.filter((e) => fromNordea(e) && !e.reviewed && e.status === 'active');
  const stale = live.filter((e) => e.type === 'goal' && e.status === 'stale');
  const waitingCount = guesses.length + stale.length + pipe.length + approvals.length;
  // Added by you / by Nordea (About you lives in its own card)
  const tracked = new Set(state.goals.map((g) => g.goalId));
  const mine = live.filter((e) => !fromNordea(e) && e.type !== 'profile' && e.status === 'active' && !tracked.has(e.id));
  const nordea = live.filter((e) => fromNordea(e) && e.reviewed && e.type !== 'profile' && e.status === 'active');
  const old = state.entries.filter((e) => e.status === 'archived' || e.status === 'disputed');
  // About you
  const paragraph = aboutParagraph(name, state.entries);
  const missing = emptyFields(state.entries).length;

  return (
    <>
      <header className="nhead detail kn-head" style={{ backgroundImage: BAND_BG }}>
        <div className="dh-top">
          <span className="dh-back" />
          <b>What Abel knows</b>
          <button className="dh-side" onClick={p.onPrivacy}><Icon name="shield" />Privacy</button>
        </div>
        <p className="kn-sub">Share: Nordea can use it · Keep private: only Abel</p>
      </header>

      <div className="nbody cab">
        {/* ---------- About you ---------- */}
        <section className="cab-card">
          <Head title="About you" />
          <p className="about-p">{paragraph || 'Nothing yet.'}</p>
          {aboutOpen && (
            <div className="about-list">
              {PROFILE_FIELDS.map((f) => {
                const e = profileEntryFor(state.entries, f.key);
                const shown = e && !isUnconfirmed(e) ? e : undefined;
                return (
                  <div className="about-row" key={f.key}>
                    <span className="about-k">{f.label}</span>
                    <span className="about-v">
                      {shown ? shown.title : <i>Not set</i>}
                      {shown && <span className={`about-src src-${originOf(shown)}`}>{SHORT_ORIGIN[originOf(shown)]}</span>}
                    </span>
                    {f.question && <button className="btn link" onClick={() => p.onInterview(f.key)}>{shown ? 'Edit' : 'Add'}</button>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="about-foot">
            <button className="cab-more" aria-expanded={aboutOpen} onClick={() => setAboutOpen(!aboutOpen)}>
              {aboutOpen ? 'Less' : 'Details'} <Chevron rotate={aboutOpen ? -90 : 90} size={13} />
            </button>
            {missing > 0 && <button className="btn small primary" onClick={() => p.onInterview()}>Add more</button>}
          </div>
        </section>

        {/* ---------- Waiting for you ---------- */}
        <section className="cab-card">
          <Head title="Waiting for you" count={waitingCount} />
          {waitingCount === 0 && <p className="cab-empty">All checked ✓</p>}
          {guesses.map((e) => (
            <div className="cab-wait" key={e.id}>
              <span className="cab-tag bank">Nordea noticed</span>
              <b>{e.type === 'profile' && e.profileField ? `${PROFILE_FIELD[e.profileField].label}: ${e.title}` : e.title}</b>
              {e.detail && <span className="cab-d">{e.detail}</span>}
              <Why e={e} />
              <Decide onPick={(d) => apply(e, d)} label={e.title} />
            </div>
          ))}
          {stale.map((e) => (
            <div className="cab-wait" key={e.id}>
              <span className="cab-tag you">Your old goal</span>
              <b>Still saving for “{e.title}”?</b>
              <Decide options={['keep', 'delete']} onPick={(d) => apply(e, d)} label={e.title} />
            </div>
          ))}
          {pipe.map((c) => (
            <div className="cab-wait" key={c.id}>
              <span className="cab-tag you">{SOURCE_NAME[c.source]}</span>
              <b>{c.title}</b>
              <Decide onPick={(d) => decidePipe(c.id, d === 'share' ? 'save' : d === 'private' ? 'private' : 'drop')} label={c.title} />
            </div>
          ))}
          {approvals.map((c) => (
            <div className="cab-wait" key={c.id}>
              <b>{c.summary}</b>
              {c.detail && <span className="cab-d">{c.detail}</span>}
              <Decide options={['share', 'delete']} onPick={(d) => decideApproval(c.id, d === 'share')} label={c.summary} />
            </div>
          ))}
        </section>

        {/* ---------- Added by you ---------- */}
        <section className="cab-card">
          <Head title="Added by you" action={<button className="btn link" onClick={p.onAddGoal}><Icon name="plus" size={15} /> Add</button>} />
          {state.goals.length + mine.length === 0 && <p className="cab-empty">Nothing yet. Add a goal or tell Abel.</p>}
          {state.goals.map((g) => (
            <div className={`cab-item${goalOpen === g.goalId ? ' open' : ''}`} key={g.goalId}>
              <button className="cab-row" aria-expanded={goalOpen === g.goalId} onClick={() => setGoalOpen(goalOpen === g.goalId ? null : g.goalId)}>
                <span className="cab-t">
                  <b>{g.title}</b>
                  <span>{n0(g.saved)} of {eur(g.target)} · {monthShort(g.targetDate.slice(0, 7))}</span>
                  <span className="cab-bar"><i style={{ width: `${Math.min(100, g.percentSaved)}%` }} /></span>
                </span>
                <span className={`npill ${g.onTrack ? 'up' : 'down'}`}>{g.onTrack ? 'On track' : `${eur(g.shortBy)} short`}</span>
              </button>
              {goalOpen === g.goalId && (
                <div className="cab-act">
                  {(() => { const e = state.entries.find((x) => x.id === g.goalId); return e ? <Decide current={currentOf(e)} onPick={(d) => apply(e, d)} label={g.title} /> : null; })()}
                  <button className="cab-more" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)}>Ask Abel about it</button>
                </div>
              )}
            </div>
          ))}
          {mine.map((e) => <Item key={e.id} e={e} apply={apply} />)}
        </section>

        {/* ---------- Added by Nordea ---------- */}
        <section className="cab-card">
          <Head title="Added by Nordea" />
          {nordea.length === 0 && <p className="cab-empty">Nothing yet.</p>}
          {nordea.map((e) => <Item key={e.id} e={e} apply={apply} />)}
        </section>

        {/* Deleted (archived or marked wrong): out of the way, can be restored. */}
        {old.length > 0 && (
          <button className="cab-old" aria-expanded={oldOpen} onClick={() => setOldOpen(!oldOpen)}>
            Deleted · {old.length} <Chevron rotate={oldOpen ? -90 : 90} size={13} />
          </button>
        )}
        {oldOpen && (
          <section className="cab-card">
            {old.map((e) => (
              <div className="cab-wait" key={e.id}>
                <b>{e.title}</b>
                <span className="cab-act"><Choice kind="restore" label="Restore" onClick={() => p.onUpdate(e, { status: 'active' })} /></span>
              </div>
            ))}
          </section>
        )}
        {(state.documents || []).length > 0 && <DocsSection userId={state.user.id} docs={state.documents} onDelete={p.onDeleteDoc} />}
      </div>
    </>
  );
};
