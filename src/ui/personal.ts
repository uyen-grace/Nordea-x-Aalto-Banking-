import type { AppState } from '../services/api.js';
import type { CabinetEntry } from '../types.js';
import { originOf } from '../entrySource.js';
import { eur, monthLong } from './format.js';

/**
 * "Because you told us X -> here's Y": the reason to fill the cabinet.
 * Each tip comes from one thing in What Abel knows that Abel may use (the customer's own, or something
 * Nordea noticed that they said yes to). Nothing waiting, deleted or marked wrong ever makes a tip.
 * Numbers come from the app's own figures (goals, payday plan), never invented here.
 */
export interface Tip {
  id: string;
  /** Who the reason came from: the customer, or Nordea (confirmed by the customer). */
  from: 'you' | 'bank';
  /** X: what we know. */
  because: string;
  /** Y: what it means for them. */
  title: string;
  body: string;
  /** The entry it's based on, so the card can say where it came from. */
  entryId: string;
  /** Ask Abel about it. */
  ask?: { label: string; text: string };
}

const usable = (e: CabinetEntry) => e.status === 'active' && (originOf(e) === 'you' || originOf(e) === 'document' || e.reviewed);
const euros = (s: string) => [...s.matchAll(/(\d[\d  ]*)\s*€/g)].map((m) => Number(m[1].replace(/[\s  ]/g, '')));

export function tipsFor(state: AppState): Tip[] {
  const live = state.entries.filter(usable);
  const tips: Tip[] = [];

  // 1. A home goal -> where it's heading, and the ASP account made for first homes (ASP is for ages 15-44).
  const homeGoal = state.goals.find((g) => {
    const e = live.find((x) => x.id === g.goalId);
    return e && (e.goalType === 'home' || /flat|home|apartment|house|asunto/i.test(e.title));
  });
  if (homeGoal) {
    const asp = state.user.age >= 15 && state.user.age <= 44;
    tips.push({
      id: 'tip-home', from: 'you', entryId: homeGoal.goalId,
      because: `You told us: ${homeGoal.title}`,
      title: homeGoal.onTrack ? 'You’re on track for your flat' : `About ${eur(homeGoal.shortBy)} short by ${monthLong(homeGoal.targetDate.slice(0, 7))}`,
      body: `At ${eur(homeGoal.monthlyGoingIn)} a month you’ll have about ${eur(homeGoal.projectedByTargetDate)}.${asp ? ' An ASP home savings account is made for a first home: extra interest, and better loan terms later.' : ''}`,
      ask: asp ? { label: 'Ask Abel about ASP', text: 'Would an ASP account help with my flat?' } : { label: 'Ask Abel', text: `Am I on track for “${homeGoal.title}”?` },
    });
  }

  // 2. Nordea noticed a raise (and they said yes) -> move some of it to the goal.
  const raise = live.find((e) => originOf(e) === 'nordea' && e.type === 'observation' && /salary|pay/i.test(e.title));
  if (raise && state.payPlan.suggestedExtraMove > 0) {
    tips.push({
      id: 'tip-raise', from: 'bank', entryId: raise.id,
      because: `Nordea noticed: ${raise.title.replace(/^Your /, 'your ')}`,
      title: `Move ${eur(state.payPlan.suggestedExtraMove)} more each payday`,
      body: `You still save ${eur(state.payPlan.alreadySavingPerMonth)} a month.${state.payPlan.towardsGoal ? ` This would bring “${state.payPlan.towardsGoal}” closer.` : ''}`,
      ask: { label: 'Plan my payday', text: 'Plan my next payday' },
    });
  }

  // 3. Eating out more (they said yes) -> what a budget would free up.
  const eatingOut = live.find((e) => originOf(e) === 'nordea' && /eat|restaurant/i.test(`${e.title} ${e.detail}`));
  if (eatingOut) {
    const [now, usual] = euros(eatingOut.detail);
    if (now && usual && now > usual) {
      tips.push({
        id: 'tip-eating', from: 'bank', entryId: eatingOut.id,
        because: 'Nordea noticed: you eat out more',
        title: `A dining budget could free about ${eur(now - usual)} a month`,
        body: `About ${eur(now)} a month lately, usually ${eur(usual)}.`,
        ask: { label: 'Set a budget with Abel', text: 'Help me set a monthly dining budget' },
      });
    }
  }

  // 4. Keep savings safe -> only safe suggestions.
  const safe = live.find((e) => (e.type === 'profile' && e.profileField === 'risk' && /safe/i.test(e.title)) || (e.type === 'preference' && /low-risk|safe/i.test(e.title)));
  if (safe) {
    tips.push({
      id: 'tip-safe', from: 'you', entryId: safe.id,
      because: `You told us: ${safe.title.replace(/^I /, 'you ')}`,
      title: 'Only safe options for you',
      body: 'Abel suggests savings accounts and ASP, never funds or shares.',
    });
  }

  // 5. An ambition with no goal yet -> make it a goal.
  const wants = live.find((e) => e.type === 'profile' && e.profileField === 'ambition');
  if (wants && !homeGoal && /home|flat/i.test(wants.title)) {
    tips.push({
      id: 'tip-wants', from: 'you', entryId: wants.id,
      because: `You told us: ${wants.title}`,
      title: 'Make it a goal',
      body: 'With an amount and a date, Abel tracks it and tells you if you fall behind.',
      ask: { label: 'Set it up with Abel', text: 'Help me set a savings goal for a home' },
    });
  }
  return tips;
}
