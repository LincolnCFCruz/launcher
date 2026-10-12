import {
  InstallMode,
  InstallState,
  type InstallProgress,
  type InstalledMod,
  type SourceInfo,
} from '../../types/launcher';

const ENDED: readonly InstallState[] = [
  InstallState.DONE,
  InstallState.FAILED,
  InstallState.CANCELLED,
];

export const stateKey = (state: InstallState) => InstallState[state].toLowerCase();

const MODE_KEYS: Record<InstallMode, string> = {
  [InstallMode.UNSPECIFIED]: 'auto',
  [InstallMode.AUTO]: 'auto',
  [InstallMode.EXTRACT]: 'extract',
  [InstallMode.IN_PLACE]: 'inplace',
};

export const modeKey = (mode: InstallMode) => MODE_KEYS[mode];

export const isRunning = (job: InstallProgress) =>
  job.finished === undefined && !ENDED.includes(job.state);

export function jobProgress(job: InstallProgress): number | null {
  if (job.state === InstallState.DONE) return 1;
  const fraction =
    job.bytesTotal > 0n
      ? Number(job.bytesDone) / Number(job.bytesTotal)
      : job.filesTotal > 0n
        ? Number(job.filesDone) / Number(job.filesTotal)
        : null;
  return fraction === null ? null : Math.min(1, Math.max(0, fraction));
}

const order = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

export function splitJobs(jobs: InstallProgress[]) {
  const running = jobs
    .filter(isRunning)
    .sort((a, b) => order(a.started, b.started) || order(a.id, b.id));
  const finished = jobs
    .filter((j) => !isRunning(j))
    .sort((a, b) => order(b.finished ?? 0n, a.finished ?? 0n) || order(b.id, a.id));
  return { running, finished };
}

export type StateTone = 'busy' | 'ok' | 'danger' | 'muted';

export function stateTone(state: InstallState): StateTone {
  if (state === InstallState.DONE) return 'ok';
  if (state === InstallState.FAILED) return 'danger';
  if (state === InstallState.CANCELLED) return 'muted';
  return 'busy';
}

export function canInstall(info: SourceInfo, mode: InstallMode): boolean {
  if (!info.isArchive) return info.fits;
  if (mode === InstallMode.IN_PLACE) return info.inPlaceOk;
  if (mode === InstallMode.EXTRACT) return info.fits;
  return info.fits || info.inPlaceOk;
}

export const autoTakes = (info: SourceInfo) =>
  info.suggested === InstallMode.IN_PLACE ? InstallMode.IN_PLACE : InstallMode.EXTRACT;

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** The unsaved order without gone entries, with new ones where the engine lists them. */
export function mergeDraft(draft: readonly string[], listed: readonly string[]): string[] {
  const kept = draft.filter((n) => listed.includes(n));
  for (const [i, n] of listed.entries()) if (!kept.includes(n)) kept.splice(i, 0, n);
  return kept;
}

const looseName = (name: string) =>
  name
    .replace(/\.zip$/i, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** The one available entry named like `gone`, ignoring case, digits and punctuation. */
export function renamedAs(gone: string, available: readonly string[]): string | undefined {
  const key = looseName(gone);
  const like = available.filter((n) => n !== gone && key && looseName(n) === key);
  return like.length === 1 ? like[0] : undefined;
}

export const removable = (mod: InstalledMod) => mod.available && !mod.name.startsWith('Archives/');

export const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

const stem = (name: string) => name.replace(/\.(zip|7z|rar)$/i, '').toLowerCase();

export const installedAs = (mods: InstalledMod[], path: string) =>
  mods.find((m) => stem(m.name) === stem(fileName(path)));

export function enqueue(queue: string[], paths: string[]): string[] {
  const next = [...queue];
  for (const p of paths) if (p && !next.includes(p)) next.push(p);
  return next;
}
