import React from 'react';
import type { CabinetEntry } from '../types.js';
import { originOf, ORIGIN_LABEL, Origin } from '../entrySource.js';
import { Icon } from './icons.js';

/**
 * Where something in What Abel knows came from, as a clear badge (not just a coloured dot):
 *   You set this · From your bank data · From your payslip · From your document · From the population register
 * Green = the customer, orange = Nordea's data, blue = a public register.
 */
const ICON: Record<Origin, string> = { you: 'person', nordea: 'bank', document: 'file', register: 'idcard', hidden: 'eyeoff' };

export const isPayslip = (e: Pick<CabinetEntry, 'provenance' | 'title' | 'detail'>) =>
  /payslip/i.test(`${e.provenance?.detectedFrom || ''} ${e.provenance?.documentId || ''} ${e.detail || ''}`);

export function badgeOf(e: Pick<CabinetEntry, 'type' | 'source' | 'provenance' | 'title' | 'detail'>): { label: string; cls: string; icon: string } {
  const o = originOf(e);
  if (o === 'document' && isPayslip(e)) return { label: 'From your payslip', cls: 'bank', icon: 'file' };
  return { label: ORIGIN_LABEL[o], cls: o === 'you' ? 'you' : o === 'register' ? 'reg' : o === 'hidden' ? 'grey' : 'bank', icon: ICON[o] };
}

export const SourceBadge: React.FC<{ e?: Pick<CabinetEntry, 'type' | 'source' | 'provenance' | 'title' | 'detail'>; from?: 'you' | 'bank' | 'payslip'; extra?: string }> = ({ e, from, extra }) => {
  const b = e ? badgeOf(e)
    : from === 'you' ? { label: 'You set this', cls: 'you', icon: 'person' }
    : from === 'payslip' ? { label: 'From your payslip', cls: 'bank', icon: 'file' }
    : { label: 'From your bank data', cls: 'bank', icon: 'bank' };
  return (
    <span className={`src-badge ${b.cls}`}>
      <Icon name={b.icon} size={13} strokeWidth={2.2} />
      {b.label}
      {extra && <span className="src-extra">· {extra}</span>}
    </span>
  );
};
