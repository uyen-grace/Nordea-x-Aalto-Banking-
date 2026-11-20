import type { ProfileField } from './types.js';

/**
 * The "About you" profile: the basic picture of who the customer is, like the memory in
 * Claude or ChatGPT. One cabinet entry (type 'profile') per field. Each entry keeps its source,
 * so the customer can see whether they said it, Nordea inferred it, or it came from a register.
 *
 * Used by the app (About you section, onboarding interview) and by Abel's prompt.
 */
export interface ProfileFieldDef {
  key: ProfileField;
  /** Label in "About you". */
  label: string;
  /** What Abel asks in the onboarding interview. Fields without a question are never asked
   *  (basics come from the register). */
  question?: string;
  /** Why Abel asks - shown under the question so the customer knows what it's for. */
  why?: string;
  /** Quick answers to tap. The customer can always type their own instead. */
  options?: string[];
  /** Placeholder for a typed answer. */
  placeholder?: string;
}

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: 'basics', label: 'Basics' },
  {
    key: 'life_situation',
    label: 'Life situation',
    question: 'What does your life look like right now?',
    why: 'So Abel’s tips fit a student, a worker or a new parent.',
    options: ['Working', 'Studying', 'Studying and working', 'Between jobs', 'On parental leave', 'Retired'],
    placeholder: 'Or say it in your own words',
  },
  {
    key: 'household',
    label: 'Household',
    question: 'Who do you share your money life with?',
    why: 'Plans like a home or a holiday often involve someone else.',
    options: ['Just me', 'My partner', 'My partner and kids', 'My kids', 'Flatmates'],
    placeholder: 'For example: my partner Mia',
  },
  {
    key: 'housing',
    label: 'Housing',
    question: 'Where do you live?',
    why: 'Rent or a loan is usually the biggest monthly cost.',
    options: ['Renting', 'I own my home', 'With my parents', 'Student housing'],
  },
  {
    key: 'income',
    label: 'Income',
    question: 'How steady is your income?',
    why: 'A steady salary and a changing one need different plans.',
    options: ['Steady monthly salary', 'It changes month to month', 'Student grant or benefits', 'No income right now'],
  },
  {
    key: 'ambition',
    label: 'Ambitions',
    question: 'What would you most like your money to help with in the next few years?',
    why: 'Abel uses this to put the right things first.',
    options: ['Buy a home', 'Feel secure', 'Travel', 'Start a business', 'Pay off debt'],
    placeholder: 'In your own words',
  },
  {
    key: 'risk',
    label: 'Risk',
    question: 'How do you feel about risk with your savings?',
    why: 'So Abel never suggests something you’d be uneasy with.',
    options: ['Keep it safe', 'A little risk is fine', 'I’m comfortable with risk'],
  },
];

export const PROFILE_FIELD = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f])) as Record<ProfileField, ProfileFieldDef>;

export const isProfileField = (v: unknown): v is ProfileField => typeof v === 'string' && v in PROFILE_FIELD;
