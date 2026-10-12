import React from 'react';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';
import { call, errorText } from '../../lib/engine';
import { number } from '../../lib/format';
import { useToast } from '../../lib/nav';
import type { Diagnostic } from '../../types/launcher';

const CLASSES = [
  'missing_dependency',
  'inactive_dependency',
  'incomplete_pack',
  'incomplete_mod',
  'missing_file',
];

export const MissingContent: React.FC<{ findings: Diagnostic[] }> = ({ findings }) => {
  const toast = useToast();
  const dismiss = (key: string) =>
    call('dismissDiagnostic', { key }).catch((err) => toast(errorText(err), 'caution'));
  const sorted = [...findings].sort(
    (a, b) =>
      CLASSES.indexOf(a.class) - CLASSES.indexOf(b.class) ||
      Number(b.severity === 'required') - Number(a.severity === 'required'),
  );
  return (
    <div className="rounded-xl bg-sunken px-4 py-3 text-[14.5px] leading-snug">
      <p className="mb-2 font-semibold text-ink">{t('sessions.missing.title')}</p>
      <ul className="space-y-2.5">
        {sorted.map((f, k) => (
          <li key={f.key || k} className="flex gap-2.5">
            <span
              className={`mt-px shrink-0 ${f.severity === 'required' ? 'text-warn' : 'text-muted'}`}
            >
              <Icon name="warning" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={f.severity === 'optional' ? 'text-muted' : 'text-ink'}>
                {t(`sessions.missing.${f.class}`, {
                  requester: f.requester,
                  pack: f.pack,
                  provider: f.provider,
                  count: number(f.count),
                })}
              </span>
              <span className="block truncate font-mono text-[13px] text-muted select-text">
                {f.samples.join(' · ')}
              </span>
            </span>
            <button
              type="button"
              className="theme-toggle size-7 shrink-0 rounded-full"
              aria-label={t('sessions.missing.dismiss')}
              title={t('sessions.missing.dismiss')}
              onClick={() => dismiss(f.key)}
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
