import { describe, expect, it } from 'vitest';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { MockLauncher } from '../../electron/mock/launcher';
import {
  canInstall,
  enqueue,
  installedAs,
  isRunning,
  jobProgress,
  mergeDraft,
  move,
  removable,
  renamedAs,
  splitJobs,
  stateTone,
} from '../pages/mods/logic';
import {
  InstallMode,
  InstalledModSchema,
  InstallProgressSchema,
  InstallState,
  SourceInfoSchema,
} from '../types/launcher';

const job = (patch: MessageInitShape<typeof InstallProgressSchema>) =>
  create(InstallProgressSchema, {
    id: 1n,
    source: 'C:\\x.zip',
    name: 'x',
    state: InstallState.UNPACKING,
    mode: InstallMode.AUTO,
    started: 100n,
    ...patch,
  });

const info = (patch: MessageInitShape<typeof SourceInfoSchema>) =>
  create(SourceInfoSchema, {
    isArchive: true,
    isZip: true,
    files: 10n,
    unpackedBytes: 1n,
    archiveBytes: 1n,
    neededBytes: 1n,
    freeBytes: 2n,
    fits: true,
    inPlaceOk: true,
    suggested: InstallMode.EXTRACT,
    ...patch,
  });

describe('mods logic', () => {
  it('measures progress by bytes, then files, and not at all before planning', () => {
    expect(
      jobProgress(job({ bytesDone: 25n, bytesTotal: 100n, filesDone: 9n, filesTotal: 10n })),
    ).toBe(0.25);
    expect(jobProgress(job({ filesDone: 3n, filesTotal: 4n }))).toBe(0.75);
    expect(jobProgress(job({ state: InstallState.PLANNING }))).toBeNull();
    expect(jobProgress(job({ state: InstallState.DONE }))).toBe(1);
    expect(jobProgress(job({ bytesDone: 130n, bytesTotal: 100n }))).toBe(1);
  });

  it('puts running jobs first (oldest first) and finished ones newest first', () => {
    const { running, finished } = splitJobs([
      job({ id: 1n, state: InstallState.DONE, finished: 10n }),
      job({ id: 2n, started: 300n }),
      job({ id: 3n, state: InstallState.FAILED, finished: 50n }),
      job({ id: 4n, started: 200n }),
    ]);
    expect(running.map((j) => j.id)).toEqual([4n, 2n]);
    expect(finished.map((j) => j.id)).toEqual([3n, 1n]);
  });

  it('gives each state a tone', () => {
    expect(stateTone(InstallState.COPYING)).toBe('busy');
    expect(stateTone(InstallState.DONE)).toBe('ok');
    expect(stateTone(InstallState.FAILED)).toBe('danger');
    expect(stateTone(InstallState.CANCELLED)).toBe('muted');
  });

  it('only allows a mode that can work', () => {
    const tooBig = info({ fits: false });
    expect(canInstall(tooBig, InstallMode.EXTRACT)).toBe(false);
    expect(canInstall(tooBig, InstallMode.IN_PLACE)).toBe(true);
    expect(canInstall(tooBig, InstallMode.AUTO)).toBe(true);
    const sevenZip = info({ isZip: false, inPlaceOk: false, fits: false });
    expect(canInstall(sevenZip, InstallMode.AUTO)).toBe(false);
    expect(canInstall(info({ inPlaceOk: false }), InstallMode.IN_PLACE)).toBe(false);
  });

  const mods = [
    create(InstalledModSchema, { name: 'MAN_NL202', installed: 1n }),
    create(InstalledModSchema, { name: 'Spandau', installed: 3n }),
    create(InstalledModSchema, { name: 'Neuhausen.zip', installed: 2n, inPlace: true }),
  ];

  it('moves an entry of the load order to any place', () => {
    expect(move(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(move(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(move(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
  });

  it('keeps an unsaved order in step with what the engine lists', () => {
    // the player moved c to the top; meanwhile b was uninstalled and n installed (at the top)
    expect(mergeDraft(['c', 'a', 'b'], ['n', 'a', 'c'])).toEqual(['n', 'c', 'a']);
  });

  it('recognises a renamed mod only when one entry looks like it', () => {
    const here = ['BVG_Signs_2023.zip', 'Other_Bus'];
    expect(renamedAs('BVG_Signs_2015', here)).toBe('BVG_Signs_2023.zip');
    expect(renamedAs('Unrelated', here)).toBeUndefined();
    expect(renamedAs('Bus_1', ['Bus_2', 'bus-3'])).toBeUndefined();
  });

  it('offers Uninstall only for mods of the mods folder', () => {
    const entry = (name: string, available = true) =>
      create(InstalledModSchema, { name, available });
    expect(removable(entry('Bus.zip'))).toBe(true);
    expect(removable(entry('Archives/Old.zip'))).toBe(false);
    expect(removable(entry('Gone', false))).toBe(false);
  });

  it('finds the installed mod a source would replace, folder or archive', () => {
    expect(installedAs(mods, 'C:\\Downloads\\neuhausen.7z')?.name).toBe('Neuhausen.zip');
    expect(installedAs(mods, '/home/me/MAN_NL202.zip')?.name).toBe('MAN_NL202');
    expect(installedAs(mods, '/home/me/Other.zip')).toBeUndefined();
  });

  it('queues each dropped path once', () => {
    expect(enqueue(['a.zip'], ['b.7z', 'a.zip', '', 'b.7z'])).toEqual(['a.zip', 'b.7z']);
  });
});

describe('reading what the engine sends', () => {
  it('does not treat an ended job without an end time as running', () => {
    expect(isRunning(job({ state: InstallState.FAILED }))).toBe(false);
    expect(isRunning(job({}))).toBe(true);
  });
});

describe('mock mods engine', () => {
  it('walks a started install through to done and lists the mod', async () => {
    const engine = new MockLauncher();
    const started = await engine.handle('startInstall', {
      path: 'C:\\Downloads\\Citaro_K.zip',
      mode: InstallMode.AUTO,
    });
    expect(started.state).toBe(InstallState.QUEUED);
    const seen = new Set<InstallState>();
    for (let i = 0; i < 12; i++) {
      engine.advanceJobs();
      const j = (await engine.handle('mods', {})).jobs.find((x) => x.id === started.id)!;
      seen.add(j.state);
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([InstallState.COPYING, InstallState.MOVING, InstallState.DONE]),
    );
    const mods = await engine.handle('mods', {});
    expect(mods.installed[0].name).toBe('Citaro_K');

    const again = await engine.handle('startInstall', { path: 'C:\\Citaro_K.zip' });
    engine.advanceJobs();
    const failed = (await engine.handle('mods', {})).jobs.find((x) => x.id === again.id)!;
    expect(failed.state).toBe(InstallState.FAILED);

    await engine.handle('uninstallMod', { name: 'Citaro_K' });
    expect((await engine.handle('mods', {})).installed.some((m) => m.name === 'Citaro_K')).toBe(
      false,
    );
  });

  it('keeps the player order and places new mods where the player wants them', async () => {
    const engine = new MockLauncher();
    const before = await engine.handle('mods', {});
    const order = before.installed.map((m) => m.name).reverse();
    expect(() =>
      engine.handle('saveModOrder', { order, revision: before.orderRevision + 1n, newMods: 'top' }),
    ).toThrow('changed elsewhere');
    const saved = await engine.handle('saveModOrder', {
      order,
      revision: before.orderRevision,
      newMods: 'bottom',
    });
    expect(saved.installed.map((m) => m.name)).toEqual(order);
    await engine.handle('startInstall', { path: 'C:\\New_Bus.zip', mode: InstallMode.EXTRACT });
    for (let i = 0; i < 12; i++) engine.advanceJobs();
    const after = (await engine.handle('mods', {})).installed.map((m) => m.name);
    // (the install that was already running finishes too: also at the bottom)
    expect(after.slice(0, order.length)).toEqual(order);
    expect(after.at(-1)).toBe('New_Bus');
  });
});
