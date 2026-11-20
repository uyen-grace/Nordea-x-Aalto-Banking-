import React, { useEffect, useState } from 'react';
import { AppState, ApprovalCard, PipeItem, fetchApprovalCards, decideApprovalCard, fetchPipelineWaiting, decidePipelineItem, SOURCE_NAME, confirmObservation, updateCabinetEntry, deleteCabinetEntry } from '../services/api.js';
import { Decide, Decision } from '../ui/Decide.js';
import { CabinetEntry, ProfileField } from '../types.js';
import { Icon, Chevron } from '../ui/icons.js';
import { eur, monthShort, n0 } from '../ui/format.js';
import { BAND_BG, Band, RoundActions } from './Nordea.js';
import { HistoryList, DocsSection } from './Pages.js';
import { PROFILE_FIELDS, PROFILE_FIELD } from '../profileFields.js';
import { profileEntryFor, isUnconfirmed, emptyFields, interviewFields, aboutParagraph } from '../ui/profile.js';
import { originOf } from '../entrySource.js';
import { tipsFor } from '../ui/personal.js';

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
  /** Changes right after the interview saved: About you scrolls into view and lights up briefly. */
  aboutSavedAt?: number;
  /** Ask Abel something straight away (the personalised cards). */
  onAsk?: (text: string) => void;
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

/** "Why Nordea noticed this" - closed until tapped. */
const Why: React.FC<{ e: CabinetEntry }> = ({ e }) => {
  const [open, setOpen] = useState(false);
  if (!e.why || !fromNordea(e)) return null;
  return (
    <>
      <button className="btn link cab-why" aria-expanded={open} onClick={(ev) => { ev.stopPropagation(); setOpen(!open); }}>
        Why Nordea noticed this <Chevron rotate={open ? -90 : 90} size={13} />
      </button>
      {open && <span className="n-sub">{e.why}</span>}
    </>
  );
};

/** Who added it, in the app's own label style (green dot = you, orange dot = Nordea). */
const From: React.FC<{ e: CabinetEntry }> = ({ e }) => (
  <span className={`from ${fromNordea(e) ? 'bank' : 'you'}`}>{fromNordea(e) ? 'Nordea noticed this' : 'You set this'}</span>
);
type Filter = 'all' | 'mine' | 'nordea';

/** One row in Added by you / Added by Nordea. Tap to show Share / Keep private / Delete. */
const Item: React.FC<{ e: CabinetEntry; apply: Apply }> = ({ e, apply }) => {
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState(false);
  return (
    <div className="nrow2 static wait">
      <span className="n-l">
        <button className="cab-row" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="n-name">{e.title}{e.private && <Icon name="lock" size={14} className="cab-lock" />}</span>
          <Chevron rotate={open ? -90 : 90} size={14} />
        </button>
        {e.detail && <span className={`n-sub${open ? '' : ' clamp1'}`}>{e.detail}</span>}
        <From e={e} />
        <Why e={e} />
        {open && (
          <>
            <Decide current={currentOf(e)} onPick={(d) => apply(e, d)} label={e.title} />
            <button className="btn link cab-why" aria-expanded={hist} onClick={() => setHist(!hist)}>{hist ? 'Hide history' : 'History'}</button>
            {hist && <HistoryList userId={e.userId} entryId={e.id} />}
          </>
        )}
      </span>
    </div>
  );
};

