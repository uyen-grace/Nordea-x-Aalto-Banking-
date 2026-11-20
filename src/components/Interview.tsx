import React, { useEffect, useRef, useState } from 'react';
import { CabinetEntry, ProfileField } from '../types.js';
import { PROFILE_FIELD } from '../profileFields.js';
import { createCabinetEntry, updateCabinetEntry, confirmObservation } from '../services/api.js';
import { profileEntryFor, interviewFields, isUnconfirmed } from '../ui/profile.js';
import { BotAvatar, Icon } from '../ui/icons.js';
import { SourceBadge } from '../ui/Source.js';
import { originOf } from '../entrySource.js';

/**
 * "Get to know you": a short interview with Abel that fills the About you profile.
 *
 * - Asks about five things at most: empty fields first, then Nordea's guesses that still need a yes.
 * - Every question can be skipped, and every answer can be typed instead of tapped.
 * - Nothing is saved while answering. At the end the customer sees every answer and decides,
 *   one by one: Save, Save privately, or Not needed. Only then is anything written.
 */

type Decision = 'save' | 'private' | 'skip';
interface Answer {
  field: ProfileField;
  value: string;
  /** The customer said yes to Nordea's guess as it is. */
  confirms?: CabinetEntry;
  /** What this answer replaces (their own older answer, or a Nordea guess they corrected). */
  replaces?: CabinetEntry;
  decision: Decision;
}

const YES = 'Yes, that’s right';

