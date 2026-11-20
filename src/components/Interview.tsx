import React, { useEffect, useRef, useState } from 'react';
import { CabinetEntry, ProfileField } from '../types.js';
import { PROFILE_FIELD } from '../profileFields.js';
import { createCabinetEntry, updateCabinetEntry, confirmObservation } from '../services/api.js';
import { profileEntryFor, interviewFields, isUnconfirmed } from '../ui/profile.js';
import { BotAvatar, Icon } from '../ui/icons.js';
import { originOf } from '../entrySource.js';

/**
 * "Get to know you": a short chat with Abel that fills About you.
 * - At most five questions: empty fields first, then Nordea's guesses to confirm.
 * - Tap an answer or type one; skip anything.
 * - Nothing is saved until the review at the end, where each answer gets Save / Private / Skip.
 */

type Decision = 'save' | 'private' | 'skip';
interface Answer {
  field: ProfileField;
  /** What the customer tapped or typed (shown in the chat). */
  said: string;
  /** The phrase that is saved (reads well in the About you paragraph). */
  value: string;
  /** They said yes to Nordea's guess as it is. */
  confirms?: CabinetEntry;
  /** What this answer replaces (their own older answer, or a Nordea guess they corrected). */
  replaces?: CabinetEntry;
  decision: Decision;
}

const YES = 'Yes, right';

const Bot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mrow bot"><BotAvatar /><div className="mcol"><div className="bub">{children}</div></div></div>
);
const Me: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mrow me"><div className="mcol"><div className="bub">{children}</div></div></div>
);

export const Interview: React.FC<{
  userId: string;
  userName: string;
  entries: CabinetEntry[];
  /** Ask about one field only (Edit in About you). */
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

  const answer = (said: string, phrase?: string) => {
    const s = said.trim();
    if (!s || !field) return;
    const confirms = guess && s === YES ? guess : undefined;
    const value = confirms ? confirms.title : phrase ?? s;
    setAnswers((a) => [...a, { field, said: s, value, confirms, replaces: confirms ? undefined : current, decision: 'save' }]);
    setTyped('');
    setStep((n) => n + 1);
  };
  const skip = () => { setTyped(''); setStep((n) => n + 1); };
  const decide = (i: number, d: Decision) => setAnswers((a) => a.map((x, k) => (k === i ? { ...x, decision: d } : x)));

  const save = async () => {
    setSaving(true);
    setError('');
    let n = 0;
    try {
      for (const a of answers) {
        if (a.decision === 'skip') continue;
        if (a.confirms) {
          // A yes to Nordea's guess: it stays Nordea's (so the source stays true), now confirmed.
          await confirmObservation(userId, a.confirms.id);
          if (a.decision === 'private') await updateCabinetEntry(a.confirms.id, { private: true, readableBy: { ...a.confirms.readableBy, offers: false } });
        } else if (a.replaces && originOf(a.replaces) === 'you') {
          // Their own earlier answer: changed in place, so its history shows the change.
          await updateCabinetEntry(a.replaces.id, { title: a.value, private: a.decision === 'private', reviewed: true });
        } else {
          // A Nordea guess they corrected: marked wrong (Abel stops using it), then their answer is saved.
          if (a.replaces) await updateCabinetEntry(a.replaces.id, { status: 'disputed' });
          await createCabinetEntry({
            userId, type: 'profile', profileField: a.field, title: a.value, detail: '', source: 'customer',
            private: a.decision === 'private', readableBy: { abel: true, offers: false }, how: 'Onboarding with Abel',
          });
        }
        n++;
      }
      onSaved(n ? `Saved ${n}` : 'Nothing saved');
    } catch (e: any) {
      setError(e?.message || 'Couldn’t save. Try again.');
      setSaving(false);
    }
  };

  const toSave = answers.filter((a) => a.decision !== 'skip').length;

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet iv" role="dialog" aria-label="About you" onClick={(e) => e.stopPropagation()}>
        <div className="iv-top">
          <b>About you</b>
          {!reviewing && fields.length > 1 && <span className="iv-step">{step + 1}/{fields.length}</span>}
          <button className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="iv-body">
          {fields.length === 0 ? (
            <Bot>All done, {userName}. Edit anything in About you.</Bot>
          ) : (
            <>
              {!only && <Bot>Hi {userName}! {fields.length === 1 ? 'One quick question.' : `${fields.length} quick questions.`} You check everything before it’s saved.</Bot>}
              {answers.map((a, i) => (
                <React.Fragment key={i}>
                  <Bot>{PROFILE_FIELD[a.field].question}</Bot>
                  <Me>{a.said}</Me>
                </React.Fragment>
              ))}
              {!reviewing && def && (
                <>
                  <Bot>{guess ? <>Nordea thinks: <b>{guess.title}</b>. Right?</> : def.question}</Bot>
                  <div className="iv-opts">
                    {guess && <button className="chip on" onClick={() => answer(YES)}>✓ {YES}</button>}
                    {(def.options || []).filter(([, ph]) => ph !== guess?.title).map(([label, phrase]) => (
                      <button key={label} className="chip" onClick={() => answer(label, phrase)}>{label}</button>
                    ))}
                  </div>
                  <form className="iv-type" onSubmit={(e) => { e.preventDefault(); answer(typed); }}>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type" aria-label="Your answer" maxLength={80} />
                    <button className="btn small primary" type="submit" disabled={!typed.trim()}>Send</button>
                  </form>
                  <button className="btn link iv-skip" onClick={skip}>Skip</button>
                </>
              )}
              {reviewing && answers.length > 0 && (
                <>
                  <Bot>Save these?</Bot>
                  <div className="iv-review">
                    {answers.map((a, i) => (
                      <div className={`iv-item${a.decision === 'skip' ? ' off' : ''}`} key={i}>
                        <span className="iv-k">{PROFILE_FIELD[a.field].label}</span>
                        <b>{a.value}</b>
                        <span className="iv-seg" role="radiogroup" aria-label={PROFILE_FIELD[a.field].label}>
                          {([['save', 'check', 'Save'], ['private', 'lock', 'Private'], ['skip', 'x', 'Skip']] as [Decision, string, string][]).map(([d, icon, label]) => (
                            <button key={d} role="radio" aria-checked={a.decision === d} className={`seg-${d}`} onClick={() => decide(i, d)}>
                              <Icon name={icon} size={15} strokeWidth={2.2} />{label}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="iv-fine">Private: Abel can use it. Never offers or advisers.</p>
                </>
              )}
              {reviewing && answers.length === 0 && <Bot>Okay, nothing saved.</Bot>}
            </>
          )}
          <div ref={endRef} />
        </div>

        {error && <p className="iv-err" role="alert">{error}</p>}
        {reviewing && answers.length > 0 ? (
          <button className="btn primary block" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : toSave ? `Save ${toSave}` : 'Done'}
          </button>
        ) : (reviewing || fields.length === 0) && <button className="btn block" onClick={onClose}>Close</button>}
      </div>
    </div>
  );
};
