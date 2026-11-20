import React from 'react';
import { Icon } from './icons.js';
import { CabinetEntry } from '../types.js';
import { Origin, originOf, ORIGIN_LABEL } from '../entrySource.js';

const ORIGIN_ICON: Record<Origin, string> = { you: 'person', nordea: 'bank', register: 'idcard', document: 'file', hidden: 'eyeoff' };

/**
 * The badge on every item in What Abel knows: who put it there. Replaces the small coloured dot,
 * which was easy to miss. Same colours as before: green = you, orange = Nordea, purple = register.
 */
export const SourceBadge: React.FC<{ e?: Pick<CabinetEntry, 'type' | 'source' | 'provenance'>; origin?: Origin; label?: string }> = ({ e, origin, label }) => {
  const o = origin ?? (e ? originOf(e) : 'you');
  return (
    <span className={`src-badge src-${o}`}>
      <Icon name={ORIGIN_ICON[o]} size={13} strokeWidth={2.2} />
      {label ?? ORIGIN_LABEL[o]}
    </span>
  );
};

/** For entries Nordea added: one plain line saying why, always visible (not hidden behind a button). */
export const WhyLine: React.FC<{ e: Pick<CabinetEntry, 'type' | 'source' | 'provenance' | 'why'> }> = ({ e }) => {
  const o = originOf(e);
  if (!e.why || (o !== 'nordea' && o !== 'register')) return null;
  const lead = o === 'register' ? `From ${e.provenance?.register || 'a public register'}:` : 'Why Nordea added this:';
  return <span className={`why-line why-${o}`}><b>{lead}</b> {e.why}</span>;
};