export const Interview: React.FC<{
  userId: string;
  userName: string;
  entries: CabinetEntry[];
  /** Ask about one field only (the "Change" link in About you). */
  only?: ProfileField;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ userId, userName, entries, only, onClose, onSaved }) => {
  const [fields] = useState<ProfileField[]>(() => (only ? [only] : interviewFields(entries)));
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const reviewing = step >= fields.length;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [step, answers.length]);

  const field = fields[step];
  const def = field ? PROFILE_FIELD[field] : undefined;
  const current = field ? profileEntryFor(entries, field) : undefined;
  const guess = isUnconfirmed(current) ? current : undefined;

  const answer = (value: string) => {
    const v = value.trim();
    if (!v || !field) return;
    const confirms = guess && (v === YES || v === guess.title) ? guess : undefined;
    setAnswers((a) => [...a, { field, value: confirms ? confirms.title : v, confirms, replaces: confirms ? undefined : current, decision: 'save' }]);
    setTyped('');
    setStep((s) => s + 1);
  };
  const skip = () => { setTyped(''); setStep((s) => s + 1); };
  const decide = (i: number, d: Decision) => setAnswers((a) => a.map((x, k) => (k === i ? { ...x, decision: d } : x)));

  const save = async () => {
    setSaving(true);
    setError('');
    let n = 0;
    try {
      for (const a of answers) {
        if (a.decision === 'skip') continue;
        if (a.confirms) {
          // Their yes to Nordea's guess: the entry stays Nordea's (so the source stays true), now confirmed.
          await confirmObservation(userId, a.confirms.id);
          if (a.decision === 'private') await updateCabinetEntry(a.confirms.id, { private: true, readableBy: { ...a.confirms.readableBy, offers: false } });
        } else if (a.replaces && originOf(a.replaces) === 'you') {
          // Their own earlier answer: change it in place, so its history shows the change.
          await updateCabinetEntry(a.replaces.id, { title: a.value, private: a.decision === 'private', reviewed: true });
        } else {
          // A Nordea guess they corrected: mark it wrong (Abel stops using it), then save what they said.
          if (a.replaces) await updateCabinetEntry(a.replaces.id, { status: 'disputed' });
          await createCabinetEntry({
            userId, type: 'profile', profileField: a.field, title: a.value, detail: '', source: 'customer',
            private: a.decision === 'private', readableBy: { abel: true, offers: false }, how: 'Onboarding with Abel',
          });
        }
        n++;
      }
      onSaved(n ? `Saved ${n} ${n === 1 ? 'thing' : 'things'} to About you` : 'Nothing saved');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong while saving. Try again.');
      setSaving(false);
    }
  };

  const toSave = answers.filter((a) => a.decision !== 'skip').length;

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet iv" role="dialog" aria-label="Get to know you" onClick={(e) => e.stopPropagation()}>
        <div className="iv-top">
          <b>{only ? `Change: ${PROFILE_FIELD[only].label}` : 'Get to know you'}</b>
          {!reviewing && fields.length > 1 && <span className="iv-step">{step + 1} of {fields.length}</span>}
          <button className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!only && !reviewing && <div className="iv-bar" aria-hidden="true"><i style={{ width: `${(step / fields.length) * 100}%` }} /></div>}

        <div className="iv-body">
          {fields.length === 0 ? (
            <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">Your profile is complete, {userName}. You can change any part of it in About you.</div></div></div>
          ) : (
            <>
              {!only && (
                <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">
                  Hi {userName}! {fields.length === 1 ? 'One quick question' : `${fields.length} quick questions`} so my answers fit your life. Skip anything you like. Nothing is saved until you check it at the end.
                </div></div></div>
              )}
              {answers.map((a, i) => (
                <React.Fragment key={i}>
                  <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">{PROFILE_FIELD[a.field].question}</div></div></div>
                  <div className="mrow me"><div className="mcol"><div className="bub">{a.confirms ? YES : a.value}</div></div></div>
                </React.Fragment>
              ))}
              {!reviewing && def && (
                <>
                  <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">
                    {guess ? <>Nordea thinks: <b>{guess.title}</b>. Is that right?</> : def.question}
                  </div><span className="iv-why">{guess?.why ? `Why Nordea thinks so: ${guess.why}` : def.why}</span></div></div>
                  <div className="iv-opts">
                    {guess && <button className="chip on" onClick={() => answer(YES)}>✓ {YES}</button>}
                    {(def.options || []).filter((o) => o !== guess?.title).map((o) => <button key={o} className="chip" onClick={() => answer(o)}>{o}</button>)}
                  </div>
                  <form className="iv-type" onSubmit={(e) => { e.preventDefault(); answer(typed); }}>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={def.placeholder || 'Or type your answer'} aria-label="Your answer" maxLength={120} />
                    <button className="btn small primary" type="submit" disabled={!typed.trim()}>Send</button>
                  </form>
                  <button className="btn link iv-skip" onClick={skip}>Skip this question</button>
                </>
              )}
              {reviewing && answers.length > 0 && (
                <>
                  <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">Thanks! Here’s what I’d save to About you. Choose for each one.</div></div></div>
                  <div className="iv-review">
                    {answers.map((a, i) => (
                      <div className={`iv-item${a.decision === 'skip' ? ' off' : ''}`} key={i}>
                        <span className="iv-k">{PROFILE_FIELD[a.field].label}</span>
                        <b>{a.value}</b>
                        {a.confirms
                          ? <SourceBadge origin="nordea" label="Nordea noticed this · you confirm it" />
                          : <SourceBadge origin="you" />}
                        {a.replaces && !a.confirms && <span className="iv-note">{originOf(a.replaces) === 'you' ? `Replaces “${a.replaces.title}”` : `Nordea’s guess “${a.replaces.title}” will be marked wrong`}</span>}
                        <span className="iv-seg" role="radiogroup" aria-label={`What to do with ${PROFILE_FIELD[a.field].label}`}>
                          {([['save', 'check', 'Save'], ['private', 'lock', 'Save privately'], ['skip', 'x', 'Not needed']] as [Decision, string, string][]).map(([d, icon, label]) => (
                            <button key={d} role="radio" aria-checked={a.decision === d} className={`seg-${d}`} onClick={() => decide(i, d)}>
                              <Icon name={icon} size={15} strokeWidth={2.2} />{label}
                            </button>
                          ))}
                        </span>
                        {a.decision === 'private' && <span className="iv-note">🔒 Abel can use it. Never used for offers or shown to an adviser.</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {reviewing && answers.length === 0 && (
                <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">No problem, nothing was saved. You can do this any time from About you.</div></div></div>
              )}
            </>
          )}
          <div ref={endRef} />
        </div>

        {error && <p className="iv-err" role="alert">{error}</p>}
        {reviewing && answers.length > 0 ? (
          <button className="btn primary block" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : toSave ? `Save ${toSave} ${toSave === 1 ? 'thing' : 'things'}` : 'Done, save nothing'}
          </button>
        ) : (reviewing || fields.length === 0) && <button className="btn block" onClick={onClose}>Close</button>}
      </div>
    </div>
  );
};
