// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { MissingContent } from '../components/MissingContent';
import { setLanguage, t } from '../i18n';
import { EngineProvider } from '../lib/engine';
import { number } from '../lib/format';
import { LoadOrder } from '../pages/mods/LoadOrder';
import { Preflight } from '../pages/mods/Preflight';
import {
  DiagnosticClass,
  DiagnosticSchema,
  InstalledModSchema,
  InstallMode,
  ModConflictListSchema,
  ModsStatusSchema,
  NewMods,
  ResponseSchema,
  Severity,
  SourceInfoSchema,
} from '../types/launcher';
import type { NeoomsiBridge } from '../types/neoomsi';

// jsdom has no ResizeObserver, and the segmented control measures itself with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let calls: [string, unknown][] = [];

/** A fake engine that returns `answers`, and an empty answer of the right kind otherwise. */
function engine(answers: Record<string, unknown> = {}) {
  calls = [];
  const noop = () => () => {};
  window.neoomsi = {
    getEngineStatus: async () => ({ connectionState: 'connected', capabilities: [] }),
    startEngine: async () => ({ connectionState: 'connected', capabilities: [] }),
    onEngineStatus: noop,
    onDiagnosticLog: noop,
    onEngineEvent: noop,
    call: async (command: string, args?: unknown) => {
      calls.push([command, args]);
      if (command in answers) {
        const answer = answers[command];
        return typeof answer === 'function' ? answer() : answer;
      }
      return create(ResponseSchema, {
        answer: { case: command, value: {} } as MessageInitShape<typeof ResponseSchema>['answer'],
      }).answer.value;
    },
  } as unknown as NeoomsiBridge;
}

const sent = (command: string) =>
  calls.filter(([called]) => called === command).map(([, args]) => args);

beforeEach(() => setLanguage('en'));

afterEach(() => {
  cleanup();
  delete (window as { neoomsi?: NeoomsiBridge }).neoomsi;
});

describe('the load order', () => {
  it('saves the order the player arranged, with the revision it read', async () => {
    engine({
      modConflicts: create(ModConflictListSchema, {
        mods: [{ name: 'A', clashes: [{ folder: 'Lion', name: 'B' }] }],
      }),
    });
    const mod = (name: string) => create(InstalledModSchema, { name, available: true });
    const mods = create(ModsStatusSchema, {
      installed: [mod('A'), mod('B'), mod('C')],
      orderRevision: 3n,
      newMods: NewMods.BOTTOM,
    });
    render(
      <EngineProvider>
        <LoadOrder mods={mods} />
      </EngineProvider>,
    );
    await screen.findByText(t('mods.order.clash', { folder: 'Lion', mod: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: t('mods.order.toTop', { name: 'C' }) }));
    fireEvent.click(screen.getByRole('button', { name: t('mods.order.apply') }));
    await waitFor(() =>
      expect(sent('saveModOrder')).toEqual([
        { order: ['C', 'A', 'B'], revision: 3n, newMods: NewMods.BOTTOM },
      ]),
    );
  });

  const arrange = (saveModOrder: () => unknown) => {
    engine({ saveModOrder });
    const mod = (name: string) => create(InstalledModSchema, { name, available: true });
    render(
      <EngineProvider>
        <LoadOrder mods={create(ModsStatusSchema, { installed: [mod('A'), mod('B'), mod('C')] })} />
      </EngineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: t('mods.order.toTop', { name: 'C' }) }));
    return () => screen.queryByRole('button', { name: t('mods.order.apply') });
  };
  const cOnTop = () =>
    (
      screen.getByRole('button', {
        name: t('mods.order.toTop', { name: 'C' }),
      }) as HTMLButtonElement
    ).disabled;

  it('drops the draft once the order is saved', async () => {
    const apply = arrange(() => ({}));
    fireEvent.click(apply()!);
    await waitFor(() => expect(apply()).toBeNull());
    expect(cOnTop()).toBe(false);
  });

  it('keeps the draft when the order was changed elsewhere, so it can be saved again', async () => {
    let fail = true;
    const apply = arrange(() => {
      if (fail) throw new Error('the load order was changed elsewhere - it was read again');
      return {};
    });
    fireEvent.click(apply()!);
    await waitFor(() => expect((apply() as HTMLButtonElement).disabled).toBe(false));
    expect(cOnTop()).toBe(true);
    fail = false;
    fireEvent.click(apply()!);
    await waitFor(() => expect(apply()).toBeNull());
    expect(sent('saveModOrder')).toHaveLength(2);
  });

  it('hides mods the search does not match, but moves them in the full order', async () => {
    const apply = arrange(() => ({}));
    const search = screen.getByRole('searchbox', { name: t('mods.search') });
    fireEvent.change(search, { target: { value: 'a' } });
    expect(screen.queryByRole('button', { name: t('mods.order.up', { name: 'B' }) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('mods.order.toTop', { name: 'A' }) }));
    fireEvent.click(apply()!);
    await waitFor(() =>
      expect(sent('saveModOrder')).toEqual([expect.objectContaining({ order: ['A', 'C', 'B'] })]),
    );
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(t('mods.noMatch', { query: 'zzz' }))).toBeTruthy();
  });

  it('saves once while a save is running', async () => {
    let finish = () => {};
    const apply = arrange(() => new Promise<void>((resolve) => (finish = resolve)));
    fireEvent.click(apply()!);
    fireEvent.click(apply()!);
    expect(sent('saveModOrder')).toHaveLength(1);
    finish();
    await waitFor(() => expect(apply()).toBeNull());
  });
});

