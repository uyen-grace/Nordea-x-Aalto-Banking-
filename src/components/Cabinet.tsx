import React, { useEffect, useState } from 'react';
import {
  AppState, PipeItem, fetchPipelineWaiting, decidePipelineItem, SOURCE_NAME, confirmObservation, updateCabinetEntry, deleteCabinetEntry,
  AutoUpdate, fetchAutoUpdates, undoAutoUpdate, demoNewData, SourceId, fetchSources, setSource,
} from '../services/api.js';
import { Decision } from '../ui/Decide.js';
import { Choice, Choices } from '../ui/Choice.js';
import { SourceBadge } from '../ui/SourceBadge.js';
import { CabinetEntry, ProfileField } from '../types.js';
import { Icon, Chevron } from '../ui/icons.js';
import { eur, monthShort, n0, ago } from '../ui/format.js';
import { BAND_BG, Band, RoundActions, Toggle } from './Nordea.js';
import { HistoryList, DocsSection } from './Pages.js';
import { PROFILE_FIELDS, PROFILE_FIELD } from '../profileFields.js';
import { emptyFields, interviewFields, aboutParagraph, coveredFields } from '../ui/profile.js';
import { originOf } from '../entrySource.js';

/**
 * What Abel knows, in the order a customer needs it:
 *   1. Needs your OK          - only shown when something waits (one clear question each).
 *   2. Updated automatically  - what Nordea's data or a payslip changed, each with Undo.
 *   3. Your cabinet           - grouped like an assistant's memory: About you, Goals, Money,
 *                               Preferences, Life events. Each group shows one summary line; tap to open.
 * Every item shows where it came from (a badge, not just a dot) and one switch: Share with Nordea.
 * Sources (header button) shows which sources may fill the cabinet.
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
      if (guess) { await updateCabinetEntry(e.id, { status: 'disputed' }); return { message: 'Got it. Abel won’t use it.' }; }
      const r = await deleteCabinetEntry(e.id);
      return { message: 'Deleted', undoToken: r.undoToken };
    }
    if (guess) await confirmObservation(userId, e.id);
    const priv = d === 'private';
    const r = await updateCabinetEntry(e.id, { private: priv, readableBy: { ...e.readableBy, abel: true, offers: !priv } });
    return { message: guess ? 'Thanks. Abel will use it.' : priv ? 'Only Abel uses it now' : 'Shared with Nordea', undoToken: r.undoToken };
  } catch {
    return { message: 'That didn’t work. Try again.' };
  }
}

type Apply = (e: CabinetEntry, d: Decision) => void;
const fromNordea = (e: CabinetEntry) => originOf(e) === 'nordea' || originOf(e) === 'register';

/** "Why do we know this?" - closed until tapped. */
const Why: React.FC<{ e: CabinetEntry }> = ({ e }) => {
  const [open, setOpen] = useState(false);
  if (!e.why || originOf(e) === 'you') return null;
  return (
    <>
      <button className="btn link cab-why" aria-expanded={open} onClick={(ev) => { ev.stopPropagation(); setOpen(!open); }}>
        How do we know? <Chevron rotate={open ? -90 : 90} size={13} />
      </button>
      {open && <span className="n-sub">{e.why}</span>}
    </>
  );
};

/** One item. Collapsed: title, badge. Open: details, "Share with Nordea" switch, History, Delete. */
const Item: React.FC<{ e: CabinetEntry; apply: Apply }> = ({ e, apply }) => {
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState(false);
  const shared = !e.private;
  return (
    <div className={`cab-item${open ? ' open' : ''}`}>
      <button className="cab-item-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="cab-item-t">
          <span className="n-name">{e.title}</span>
          <SourceBadge e={e} extra={shared ? undefined : 'only Abel'} />
        </span>
        <Chevron rotate={open ? -90 : 90} size={14} />
      </button>
      {open && (
        <div className="cab-item-b">
          {e.detail && <span className="n-sub">{e.detail}</span>}
          <Why e={e} />
          <div className="share-switch">
            <span className="t"><b>Share with Nordea</b><span>{shared ? 'Nordea can use it to tailor offers for you.' : 'Only Abel uses it.'}</span></span>
            <Toggle on={shared} onChange={() => apply(e, shared ? 'private' : 'share')} label={`Share “${e.title}” with Nordea`} />
          </div>
          <div className="cab-item-act">
            <button className="btn link" aria-expanded={hist} onClick={() => setHist(!hist)}><Icon name="clock" size={15} />{hist ? 'Hide history' : 'History'}</button>
            <button className="btn link quiet-link" onClick={() => apply(e, 'delete')}><Icon name="trash" size={15} />Delete</button>
          </div>
          {hist && <HistoryList userId={e.userId} entryId={e.id} />}
        </div>
      )}
    </div>
  );
};

