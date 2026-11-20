import React from 'react';

/**
 * The one decision in What Abel knows: Share / Keep private / Delete.
 *   Share         - Abel uses it, and Nordea may use it too (e.g. to tailor offers).
 *   Keep private  - only Abel uses it.
 *   Delete        - Abel stops using it. (Kept at the bottom of the page, so it can be restored.)
 * Same order everywhere, in the app's original button style (like Save / Keep private / Drop):
 * the suggested or current choice is the filled button, the others are outlined, Delete is plain text.
 */
export type Decision = 'share' | 'private' | 'delete' | 'keep';

const LABEL: Record<Decision, string> = { share: 'Share', private: 'Keep private', delete: 'Delete', keep: 'Keep' };

export const Decide: React.FC<{
  options?: Decision[];
  /** The choice already made (shown filled). Without one, the first option is the filled one. */
  current?: Decision;
  onPick: (d: Decision) => void;
  label?: string;
}> = ({ options = ['share', 'private', 'delete'], current, onPick, label = 'Choose' }) => {
  const filled = current ?? options[0];
  return (
    <span className="wait-act" role="group" aria-label={label}>
      {options.map((d) => (
        <button
          key={d}
          className={`btn small ${d === filled ? 'primary' : d === 'delete' ? 'quiet' : ''}`}
          aria-pressed={current ? current === d : undefined}
          onClick={(e) => { e.stopPropagation(); onPick(d); }}
        >
          {LABEL[d]}
        </button>
      ))}
    </span>
  );
};
