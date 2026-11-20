import React, { useEffect, useState } from 'react';
import { AppState, ApprovalCard, PipeItem, fetchApprovalCards, decideApprovalCard, fetchPipelineWaiting, decidePipelineItem, SOURCE_NAME } from '../services/api.js';
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
}

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
const Item: React.FC<{ e: CabinetEntry; onUpdate: KnowsProps['onUpdate']; onArchive: KnowsProps['onArchive'] }> = ({ e, onUpdate, onArchive }) => {
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
          {fromNordea(e) && <Choice kind="no" label="It’s wrong" onClick={() => onUpdate(e, { status: 'disputed' })} />}
          <Choice kind="archive" label="Archive" onClick={() => onArchive(e)} />
          <Choice kind="more" label={hist ? 'Hide history' : 'History'} expanded={hist} onClick={() => setHist(!hist)} />
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
        <p className="kn-sub">Abel only uses what’s here.</p>
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
              <span className="cab-tag bank"><Icon name="bank" size={12} />Nordea noticed</span>
              <b>{e.type === 'profile' && e.profileField ? `${PROFILE_FIELD[e.profileField].label}: ${e.title}` : e.title}</b>
              {e.detail && <span className="cab-d">{e.detail}</span>}
              <Why e={e} />
              <span className="cab-act">
                <Choice kind="yes" label="Right" onClick={() => p.onConfirm(e)} />
                <Choice kind="no" label="Wrong" onClick={() => (e.type === 'profile' && e.profileField ? p.onInterview(e.profileField) : p.onUpdate(e, { status: 'disputed' }))} />
              </span>
            </div>
          ))}
          {stale.map((e) => (
            <div className="cab-wait" key={e.id}>
              <span className="cab-tag you"><Icon name="person" size={12} />Your old goal</span>
              <b>Still saving for “{e.title}”?</b>
              <span className="cab-act">
                <Choice kind="yes" label="Keep" onClick={() => p.onKeep(e)} />
                <Choice kind="archive" label="Archive" onClick={() => p.onArchive(e)} />
              </span>
            </div>
          ))}
          {pipe.map((c) => (
            <div className="cab-wait" key={c.id}>
              <span className="cab-tag you"><Icon name="person" size={12} />{SOURCE_NAME[c.source]}</span>
              <b>{c.title}</b>
              <span className="cab-act">
                <Choice kind="yes" label="Save" primary={c.filter !== 'private'} onClick={() => decidePipe(c.id, 'save')} />
                <Choice kind="private" label="Private" primary={c.filter === 'private'} onClick={() => decidePipe(c.id, 'private')} />
                <Choice kind="no" label="No" onClick={() => decidePipe(c.id, 'drop')} />
              </span>
            </div>
          ))}
          {approvals.map((c) => (
            <div className="cab-wait" key={c.id}>
              <b>{c.summary}</b>
              {c.detail && <span className="cab-d">{c.detail}</span>}
              <span className="cab-act">
                <Choice kind="yes" label="Approve" onClick={() => decideApproval(c.id, true)} />
                <Choice kind="no" label="Reject" onClick={() => decideApproval(c.id, false)} />
              </span>
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
                  <Choice kind="yes" primary label="Ask Abel" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)} />
                  {(() => { const e = state.entries.find((x) => x.id === g.goalId); return e ? <Choice kind="archive" label="Archive" onClick={() => p.onArchive(e)} /> : null; })()}
                </div>
              )}
            </div>
          ))}
          {mine.map((e) => <Item key={e.id} e={e} onUpdate={p.onUpdate} onArchive={p.onArchive} />)}
        </section>

        {/* ---------- Added by Nordea ---------- */}
        <section className="cab-card">
          <Head title="Added by Nordea" />
          {nordea.length === 0 && <p className="cab-empty">Nothing yet.</p>}
          {nordea.map((e) => <Item key={e.id} e={e} onUpdate={p.onUpdate} onArchive={p.onArchive} />)}
        </section>

        {/* Archived and marked wrong: out of the way, never gone. */}
        {old.length > 0 && (
          <button className="cab-old" aria-expanded={oldOpen} onClick={() => setOldOpen(!oldOpen)}>
            Archived · {old.length} <Chevron rotate={oldOpen ? -90 : 90} size={13} />
          </button>
        )}
        {oldOpen && (
          <section className="cab-card">
            {old.map((e) => (
              <div className="cab-wait" key={e.id}>
                <b>{e.title}</b>
                <span className="cab-d">{e.status === 'disputed' ? 'You said it’s wrong' : 'Archived'}</span>
                <span className="cab-act"><Choice kind="restore" label="Bring back" onClick={() => p.onUpdate(e, { status: 'active' })} /></span>
              </div>
            ))}
          </section>
        )}
        {(state.documents || []).length > 0 && <DocsSection userId={state.user.id} docs={state.documents} onDelete={p.onDeleteDoc} />}
      </div>
    </>
  );
};
