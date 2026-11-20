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
  /** For Abel's own words in chat: what we know, as part of a sentence ("you want to buy a flat with your partner"). */
  reason: string;
  /** What he'd suggest, as part of a sentence ("move 300 € more to savings each payday"). */
  suggest?: string;
  /** A sentence said before the suggestions ("Right now you’d be about 8 200 € short by April 2028."). */
  lead?: string;
  /** A sentence said after them ("I’ll only suggest safe options."). */
  note?: string;
}

/** "Buy a flat with my partner" -> "you want to buy a flat with your partner". */
function wantClause(title: string): string {
  const t = title.trim().replace(/\bmy\b/gi, 'your').replace(/\bI\b/g, 'you');
  if (/^(buy|save|get|pay|start|travel|move|build|feel|have)\b/i.test(t)) return `you want to ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  if (/^wants to\b/i.test(t)) return `you ${t.charAt(0).toLowerCase()}${t.slice(1).replace(/^ants/, 'ant')}`;
  return `you’re saving for “${title}”`;
}
const and = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Abel's first message in a new chat, in plain human words:
 *  "You told me … Nordea also noticed … So I'd suggest … Want to start with one of these?" */
export function openingMessage(name: string, tips: Tip[]): string {
  const mine = tips.filter((t) => t.from === 'you').map((t) => t.reason);
  const bank = tips.filter((t) => t.from === 'bank').map((t) => t.reason);
  // The most concrete step first (what Nordea noticed in the account), then the rest.
  const suggest = [...tips].sort((a, b) => (a.from === b.from ? 0 : a.from === 'bank' ? -1 : 1)).map((t) => t.suggest).filter(Boolean) as string[];
  const leads = tips.map((t) => t.lead).filter(Boolean) as string[];
  const notes = tips.map((t) => t.note).filter(Boolean) as string[];
  const first = mine.length ? `You told me ${and(mine.map((r, i) => (i ? `that ${r}` : r)))}.` : '';
  const second = bank.length ? `${mine.length ? 'Nordea also noticed' : 'Nordea noticed'} ${and(bank)}.` : '';
  const ideas = suggest.length === 1 ? `So I’d suggest you ${suggest[0]}.`
    : suggest.length === 2 ? `So I’d suggest two things: ${suggest[0]}, and ${suggest[1]}.`
    : suggest.length ? `So I’d suggest a few things: ${suggest.slice(0, -1).join('; ')}; and ${suggest[suggest.length - 1]}.` : '';
  const lines = [
    `Hi ${name} 👋 ${first}${first && second ? ' ' : ''}${second}`.trim(),
    [...leads, ideas, ...notes].filter(Boolean).join(' '),
    suggest.length > 1 ? 'Want to start with one of these?' : suggest.length ? 'Want to look at it together?' : 'What would you like to look at?',
  ];
  return lines.filter(Boolean).join('\n\n');
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
      reason: wantClause(homeGoal.title),
      suggest: asp ? 'look at an ASP account, which is made for a first home' : undefined,
      lead: homeGoal.onTrack ? `You’re on track for ${monthLong(homeGoal.targetDate.slice(0, 7))}.` : `At this pace you’d be about ${eur(homeGoal.shortBy)} short by ${monthLong(homeGoal.targetDate.slice(0, 7))}.`,
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
      reason: `your salary went up${/ in [A-Z][a-z]+ \d{4}$/.test(raise.title) ? raise.title.match(/ in [A-Z][a-z]+ \d{4}$/)![0] : ''}, but your saving stayed the same`,
      suggest: `move ${eur(state.payPlan.suggestedExtraMove)} more to savings each payday`,
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
        reason: 'you’ve been eating out more than usual',
        suggest: `set a monthly dining budget, which could free about ${eur(now - usual)} a month`,
      });
    }
  }

  // 4. Keep savings safe -> only safe suggestions.
  const safe = live.find((e) => (e.type === 'profile' && e.profileField === 'risk' && /safe|(n[o’']t|never)\b.*\brisk/i.test(e.title)) || (e.type === 'preference' && /low-risk|safe/i.test(e.title)));
  if (safe) {
    tips.push({
      id: 'tip-safe', from: 'you', entryId: safe.id,
      because: `You told us: ${safe.title.replace(/^I /, 'you ')}`,
      title: 'Only safe options for you',
      body: 'Abel suggests savings accounts and ASP, never funds or shares.',
      reason: 'you like to keep your savings safe',
      note: 'And I’ll stick to safe options.',
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
      reason: wantClause(wants.title),
      suggest: 'turn it into a goal, so I can keep track of it with you',
    });
  }
  return tips;
}
