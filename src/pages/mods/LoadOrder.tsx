import React, { useState } from 'react';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { ListGroup, ListRow } from '../../components/List';
import { SearchField } from '../../components/Screen';
import { Notice, Segmented, Switch } from '../../components/ui';
import { t } from '../../i18n';
import { call, errorText, invalidate, useCommand, useEngine } from '../../lib/engine';
import { ago, bytes, dateTime, number } from '../../lib/format';
import { useToast } from '../../lib/nav';
import {
  NewMods,
  type InstalledMod,
  type ModConflict,
  type ModsStatus,
} from '../../types/launcher';
import { mergeDraft, move, removable, renamedAs } from './logic';
import { Title } from './Title';

export const LoadOrder: React.FC<{ mods: ModsStatus }> = ({ mods }) => {
  const toast = useToast();
  const { instances } = useEngine();
  const conflicts = useCommand('modConflicts');
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [removing, setRemoving] = useState<InstalledMod | null>(null);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const listed = mods.installed.map((entry) => entry.name);
  const names = draft ? mergeDraft(draft, listed) : listed;
  const byName = new Map(mods.installed.map((entry) => [entry.name, entry]));
  const conflictOf = (name: string) =>
    conflicts.data?.mods.find((conflict) => conflict.name === name);
  const gameRunning = instances.some((instance) => instance.running);
  const q = query.trim().toLowerCase();
  // Hides rows without renumbering, so moves still use the full order.
  const matches = (mod: InstalledMod) => !q || mod.name.toLowerCase().includes(q);

  const run = async (request: Promise<unknown>, done?: string) => {
    try {
      await request;
      if (done) toast(done, 'tip');
      return true;
    } catch (err) {
      toast(errorText(err), 'caution');
      // A stale revision is rejected until the order is read again.
      invalidate('mods');
      return false;
    }
  };
  const reorder = (from: number, to: number) => {
    if (from !== to) setDraft(move(names, from, to));
  };
  const apply = async () => {
    setSaving(true);
    const saved = await run(
      call('saveModOrder', { order: names, revision: mods.orderRevision, newMods: mods.newMods }),
    );
    setSaving(false);
    // Keeps moves made while saving.
    if (saved) setDraft((current) => (current === draft ? null : current));
  };
  const available = mods.installed.filter((entry) => entry.available).map((entry) => entry.name);
  // Moves the renamed entry into the slot of the one that disappeared.
  const takePlace = (gone: string, renamed: string) =>
    run(
      call('saveModOrder', {
        order: move(listed, listed.indexOf(renamed), listed.indexOf(gone)),
        revision: mods.orderRevision,
        newMods: mods.newMods,
      }).then(() => call('forgetMod', { name: gone })),
    );
  const placeNewMods = (newMods: NewMods) =>
    run(call('saveModOrder', { order: listed, revision: mods.orderRevision, newMods }));

  return (
    <>
      <Title
        action={
          <div className="flex gap-2">
            {draft && (
              <>
                <button
                  type="button"
                  className="btn-quiet h-9 gap-1.5 rounded-full px-4 text-[14.5px]"
                  onClick={() => setDraft(null)}
                >
                  <Icon name="undo" size={17} />
                  {t('mods.order.undo')}
                </button>
                <button
                  type="button"
                  className="btn h-9 rounded-full px-5"
                  disabled={saving}
                  onClick={apply}
                >
                  {t('mods.order.apply')}
                </button>
              </>
            )}
            {names.length > 0 && (
              <SearchField value={query} onChange={setQuery} placeholder={t('mods.search')} />
            )}
          </div>
        }
      >
        {t('mods.sections.installed')}
      </Title>
      {gameRunning && (
        <Notice tone="note" icon="info" title={t('mods.order.running')} className="mb-6" />
      )}
      {mods.orderError && (
        <Notice tone="caution" icon="error" title={t('mods.order.unreadable')} className="mb-6">
          <p className="select-text">{mods.orderError}</p>
        </Notice>
      )}
      {mods.cleaned.length > 0 && (
        <Notice tone="note" icon="cleaning_services" title={t('mods.cleaned')} className="mb-6">
          <ul className="space-y-0.5 text-muted select-text">
            {mods.cleaned.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Notice>
      )}
      <ListGroup title={t('mods.order.title')} hint={t('mods.order.hint')}>
        {names.length === 0 ? (
          <ListRow label={t('mods.none')} hint={t('mods.noneHint')} />
        ) : !mods.installed.some(matches) ? (
          <ListRow label={t('mods.noMatch', { query: query.trim() })} />
        ) : (
          names.map((name, index) => {
            const mod = byName.get(name);
            if (!mod || !matches(mod)) return null;
            return (
              <div
                key={name}
                className={`list-row gap-3 ${mod.available ? '' : 'opacity-60'} ${dragged === index ? 'bg-sunken' : ''}`}
                draggable
                onDragStart={() => setDragged(index)}
                onDragEnd={() => setDragged(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragged !== null) reorder(dragged, index);
                  setDragged(null);
                }}
              >
                <span className="flex shrink-0 cursor-grab items-center gap-1 text-muted">
                  <Icon name="drag_indicator" size={18} />
                  <span className="w-6 text-right text-[14px] tabular-nums">{index + 1}</span>
                </span>
                <Row
                  mod={mod}
                  conflict={conflictOf(name)}
                  renamed={mod.available ? undefined : renamedAs(name, available)}
                  onTakePlace={(renamed) => takePlace(name, renamed)}
                />
                {mod.hasPlugins && (
                  <span
                    className="flex shrink-0 items-center gap-2 text-[14px] text-muted"
                    title={t('mods.plugins.hint')}
                  >
                    {t('mods.plugins.label')}
                    <Switch
                      checked={mod.pluginsAllowed}
                      onChange={(allowed) =>
                        run(call('allowModPlugins', { name: mod.name, allowed }))
                      }
                      label={t('mods.plugins.allow', { name: mod.name })}
                    />
                  </span>
                )}
                <span className="flex shrink-0">
                  {(
                    [
                      ['keyboard_double_arrow_up', 'toTop', 0],
                      ['keyboard_arrow_up', 'up', index - 1],
                      ['keyboard_arrow_down', 'down', index + 1],
                      ['keyboard_double_arrow_down', 'toBottom', names.length - 1],
                    ] as const
                  ).map(([icon, key, to]) => (
                    <button
                      key={key}
                      type="button"
                      className="theme-toggle rounded-full disabled:opacity-30"
                      disabled={to < 0 || to >= names.length || to === index}
                      aria-label={t(`mods.order.${key}`, { name })}
                      title={t(`mods.order.${key}`, { name })}
                      onClick={() => reorder(index, to)}
                    >
                      <Icon name={icon} size={19} />
                    </button>
                  ))}
                </span>
                {mod.available ? (
                  removable(mod) && (
                    <button
                      type="button"
                      className="theme-toggle shrink-0 rounded-full hover:text-danger"
                      aria-label={t('mods.uninstall.label', { name })}
                      title={t('mods.uninstall.label', { name })}
                      onClick={() => setRemoving(mod)}
                    >
                      <Icon name="delete" size={19} />
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="btn-quiet h-9 shrink-0 rounded-full px-4 text-[14.5px]"
                    title={t('mods.order.forgetHint')}
                    onClick={() => run(call('forgetMod', { name }))}
                  >
                    {t('mods.order.forget')}
                  </button>
                )}
              </div>
            );
          })
        )}
        {mods.sharedDir && <SharedRow dir={mods.sharedDir} conflict={conflictOf('shared')} />}
      </ListGroup>
      <ListGroup>
        <ListRow label={t('mods.order.newMods')} hint={t('mods.order.newModsHint')}>
          <Segmented
            label={t('mods.order.newMods')}
            value={mods.newMods === NewMods.BOTTOM ? NewMods.BOTTOM : NewMods.TOP}
            options={[
              [NewMods.TOP, t('mods.order.top')],
              [NewMods.BOTTOM, t('mods.order.bottom')],
            ]}
            onChange={placeNewMods}
          />
        </ListRow>
        <ListRow label={t('mods.order.reset')} hint={t('mods.order.resetHint')}>
          <button
            type="button"
            className="btn-quiet h-9 gap-2 rounded-full px-4 text-[14.5px]"
            onClick={() => setResetting(true)}
          >
            <Icon name="restart_alt" size={18} />
            {t('mods.order.resetAction')}
          </button>
        </ListRow>
      </ListGroup>
      {removing && (
        <Confirm
          title={t('mods.uninstall.title', { name: removing.name })}
          action={t('mods.uninstall.confirm')}
          danger
          onConfirm={() => {
            setRemoving(null);
            run(
              call('uninstallMod', { name: removing.name }),
              t('mods.uninstall.done', { name: removing.name }),
            );
          }}
          onCancel={() => setRemoving(null)}
        >
          <p>{t('mods.uninstall.body', { folder: 'mods/uninstalled' })}</p>
        </Confirm>
      )}
      {resetting && (
        <Confirm
          title={t('mods.order.reset')}
          action={t('mods.order.resetAction')}
          onConfirm={() => {
            setResetting(false);
            setDraft(null);
            run(call('resetModOrder', { revision: mods.orderRevision }));
          }}
          onCancel={() => setResetting(false)}
        >
          <p>{t('mods.order.resetBody')}</p>
        </Confirm>
      )}
    </>
  );
};

function Row({
  mod,
  conflict,
  renamed,
  onTakePlace,
}: {
  mod: InstalledMod;
  conflict?: ModConflict;
  renamed?: string;
  onTakePlace: (renamed: string) => void;
}) {
  const facts = mod.available
    ? [
        mod.installed > 0n ? ago(mod.installed) : null,
        mod.size > 0n ? bytes(mod.size) : null,
        mod.inPlace ? t('mods.inPlace') : null,
      ]
    : [t('mods.order.unavailable')];
  const notes = conflict ? conflictNotes(conflict) : [];
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-ink">{mod.name}</p>
      <p
        className="truncate text-[14px] text-muted"
        title={mod.installed > 0n ? dateTime(mod.installed) : undefined}
      >
        {facts.filter(Boolean).join(' · ')}
      </p>
      {renamed && (
        <p className="flex items-center gap-2 text-[14px] text-muted">
          <span className="truncate">{t('mods.order.renamed', { name: renamed })}</span>
          <button
            type="button"
            className="shrink-0 underline-offset-[3px] hover:text-ink hover:underline"
            onClick={() => onTakePlace(renamed)}
          >
            {t('mods.order.takePlace')}
          </button>
        </p>
      )}
      {mod.error && (
        <p className="truncate text-[14px] text-danger select-text" title={mod.error}>
          {t('mods.unreadable', { error: mod.error })}
        </p>
      )}
      {notes.map(([text, warn]) => (
        <p
          key={text}
          className={`truncate text-[14px] ${warn ? 'text-warn' : 'text-muted'}`}
          title={text}
        >
          {text}
        </p>
      ))}
    </div>
  );
}