/** A group in Your cabinet: icon, name, one summary line. Tap to open. */
const Group: React.FC<{ id: string; icon: string; name: string; summary: string; count?: number; open: boolean; onToggle: () => void; children: React.ReactNode; refEl?: React.Ref<HTMLDivElement>; flash?: boolean }> = ({ id, icon, name, summary, count, open, onToggle, children, refEl, flash }) => (
  <div className={`ncard cab-group${open ? ' open' : ''}${flash ? ' about-flash' : ''}`} ref={refEl}>
    <button className="cab-group-h" aria-expanded={open} aria-controls={`grp-${id}`} onClick={onToggle}>
      <span className="cab-group-ic" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="cab-group-t">
        <b>{name}{count ? <span className="cab-count">{count}</span> : null}</b>
        <span className={open ? '' : 'clamp1'}>{summary}</span>
      </span>
      <Chevron rotate={open ? -90 : 90} size={16} />
    </button>
    {open && <div className="cab-group-b" id={`grp-${id}`}>{children}</div>}
  </div>
);

/** Which sources may fill What Abel knows. Only Nordea data works in this prototype. */
const SOURCE_INFO: { id: SourceId; name: string; what: string; icon: string }[] = [
  { id: 'nordea', name: 'Your Nordea data', what: 'Salary, payslips, rent and spending. Keeps your cabinet up to date.', icon: 'bank' },
  { id: 'register', name: 'Population register', what: 'Address and household, from the Finnish population register.', icon: 'idcard' },
  { id: 'chats', name: 'WhatsApp or Telegram', what: 'Plans you mention in chats you choose to share.', icon: 'chat' },
  { id: 'assistant', name: 'Your own AI assistant', what: 'What you have told an assistant like Claude or ChatGPT, if you connect it.', icon: 'spark' },
];

const SourcesSheet: React.FC<{ userId: string; onClose: () => void; onChanged: () => void; onToast: (m: string) => void }> = ({ userId, onClose, onChanged, onToast }) => {
  const [src, setSrc] = useState<Record<SourceId, boolean> | null>(null);
  const [working, setWorking] = useState<SourceId[]>(['nordea']);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchSources(userId).then((d) => { setSrc(d.sources); setWorking(d.working); }).catch(() => setSrc({ nordea: true, register: false, chats: false, assistant: false })); }, [userId]);
  const flip = async (id: SourceId) => {
    if (!src) return;
    try {
      const d = await setSource(userId, id, !src[id]);
      setSrc(d.sources);
      onToast(d.sources[id] ? 'Nordea data is on. Your cabinet stays up to date.' : 'Nordea data is off. New bank data won’t change your cabinet.');
      onChanged();
    } catch (e: any) { onToast(e?.message || 'That didn’t work'); }
  };
  const checkNow = async () => {
    setBusy(true);
    try {
      const r = await demoNewData(userId);
      onToast(r.added.length ? `Updated: ${r.added.join(' · ')}` : 'Updated from your new payslip and bank data');
      onChanged();
      onClose();
    } catch (e: any) { onToast(e?.message || 'That didn’t work'); } finally { setBusy(false); }
  };
  return (
    <div className="cf-bg" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="cf-sheet src-sheet" role="dialog" aria-label="Sources">
        <h3>Where Abel’s knowledge comes from</h3>
        <p className="cf-p">Choose which sources may add to What Abel knows. You can switch one off any time.</p>
        {SOURCE_INFO.map((s) => {
          const works = working.includes(s.id);
          return (
            <div className={`src-row${works ? '' : ' later'}`} key={s.id}>
              <span className="src-ic" aria-hidden="true"><Icon name={s.icon} size={18} /></span>
              <span className="src-t">
                <b>{s.name}{!works && <span className="soon">Coming later</span>}</b>
                <span>{s.what}</span>
                {s.id === 'nordea' && src?.nordea && (
                  <button className="btn link src-check" disabled={busy} onClick={checkNow}>{busy ? 'Checking…' : 'Check for new data now (demo)'}</button>
                )}
              </span>
              {works ? <Toggle on={!!src?.[s.id]} onChange={() => flip(s.id)} label={s.name} /> : <span className="tgl off-later" aria-hidden="true"><i /></span>}
            </div>
          );
        })}
        <p className="hint">Nothing is fetched without your OK.</p>
        <button className="btn primary block" onClick={onClose}>Done</button>
      </div>
    </div>
  );
};

