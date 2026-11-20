import React from 'react';
import { Icon } from './icons.js';

/**
 * The one decision control in What Abel knows: Share / Keep private / Delete.
 *   Share         - Abel uses it, and Nordea may use it too (e.g. to tailor offers).
 *   Keep private  - only Abel uses it.
 *   Delete        - Abel stops using it. (Kept at the bottom of the page, so it can be restored.)
 * Always the same order, same icons, same look. For an item that already has a choice, it shows as selected.
 */
export type Decision = 'share' | 'private' | 'delete' | 'keep';

const LABEL: Record<Decision, string> = { share: 'Share', private: 'Keep private', delete: 'Delete', keep: 'Keep' };
const ICON: Record<Decision, string> = { share: 'share', private: 'lock', delete: 'trash', keep: 'check' };

export const Decide: React.FC<{
  options?: Decision[];
  current?: Decision;
  onPick: (d: Decision) => void;
  label?: string;
}> = ({ options = ['share', 'private', 'delete'], current, onPick, label = 'Choose' }) => (
  <span className="dec" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, auto)` }}>
    {options.map((d) => (
      <button key={d} className={`dec-${d}`} aria-pressed={current === d} onClick={(e) => { e.stopPropagation(); onPick(d); }}>
        <Icon name={ICON[d]} size={15} strokeWidth={2.2} />
        {LABEL[d]}
      </button>
    ))}
  </span>
);
