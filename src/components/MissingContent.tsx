import React from 'react';
import { t } from '../i18n';
import { call, errorText } from '../lib/engine';
import { number } from '../lib/format';
import { useToast } from '../lib/nav';
import { DiagnosticClass, Severity, type Diagnostic } from '../types/launcher';
import { Icon } from './Icon';

// Ties on severity: most serious cause first.
const CLASSES = [
  DiagnosticClass.MISSING_DEPENDENCY,
  DiagnosticClass.INACTIVE_DEPENDENCY,
  DiagnosticClass.INCOMPLETE_PACK,
  DiagnosticClass.INCOMPLETE_MOD,
  DiagnosticClass.MISSING_FILE,
];

export const MissingContent: React.FC<{ findings: Diagnostic[] }> = ({ findings }) => {
  const toast = useToast();
  const dismiss = (key: string) =>
    call('dismissDiagnostic', { key }).catch((err) => toast(errorText(err), 'caution'));
  const sorted = [...findings].sort(
    (left, right) =>
      right.severity - left.severity || CLASSES.indexOf(left.class) - CLASSES.indexOf(right.class),
  );
  return (
    <div className="rounded-xl bg-sunken px-4 py-3 text-[14.5px] leading-snug">
      <p className="mb-2 font-semibold text-ink">{t('sessions.missing.title')}</p>
      <ul className="space-y-2.5">
        {sorted.map((finding, index) => (
          <li key={finding.key || index} className="flex gap-2.5">
            <span
              className={`mt-px shrink-0 ${finding.severity === Severity.REQUIRED ? 'text-warn' : 'text-muted'}`}
            >
              <Icon name="warning" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={finding.severity === Severity.OPTIONAL ? 'text-muted' : 'text-ink'}>
                {t(`sessions.missing.${DiagnosticClass[finding.class].toLowerCase()}`, {
                  requester: finding.requester,
                  pack: finding.pack,
                  provider: finding.provider,
                  count: number(finding.count),
                })}
              </span>
              <span className="block truncate font-mono text-[13px] text-muted select-text">
                {finding.samples.join(' · ')}
              </span>
            </span>
            <button
              type="button"
              className="theme-toggle size-7 shrink-0 rounded-full"
              aria-label={t('sessions.missing.dismiss')}
              title={t('sessions.missing.dismiss')}
              onClick={() => dismiss(finding.key)}
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13.5px] text-muted">{t('sessions.missing.hint')}</p>
    </div>
  );
};
