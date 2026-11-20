import React from 'react';
import { Icon } from './icons.js';

/**
 * One button style for every decision the customer makes about their data.
 *
 * The rule, everywhere in the app:
 *   1. The "yes" answer comes first (✓ Save, ✓ Yes, that's right, ✓ Keep it).
 *   2. The in-between answer comes next (🔒 Save privately, + Keep both).
 *   3. The "no" answer comes last (✕ Not needed, ✕ That's wrong, Archive).
 *   4. "Tell me more" links (How do we know?, History) come after the answers and look like links.
 * Each kind always has the same icon, so the customer can read a row of buttons at a glance.
 * Only the suggested answer is filled; the order never changes.
 */
export type ChoiceKind = 'yes' | 'private' | 'alt' | 'no' | 'archive' | 'restore' | 'more';

const ICON: Record<ChoiceKind, string | null> = {
  yes: 'check',
  private: 'lock',
  alt: 'plus',
  no: 'x',
  archive: 'archive',
  restore: 'undo',
  more: null,
};

export const Choice: React.FC<{
  kind: ChoiceKind;
  label: string;
  onClick: () => void;
  /** Filled: the answer we suggest. Defaults to true for 'yes', false otherwise. */
  primary?: boolean;
  /** Full-size button (cards on Home) instead of the small one (rows in What Abel knows). */
  large?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  title?: string;
}> = ({ kind, label, onClick, primary, large, expanded, disabled, title }) => {
  const filled = primary ?? kind === 'yes';
  const cls = ['btn', 'choice', `choice-${kind}`, large ? '' : 'small', filled ? 'primary' : kind === 'more' ? 'quiet' : ''].filter(Boolean).join(' ');
  const icon = ICON[kind];
  return (
    <button className={cls} onClick={onClick} aria-expanded={expanded} disabled={disabled} title={title}>
      {icon && <Icon name={icon} size={large ? 18 : 16} strokeWidth={2.2} />}
      {label}
    </button>
  );
};

/** A row of choices, laid out the same way everywhere. */
export const Choices: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span className="choices">
    {hint && <span className="choice-hint">{hint}</span>}
    <span className="choice-row">{children}</span>
  </span>
);
