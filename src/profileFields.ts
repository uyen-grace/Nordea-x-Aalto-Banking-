import type { ProfileField } from './types.js';

/**
 * The "About you" profile: the basic picture of who the customer is, like the memory in
 * Claude or ChatGPT. One cabinet entry (type 'profile') per field. Each entry keeps its source,
 * so the customer can see whether they said it, Nordea inferred it, or it came from a register.
 *
 * Values are short phrases ("Works full-time", "Rents"), so the fields read as one paragraph.
 * Used by the app (About you, the interview) and by Abel's prompt.
 */
export interface ProfileFieldDef {
  key: ProfileField;
  /** Label in the details. */
  label: string;
  /** What Abel asks in the interview. Fields without a question are never asked (basics come from the register). */
  question?: string;
  /** Quick answers to tap: what the button says -> the phrase that is saved. */
  options?: [label: string, phrase: string][];
}

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: 'basics', label: 'Basics' },
  {
    key: 'life_situation', label: 'Life', question: 'What do you do right now?',
    options: [['Working', 'Works'], ['Studying', 'Studies'], ['Both', 'Studies and works'], ['Between jobs', 'Between jobs'], ['Parental leave', 'On parental leave'], ['Retired', 'Retired']],
  },
  {
    key: 'household', label: 'Home life', question: 'Who do you live with?',
    options: [['Alone', 'Lives alone'], ['Partner', 'Lives with a partner'], ['Partner and kids', 'Lives with a partner and kids'], ['Kids', 'Lives with kids'], ['Flatmates', 'Lives with flatmates']],
  },
  {
    key: 'housing', label: 'Housing', question: 'Do you rent or own?',
    options: [['Rent', 'Rents'], ['Own', 'Owns a home'], ['With parents', 'Lives with parents'], ['Student housing', 'Student housing']],
  },
  {
    key: 'income', label: 'Income', question: 'How steady is your income?',
    options: [['Steady', 'Steady salary'], ['It varies', 'Income varies'], ['Grant or benefits', 'Grant or benefits'], ['None right now', 'No income right now']],
  },
  {
    key: 'ambition', label: 'Wants', question: 'What should your money help with next?',
    options: [['A home', 'Wants to buy a home'], ['Feeling secure', 'Wants to feel secure'], ['Travel', 'Wants to travel'], ['A business', 'Wants to start a business'], ['Paying off debt', 'Wants to pay off debt']],
  },
  {
    key: 'risk', label: 'Risk', question: 'How much risk with savings?',
    options: [['Keep it safe', 'Keeps savings safe'], ['A little', 'OK with a little risk'], ['I’m fine with risk', 'Comfortable with risk']],
  },
];

export const PROFILE_FIELD = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f])) as Record<ProfileField, ProfileFieldDef>;

export const isProfileField = (v: unknown): v is ProfileField => typeof v === 'string' && v in PROFILE_FIELD;