export const KnowsPage: React.FC<KnowsProps> = (p) => {
  const { state } = p;
  const name = state.user.name;
  const [open, setOpen] = useState<Record<string, boolean>>({ about: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [aboutEdit, setAboutEdit] = useState(false);
  const [oldOpen, setOldOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [nordeaOn, setNordeaOn] = useState(true);
  useEffect(() => { fetchSources(state.user.id).then((d) => setNordeaOn(d.sources.nordea)).catch(() => {}); }, [state.user.id, sourcesOpen]);

  // Inputs from glasses / WhatsApp / documents, and cards waiting for approval, also wait here.
  const [pipe, setPipe] = useState<PipeItem[]>([]);
  const loadPipe = () => fetchPipelineWaiting(state.user.id).then(setPipe);
  useEffect(() => { loadPipe(); }, [state.user.id, state.entries.length]);
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) loadPipe(); }, 4000); return () => window.clearInterval(t); }, [state.user.id]);
  const decidePipe = async (id: string, a: 'save' | 'private' | 'drop') => { await decidePipelineItem(state.user.id, id, a); await loadPipe(); p.onChanged?.(); };

  // Updated automatically (from Nordea's data and payslips), each with Undo.
  const [updates, setUpdates] = useState<AutoUpdate[]>([]);
  const loadUpdates = () => fetchAutoUpdates(state.user.id).then(setUpdates).catch(() => {});
  useEffect(() => { loadUpdates(); }, [state.user.id, state.entries.length, JSON.stringify(state.entries.map((e) => e.updatedAt))]);
  const undo = async (u: AutoUpdate) => {
    try { setUpdates(await undoAutoUpdate(state.user.id, u.id)); p.onToast?.('Undone'); p.onChanged?.(); }
    catch (e: any) { p.onToast?.(e?.message || 'That didn’t work'); }
  };
  const shownUpdates = updates.filter((u) => !u.undone).slice(0, 4);

  const apply: Apply = async (e, d) => {
    const r = await applyDecision(state.user.id, e, d);
    p.onToast?.(r.message, r.undoToken);
    p.onChanged?.();
  };

  const live = state.entries.filter((e) => e.status !== 'archived' && e.type !== 'blind_spot');
  // 1. Needs your OK
  const guesses = live.filter((e) => fromNordea(e) && !e.reviewed && e.status === 'active');
  const stale = live.filter((e) => e.type === 'goal' && e.status === 'stale');
  const waitingCount = guesses.length + stale.length + pipe.length;
  // 3. Your cabinet, grouped
  const tracked = new Set(state.goals.map((g) => g.goalId));
  const kept = live.filter((e) => e.status === 'active' && e.type !== 'profile' && !(fromNordea(e) && !e.reviewed));
  const goalsLoose = kept.filter((e) => e.type === 'goal' && !tracked.has(e.id));
  const money = kept.filter((e) => e.type === 'fact' || e.type === 'observation');
  const prefs = kept.filter((e) => e.type === 'preference');
  const life = kept.filter((e) => e.type === 'life_event');
  const old = state.entries.filter((e) => e.status === 'archived' || e.status === 'disputed');

  // About you: worked out on the server from Nordea's data + what they said. With Nordea data off, only what they said.
  const covered = coveredFields(state.about, state.salary?.found);
  const paragraph = nordeaOn ? state.about?.text || aboutParagraph(name, state.entries, state.user.age) : aboutParagraph(name, state.entries, state.user.age);
  const facts = (state.about?.facts || []).filter((f) => nordeaOn || f.from === 'you');
  // Money that Nordea's data already shows (salary, rent, saving, spending): kept up to date automatically.
  const moneyFacts = facts.filter((f) => f.from === 'nordea' && ['income', 'housing', 'saving', 'spending'].includes(f.key));
  const [allWaiting, setAllWaiting] = useState(false);
  const questions = interviewFields(state.entries, 5, nordeaOn ? covered : []).length;
  const missing = emptyFields(state.entries, nordeaOn ? covered : []).length;
  const aboutRef = React.useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!p.aboutSavedAt) return;
    setOpen((o) => ({ ...o, about: true }));
    aboutRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1800);
    return () => window.clearTimeout(t);
  }, [p.aboutSavedAt]);

  const list = (xs: CabinetEntry[], empty: string) =>
    xs.length ? xs.map((e) => <Item key={e.id} e={e} apply={apply} />) : <p className="cab-empty">{empty}</p>;
  const sum = (xs: CabinetEntry[], empty: string) => (xs.length ? xs.slice(0, 2).map((e) => e.title).join(' · ') + (xs.length > 2 ? ` · +${xs.length - 2} more` : '') : empty);
  const onTrack = state.goals.filter((g) => g.onTrack).length;
  const goalCount = state.goals.length + goalsLoose.length;
  const total = facts.length + goalCount + money.length + prefs.length + life.length;
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Needs your OK: two at a time, so the page never opens with a wall of questions.


  return (
    <>
      <header className="nhead detail kn-head" style={{ backgroundImage: BAND_BG }}>
        <div className="dh-top">
          <span className="dh-back" />
          <b>What Abel knows</b>
          <button className="dh-side" onClick={p.onPrivacy}><Icon name="shield" />Who sees it</button>
        </div>
        <p className="kn-lead">Abel uses this to tailor your banking. You decide what’s kept and what’s shared.</p>
        <RoundActions actions={[
          { icon: 'plus', label: 'Add a goal', onClick: p.onAddGoal },
          { icon: 'spark', label: 'Tell Abel', onClick: p.onTellAbel },
          { icon: 'sliders', label: 'Sources', onClick: () => setSourcesOpen(true) },
        ]} />
      </header>
      <div className="nbody">
        {/* ---------- 1. Needs your OK ---------- */}
        {waitingCount > 0 && (
          <>
            <Band left="Needs your OK" right={<span className="band-note">Abel doesn’t use these until you answer</span>} />
            {[
              ...guesses.map((e) => (
              <div className="card cab-ask" key={e.id}>
                <SourceBadge e={e} />
                <div>
                  <h3>{e.type === 'profile' && e.profileField ? `${PROFILE_FIELD[e.profileField].label}: ${e.title}` : e.title}</h3>
                  {e.detail && <p>{e.detail}</p>}
                </div>
                <Why e={e} />
                <Choices hint="Is this right?">
                  <Choice kind="yes" large label="Yes, that’s right" onClick={() => apply(e, 'share')} />
                  <Choice kind="no" large label="Not right" onClick={() => apply(e, 'delete')} />
                </Choices>
              </div>
              )),
              ...stale.map((e) => (
              <div className="card cab-ask" key={e.id}>
                <SourceBadge e={e} />
                <div><h3>Still saving for “{e.title}”?</h3><p>No money has been added for a long time.</p></div>
                <Choices>
                  <Choice kind="yes" large label="Yes, keep it" onClick={() => apply(e, 'keep')} />
                  <Choice kind="archive" large label="No, remove it" onClick={() => apply(e, 'delete')} />
                </Choices>
              </div>
              )),
              ...pipe.map((c) => (
              <div className="card cab-ask" key={c.id}>
                <SourceBadge from="you" extra={SOURCE_NAME[c.source]} />
                <div><h3>{c.title}</h3></div>
                <Choices hint="Save it for Abel?">
                  <Choice kind="yes" large label="Save" onClick={() => decidePipe(c.id, 'save')} />
                  <Choice kind="private" large label="Save, only for Abel" onClick={() => decidePipe(c.id, 'private')} />
                  <Choice kind="no" large label="Don’t save" onClick={() => decidePipe(c.id, 'drop')} />
                </Choices>
              </div>
              )),
            ].slice(0, allWaiting ? undefined : 2)}
            {waitingCount > 2 && (
              <button className="nshowall plain" onClick={() => setAllWaiting(!allWaiting)}>{allWaiting ? 'Show fewer' : `Show ${waitingCount - 2} more`}</button>
            )}
          </>
        )}

        {/* ---------- 2. Updated automatically ---------- */}
        {shownUpdates.length > 0 && (
          <>
            <Band left="Updated automatically" right={<button className="btn link band-act" onClick={() => setSourcesOpen(true)}>Sources</button>} />
            <div className="ncard">
              {shownUpdates.map((u) => (
                <div className="cab-upd" key={u.id}>
                  <span className="cab-upd-t">
                    <span className="n-name">{u.title}</span>
                    <span className="cab-upd-m"><SourceBadge from={u.from} /><span className="n-sub">{u.action === 'added' ? 'Added' : 'Changed'} {ago(u.at)}</span></span>
                  </span>
                  <button className="btn small" onClick={() => undo(u)}><Icon name="undo" size={15} />Undo</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- 3. Your cabinet ---------- */}
        <Band left="Your cabinet" right={<span className="band-note">{total} things</span>} />

        <Group id="about" icon="person" name="About you" summary={paragraph} open={!!open.about} onToggle={() => toggle('about')} refEl={aboutRef} flash={flash}>
          <p className="about-p">{paragraph}</p>
          <div className="cab-row-btns">
            {questions > 0 && (
              <button className="btn small primary" onClick={() => p.onInterview()}>
                <Icon name="spark" size={16} />Answer {questions + 1} quick questions
              </button>
            )}
            <button className="btn small" aria-expanded={aboutEdit} onClick={() => setAboutEdit(!aboutEdit)}>
              <Icon name="sliders" size={16} />{aboutEdit ? 'Done' : 'See and edit details'}
            </button>
          </div>
          {!nordeaOn && <p className="hint">Nordea data is off, so this only shows what you told Abel.</p>}
          {aboutEdit && (
            <div className="about-facts">
              {facts.map((f, i) => {
                const entry = f.entryId ? state.entries.find((e) => e.id === f.entryId) : undefined;
                const askable = PROFILE_FIELD[f.key as ProfileField]?.question;
                return (
                  <div className="about-fact" key={`${f.key}-${i}`}>
                    <span className="about-fact-t">
                      <span className="n-sub">{f.label}</span>
                      <span className="n-name">{f.text.charAt(0).toUpperCase() + f.text.slice(1)}</span>
                      <SourceBadge from={f.from === 'you' ? 'you' : 'bank'} />
                    </span>
                    <span className="about-row-act">
                      {askable && <button className="btn link" onClick={() => p.onInterview(f.key as ProfileField)}>Change</button>}
                      {entry && <button className="btn link quiet-link" onClick={() => apply(entry, 'delete')}>Delete</button>}
                    </span>
                  </div>
                );
              })}
              {PROFILE_FIELDS.filter((f) => f.question && !f.optional && !facts.some((x) => x.key === f.key)).map((f) => (
                <div className="about-fact" key={f.key}>
                  <span className="about-fact-t"><span className="n-sub">{f.label}</span><span className="n-name cab-unset">Not set yet</span></span>
                  <button className="btn link" onClick={() => p.onInterview(f.key)}>Add</button>
                </div>
              ))}
              {missing > 0 && <p className="hint">Only what you choose to add is saved. You can skip any question.</p>}
            </div>
          )}
        </Group>

        <Group id="goals" icon="sprout" name="Goals" count={goalCount}
          summary={goalCount ? `${goalCount} ${goalCount === 1 ? 'goal' : 'goals'}${state.goals.length ? ` · ${onTrack} on track` : ''}` : 'No goals yet. Add one, or tell Abel what you’re saving for.'}
          open={!!open.goals} onToggle={() => toggle('goals')}>
          {state.goals.map((g) => {
            const e = state.entries.find((x) => x.id === g.goalId);
            return (
              <div className={`cab-item${goalOpen === g.goalId ? ' open' : ''}`} key={g.goalId}>
                <button className="cab-item-h goal" aria-expanded={goalOpen === g.goalId} onClick={() => setGoalOpen(goalOpen === g.goalId ? null : g.goalId)}>
                  <span className="cab-item-t">
                    <span className="n-name">{g.title}</span>
                    <span className="n-sub">{n0(g.saved)} of {eur(g.target)} · {monthShort(g.targetDate.slice(0, 7))}</span>
                    <span className="gbar"><i style={{ width: `${Math.min(100, g.percentSaved)}%` }} /></span>
                  </span>
                  <span className={`npill ${g.onTrack ? 'up' : 'down'}`}>{g.onTrack ? 'On track' : `${eur(g.shortBy)} short`}</span>
                </button>
                {goalOpen === g.goalId && e && (
                  <div className="cab-item-b">
                    <SourceBadge e={e} />
                    <div className="share-switch">
                      <span className="t"><b>Share with Nordea</b><span>{!e.private ? 'Nordea can use it to tailor offers for you.' : 'Only Abel uses it.'}</span></span>
                      <Toggle on={!e.private} onChange={() => apply(e, e.private ? 'share' : 'private')} label={`Share “${g.title}” with Nordea`} />
                    </div>
                    <div className="cab-item-act">
                      <button className="btn link" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)}><Icon name="spark" size={15} />Ask Abel about it</button>
                      <button className="btn link quiet-link" onClick={() => apply(e, 'delete')}><Icon name="trash" size={15} />Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {goalsLoose.map((e) => <Item key={e.id} e={e} apply={apply} />)}
          <button className="btn link cab-add" onClick={p.onAddGoal}><Icon name="plus" size={16} />Add a goal</button>
        </Group>

        <Group id="money" icon="pay" name="Money" count={money.length + moneyFacts.length}
          summary={[...moneyFacts.map((f) => capital(f.text)), ...money.map((e) => e.title)].slice(0, 2).join(' · ') || 'Nothing yet. Your salary and regular bills show up here.'}
          open={!!open.money} onToggle={() => toggle('money')}>
          {moneyFacts.map((f) => (
            <div className="cab-item" key={f.key}>
              <div className="cab-item-h static">
                <span className="cab-item-t">
                  <span className="n-name">{capital(f.text)}</span>
                  <SourceBadge from="bank" extra="updates by itself" />
                </span>
              </div>
            </div>
          ))}
          {list(money, moneyFacts.length ? '' : 'Nothing yet.')}
        </Group>

        <Group id="prefs" icon="sliders" name="Preferences" count={prefs.length} summary={sum(prefs, 'How you like to save and bank. Tell Abel, e.g. “keep my savings safe”.')} open={!!open.prefs} onToggle={() => toggle('prefs')}>
          {list(prefs, 'Nothing yet.')}
        </Group>

        <Group id="life" icon="home" name="Life events" count={life.length} summary={sum(life, 'Moving, a new job, a baby… Tell Abel when life changes.')} open={!!open.life} onToggle={() => toggle('life')}>
          {list(life, 'Nothing yet.')}
          <button className="btn link cab-add" onClick={p.onTellAbel}><Icon name="spark" size={16} />Tell Abel about a change</button>
        </Group>

        {/* Deleted (archived or marked wrong): out of the way, can be restored. */}
        {old.length > 0 && (
          <>
            <Band left="Deleted" right={<button className="btn link band-act" onClick={() => setOldOpen(!oldOpen)}>{oldOpen ? 'Hide' : `Show ${old.length}`}</button>} />
            {oldOpen && (
              <div className="ncard">
                {old.map((e) => (
                  <div className="cab-upd" key={e.id}>
                    <span className="cab-upd-t"><span className="n-name">{e.title}</span><SourceBadge e={e} /></span>
                    <button className="btn small" onClick={() => p.onUpdate(e, { status: 'active' })}><Icon name="undo" size={15} />Restore</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {(state.documents || []).length > 0 && <DocsSection userId={state.user.id} docs={state.documents} onDelete={p.onDeleteDoc} />}
        <p className="foot-note">Nothing is used without your OK. <button className="btn link" onClick={p.onImport}>Import a chat</button></p>
      </div>
      {sourcesOpen && (
        <SourcesSheet userId={state.user.id} onClose={() => setSourcesOpen(false)} onChanged={() => { p.onChanged?.(); loadUpdates(); }} onToast={(m) => p.onToast?.(m)} />
      )}
    </>
  );
};