/** `mods/shared`: always below the load order, so it can't be moved or uninstalled. */
function SharedRow({ dir, conflict }: { dir: string; conflict?: ModConflict }) {
  const toast = useToast();
  const open = () => window.neoomsi?.openPath(dir).catch((err) => toast(errorText(err), 'caution'));
  return (
    <div className="list-row gap-3">
      <span className="flex w-[48px] shrink-0 items-center justify-center text-muted">
        <Icon name="lock" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">{t('mods.order.shared')}</p>
        <p className="text-[14px] text-muted">{t('mods.order.sharedHint')}</p>
        {(conflict ? conflictNotes(conflict) : []).map(([text, warn]) => (
          <p
            key={text}
            className={`truncate text-[14px] ${warn ? 'text-warn' : 'text-muted'}`}
            title={text}
          >
            {text}
          </p>
        ))}
      </div>
      <button
        type="button"
        className="theme-toggle shrink-0 rounded-full"
        aria-label={t('mods.order.sharedOpen')}
        title={t('mods.order.sharedOpen')}
        onClick={open}
      >
        <Icon name="folder_open" size={19} />
      </button>
    </div>
  );
}

/** Each note's text, and whether it is a warning. */
function conflictNotes(conflict: ModConflict): [string, boolean][] {
  const out: [string, boolean][] = [];
  if (conflict.files > 0 && conflict.overridden === conflict.files) {
    out.push([t('mods.order.hidden', { mods: conflict.hiddenBy.join(', ') }), true]);
  } else if (conflict.overridden > 0) {
    out.push([
      t('mods.order.overridden', {
        n: number(conflict.overridden),
        mods: conflict.hiddenBy.join(', '),
      }),
      false,
    ]);
  }
  if (conflict.overrides > 0) {
    out.push([
      t('mods.order.overrides', {
        n: number(conflict.overrides),
        mods: conflict.overridesMods.join(', '),
      }),
      false,
    ]);
  }
  if (conflict.replacesOriginal > 0) {
    out.push([t('mods.order.replaces', { n: number(conflict.replacesOriginal) }), false]);
  }
  for (const { folder, name } of conflict.clashes) {
    out.push([t('mods.order.clash', { folder, mod: name }), true]);
  }
  return out;
}