describe('missing content', () => {
  it('lists the most serious first and dismisses a finding by its key', async () => {
    engine();
    const finding = (key: string, kind: DiagnosticClass, severity: Severity) =>
      create(DiagnosticSchema, {
        key,
        class: kind,
        severity,
        requester: 'Town',
        pack: `Splines/${key}`,
        count: 1,
      });
    render(
      <MissingContent
        findings={[
          finding('file', DiagnosticClass.MISSING_FILE, Severity.REQUIRED),
          finding('degraded', DiagnosticClass.MISSING_DEPENDENCY, Severity.DEGRADED),
          finding('required', DiagnosticClass.MISSING_DEPENDENCY, Severity.REQUIRED),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(items[0]).toContain('Splines/required');
    expect(items[1]).toContain(
      t('sessions.missing.missing_file', { requester: 'Town', count: number(1) }),
    );
    expect(items[2]).toContain('Splines/degraded');
    fireEvent.click(screen.getAllByRole('button', { name: t('sessions.missing.dismiss') })[0]);
    await waitFor(() => expect(sent('dismissDiagnostic')).toEqual([{ key: 'required' }]));
  });
});

describe('installing a mod that is installed already', () => {
  const install = async (keep: boolean) => {
    engine({ modinfo: create(SourceInfoSchema, { isArchive: false, fits: true }) });
    const installed = [create(InstalledModSchema, { name: 'Bus', available: true })];
    render(
      <EngineProvider>
        <Preflight
          path="C:\Downloads\Bus.zip"
          installed={installed}
          position={1}
          total={1}
          onStarted={() => {}}
          onDone={() => {}}
        />
      </EngineProvider>,
    );
    const button = await screen.findByRole('button', { name: t('mods.sheet.install') });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    if (keep) {
      fireEvent.click(
        screen.getByRole('switch', { name: t('mods.sheet.replace', { name: 'Bus' }) }),
      );
    }
    fireEvent.click(button);
    await waitFor(() => expect(sent('startInstall')).toHaveLength(1));
    return sent('startInstall')[0];
  };

  it('replaces it by default', async () => {
    expect(await install(false)).toEqual({
      path: 'C:\\Downloads\\Bus.zip',
      mode: InstallMode.AUTO,
      replace: true,
    });
  });

  it('does not when the player turns Replace off', async () => {
    expect(await install(true)).toMatchObject({ replace: false });
  });
});

describe('looking inside an archive', () => {
  it('offers to try again when it failed, and asks the engine again', async () => {
    let looks = 0;
    engine({
      modinfo: () => {
        looks += 1;
        if (looks === 1) throw new Error('the disk is busy');
        return create(SourceInfoSchema, { isArchive: false, fits: true });
      },
    });
    render(
      <EngineProvider>
        <Preflight
          path="C:\Downloads\Bus.zip"
          installed={[]}
          position={1}
          total={1}
          onStarted={() => {}}
          onDone={() => {}}
        />
      </EngineProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: t('mods.sheet.retry') }));
    const install = await screen.findByRole('button', { name: t('mods.sheet.install') });
    await waitFor(() => expect((install as HTMLButtonElement).disabled).toBe(false));
    expect(looks).toBe(2);
    expect(screen.queryByRole('button', { name: t('mods.sheet.retry') })).toBeNull();
  });
});