export const KnowsPage: React.FC<KnowsProps> = (p) => {
  const { state } = p;
  const name = state.user.name;
  const [aboutOpen, setAboutOpen] = useState(false);
  const [oldOpen, setOldOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const showMine = filter !== 'nordea';
  const showNordea = filter !== 'mine';

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
  const paragraph = aboutParagraph(name, state.entries, state.user.age);
  const missing = emptyFields(state.entries).length;
  const questions = interviewFields(state.entries).length;
  const aboutRef = React.useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!p.aboutSavedAt) return;
    aboutRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1800);
    return () => window.clearTimeout(t);
  }, [p.aboutSavedAt]);

  const inUse = state.readable.abel;
  const notShared = Math.max(0, live.length - inUse - guesses.length);

  return (
    <>
      <header className="nhead detail kn-head" style={{ backgroundImage: BAND_BG }}>
        <div className="dh-top">
          <span className="dh-back" />
          <b>What Abel knows</b>
          <button className="dh-side" onClick={p.onPrivacy}><Icon name="shield" />Who sees it</button>
        </div>
        <div className="kn-sum">
          <div><b>{inUse}</b><span>In use</span></div>
          <div className={waitingCount ? 'hl' : ''}><b>{waitingCount}</b><span>Waiting for you</span></div>
          <div><b>{notShared}</b><span>Not shared</span></div>
        </div>
        <RoundActions actions={[
          { icon: 'plus', label: 'Add a goal', onClick: p.onAddGoal },
          { icon: 'spark', label: 'Tell Abel', onClick: p.onTellAbel },
          { icon: 'file', label: 'Import a chat', onClick: p.onImport },
        ]} />
      </header>
      <div className="nbody">
        <div className="chips cab-filter" role="group" aria-label="Show">
          {([['all', 'All'], ['mine', 'Mine'], ['nordea', 'From Nordea']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} className={`chip${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        {/* ---------- About you ---------- */}
        <Band left="About you" right={<button className="btn link band-act" onClick={() => setAboutOpen(!aboutOpen)}>{aboutOpen ? 'Less' : 'Details'}</button>} />
        <div className="ncard flat" ref={aboutRef}>
          <div className={`nrow2 static${flash ? ' about-flash' : ''}`}>
            <span className="n-l">
              <span className="about-p">{paragraph}</span>
            </span>
          </div>
          {tipsFor(state).length > 0 && (
            <div className="nrow2 static">
              <span className="n-l">
                <span className="n-sub">Because of this, Abel suggests</span>
                {tipsFor(state).map((t) => (t.ask
                  ? <button key={t.id} className="btn link tip-link" onClick={() => p.onAsk?.(t.ask!.text)}>→ {t.title}</button>
                  : <span key={t.id} className="tip-link">→ {t.title}</span>))}
              </span>
            </div>
          )}
          {questions > 0 && (
            <div className="nrow2 static">
              <span className="n-l">
                <span className="n-name">Tell Abel about you</span>
                <span className="n-sub">{questions} quick {questions === 1 ? 'question' : 'questions'}. You check each answer.</span>
              </span>
              <button className="btn small primary" onClick={() => p.onInterview()}>Start</button>
            </div>
          )}
          {aboutOpen && PROFILE_FIELDS.map((f) => {
            const e = profileEntryFor(state.entries, f.key);
            const shown = e && !isUnconfirmed(e) ? e : undefined;
            return (
              <div className="nrow2 static" key={f.key}>
                <span className="n-l">
                  <span className="n-sub">{f.label}</span>
                  <span className="n-name">{shown ? shown.title : <span className="cab-unset">Not set</span>}</span>
                  {shown && <From e={shown} />}
                </span>
                {f.question && <button className="btn link" onClick={() => p.onInterview(f.key)}>{shown ? 'Edit' : 'Add'}</button>}
              </div>
            );
          })}
        </div>

        {/* ---------- Waiting for you ---------- */}
        <Band left="Waiting for you" right={waitingCount ? <span className="band-note">{waitingCount}</span> : undefined} />
        <div className="ncard flat">
          {waitingCount === 0 && <div className="nrow2 static"><span className="n-l"><span className="n-sub">All checked ✓</span></span></div>}
          {showNordea && guesses.map((e) => (
            <div className="nrow2 static wait" key={e.id}>
              <span className="n-l">
                <span className="n-name">{e.type === 'profile' && e.profileField ? `${PROFILE_FIELD[e.profileField].label}: ${e.title}` : e.title}</span>
                {e.detail && <span className="n-sub">{e.detail}</span>}
                <From e={e} />
                <Why e={e} />
                <Decide onPick={(d) => apply(e, d)} label={e.title} />
              </span>
            </div>
          ))}
          {showMine && stale.map((e) => (
            <div className="nrow2 static wait" key={e.id}>
              <span className="n-l">
                <span className="n-name">Still saving for “{e.title}”?</span>
                <From e={e} />
                <Decide options={['keep', 'delete']} onPick={(d) => apply(e, d)} label={e.title} />
              </span>
            </div>
          ))}
          {showMine && pipe.map((c) => (
            <div className="nrow2 static wait" key={c.id}>
              <span className="n-l">
                <span className="n-name">{c.title}</span>
                <span className="from you">You set this · {SOURCE_NAME[c.source]}</span>
                <Decide current={c.filter === 'private' ? 'private' : undefined} onPick={(d) => decidePipe(c.id, d === 'share' ? 'save' : d === 'private' ? 'private' : 'drop')} label={c.title} />
              </span>
            </div>
          ))}
          {showMine && approvals.map((c) => (
            <div className="nrow2 static wait" key={c.id}>
              <span className="n-l">
                <span className="n-name">{c.summary}</span>
                {c.detail && <span className="n-sub">{c.detail}</span>}
                <Decide options={['share', 'delete']} onPick={(d) => decideApproval(c.id, d === 'share')} label={c.summary} />
              </span>
            </div>
          ))}
        </div>

        {/* ---------- Added by you ---------- */}
        {showMine && <>
        <Band left="Added by you" right={<button className="btn link band-act" onClick={p.onAddGoal}>+ Add</button>} />
        <div className="ncard flat">
          {state.goals.length + mine.length === 0 && <div className="nrow2 static"><span className="n-l"><span className="n-sub">Nothing yet. Add a goal or tell Abel.</span></span></div>}
          {state.goals.map((g) => (
            <React.Fragment key={g.goalId}>
              <button className="nrow2 goal" aria-expanded={goalOpen === g.goalId} onClick={() => setGoalOpen(goalOpen === g.goalId ? null : g.goalId)}>
                <span className="n-l">
                  <span className="n-name">{g.title}</span>
                  <span className="n-sub">{n0(g.saved)} of {eur(g.target)} · {monthShort(g.targetDate.slice(0, 7))}</span>
                  <span className="gbar"><i style={{ width: `${Math.min(100, g.percentSaved)}%` }} /></span>
                </span>
                <span className="n-r"><span className={`npill ${g.onTrack ? 'up' : 'down'}`}>{g.onTrack ? 'On track' : `${eur(g.shortBy)} short`}</span></span>
              </button>
              {goalOpen === g.goalId && (
                <div className="nrow2 static wait">
                  <span className="n-l">
                    {(() => { const e = state.entries.find((x) => x.id === g.goalId); return e ? <Decide current={currentOf(e)} onPick={(d) => apply(e, d)} label={g.title} /> : null; })()}
                    <button className="btn link cab-why" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)}>Ask Abel about it</button>
                  </span>
                </div>
              )}
            </React.Fragment>
          ))}
          {mine.map((e) => <Item key={e.id} e={e} apply={apply} />)}
        </div>
        </>}

        {/* ---------- Added by Nordea ---------- */}
        {showNordea && <>
        <Band left="Added by Nordea" />
        <div className="ncard flat">
          {nordea.length === 0 && <div className="nrow2 static"><span className="n-l"><span className="n-sub">Nothing yet. Say yes to something in Waiting for you.</span></span></div>}
          {nordea.map((e) => <Item key={e.id} e={e} apply={apply} />)}
        </div>
        </>}

        {/* Deleted (archived or marked wrong): out of the way, can be restored. */}
        {old.length > 0 && (
          <>
            <Band left="Deleted" right={<button className="btn link band-act" onClick={() => setOldOpen(!oldOpen)}>{oldOpen ? 'Hide' : `Show ${old.length}`}</button>} />
            {oldOpen && (
              <div className="ncard flat">
                {old.filter((e) => (fromNordea(e) ? showNordea : showMine)).map((e) => (
                  <div className="nrow2 static" key={e.id}>
                    <span className="n-l"><span className="n-name">{e.title}</span><From e={e} /></span>
                    <button className="btn small" onClick={() => p.onUpdate(e, { status: 'active' })}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {(state.documents || []).length > 0 && <DocsSection userId={state.user.id} docs={state.documents} onDelete={p.onDeleteDoc} />}
      </div>
    </>
  );
};
