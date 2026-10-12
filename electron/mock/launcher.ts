import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  CancelledSchema,
  ConfigSchema,
  ControllerListSchema,
  DiagnosticClass,
  DiagnosticListSchema,
  EmptySchema,
  EngineVersionSchema,
  GameUpdateSchema,
  InstalledModSchema,
  InstallMode,
  InstallProgressSchema,
  InstallState,
  InstanceListSchema,
  InstanceSchema,
  JoinCheckSchema,
  KeyBindingsSchema,
  LanRole,
  LaunchedSchema,
  LineListSchema,
  LogLinesSchema,
  MapListSchema,
  ModConflictListSchema,
  ModsStatusSchema,
  NewMods,
  OptionPresetListSchema,
  PaxPackSchema,
  PaxState,
  ProfileNamesSchema,
  ServerInfoSchema,
  ServerListSchema,
  SettingsSchema,
  Severity,
  SituationListSchema,
  SourceInfoSchema,
  StoppedSchema,
  TutorialListSchema,
  UpdateCheckSchema,
  UpdateState,
  VehicleListSchema,
  WeatherListSchema,
  settingsForEngine,
  settingsFromEngine,
  type Command,
  type CommandArgs,
  type CommandResult,
  type Config,
  type Controller,
  type InstallProgress,
  type InstalledMod,
  type Instance,
  type JoinCheck,
  type KeyBindings,
  type PaxPack,
  type ServerInfo,
  type Settings,
  type SourceInfo,
} from '../../src/types/launcher';
import { mockBusModel } from './bus-model';
import {
  CONFIG,
  CONTROLLERS,
  KEYBINDINGS,
  MAPS,
  MODS,
  PROFILES,
  SERVERS,
  TUTORIALS,
  VEHICLES,
  WEATHER,
  defaultSettings,
  ibis,
  lines,
  minimap,
  profile,
} from './content';

const now = () => Math.floor(Date.now() / 1000);
const secs = () => BigInt(now());

const PAX_RELEASE = {
  version: 2n,
  notes:
    '- 40 new people, from school children to commuters with suitcases\n- Faster loading of the passenger models',
  page: 'https://github.com/neoOMSI/neoOMSI/releases/tag/realistic-pax-v2',
  published: '2026-10-01T12:00:00Z',
};

const GAME_RELEASE = {
  version: '0.3.0',
  page: 'https://github.com/neoOMSI/neoOMSI/releases/tag/v0.3.0',
  prerelease: false,
  size: 140_000_000n,
  notes: [
    '> **Early development build.** Expect bugs.',
    '',
    "## What's changed",
    '',
    '### Features',
    '',
    '- The launcher shows what a new version brings ([#120](https://github.com/neoOMSI/neoOMSI/pull/120))',
    '- Start times can be typed to the minute',
    '',
    '### Fixes',
    '',
    '- Tutorials are listed again (`menu_1_ENG.html`)',
    '',
    '## Downloads',
    '',
    '| Platform | Game |',
    '| --- | --- |',
  ].join('\n'),
};

function seedInstances(): Instance[] {
  const game = (pid: number, slot: number, patch: MessageInitShape<typeof InstanceSchema>) =>
    create(InstanceSchema, {
      id: `game-${pid}`,
      pid,
      processStarted: BigInt(now() - 2820),
      slot,
      log: `C:\\Users\\player\\.neoomsi\\game${slot ? `-${slot}` : ''}.log`,
      started: BigInt(now() - 2820),
      map: 'Westfeld 1989',
      bus: 'Vehicles/Sample/Double-decker 1979.bus',
      entry: 0,
      line: '92',
      tour: '3',
      profile: CONFIG.profile,
      lan: 'off',
      running: true,
      ...patch,
    });
  return [
    game(17840, 0, {
      lan: 'host',
      lastLine: 'Line 92 → Rathaus Westfeld, 1 min late, 23 passengers on board',
      lanStatus: {
        role: LanRole.HOST,
        name: CONFIG.profile,
        code: 'OMSI-7KQ2-M4XD-9PRT',
        tunnel: 'https://omsi-7kq2.trycloudflare.com',
        players: [
          {
            id: 1,
            name: CONFIG.profile,
            bus: 'Vehicles/Sample/Double-decker 1979.bus',
            line: '92',
            destination: 'Rathaus Westfeld',
            passengers: 23,
            drawn: true,
          },
          {
            id: 2,
            name: 'Robin',
            bus: 'Vehicles/Sample/Double-decker 1985.bus',
            line: '137',
            destination: 'Stift',
            passengers: 11,
            location: '1.2 km ahead',
            drawn: true,
          },
          {
            id: 3,
            name: 'night_driver',
            bus: 'Vehicles/Sample/Standard bus.bus',
            passengers: 0,
            location: '3.4 km behind',
            drawn: false,
          },
        ],
        chat: [
          'Robin: Bin in 5 Minuten am Rathaus',
          'night_driver: kurz Pause, Kaffee',
          `${CONFIG.profile}: Alles klar, ich warte an der Wendeschleife`,
        ],
        warnings: [
          'night_driver is missing the map "Westfeld 1989" v1.3 and sees an older version',
        ],
        connected: true,
        hostName: CONFIG.profile,
        map: 'maps/Westfeld/global.cfg',
      },
    }),
    game(17112, 1, {
      started: BigInt(now() - 5400),
      processStarted: BigInt(now() - 5400),
      map: 'Grundorf',
      bus: 'Vehicles/Sample/Low-floor bus.bus',
      line: '24',
      tour: '2',
      running: false,
      ended: BigInt(now() - 540),
      exitCode: -1073741819,
      lastLine: 'ERROR access violation in Sceneryobjects/Ampel/ampel.sco script, line 212',
    }),
    game(16950, 2, {
      started: BigInt(now() - 7800),
      processStarted: BigInt(now() - 7800),
      map: 'Neuhausen',
      bus: 'Vehicles/CityBus2000/CityBus2000.bus',
      line: undefined,
      tour: undefined,
      running: false,
      ended: BigInt(now() - 1320),
      killed: true,
      stopping: BigInt(now() - 1328),
      lastLine: 'Saving the personnel file…',
    }),
  ];
}

type Handlers = {
  [C in Command]: (args: CommandArgs<C>) => CommandResult<C> | Promise<CommandResult<C>>;
};

export class MockLauncher {
  private settings: Settings = defaultSettings();
  private config: Config = create(ConfigSchema, CONFIG);
  private profiles = [...PROFILES];
  private keys: KeyBindings = structuredClone(KEYBINDINGS);
  private controllers: Controller[] = structuredClone(CONTROLLERS);
  private servers: ServerInfo[] = [...SERVERS];
  private instances: Instance[] = seedInstances();
  private jobs: InstallProgress[] = structuredClone(MODS.jobs);
  private installedMods: InstalledMod[] = structuredClone(MODS.installed);
  private jobTicks = new Map<bigint, number>(
    MODS.jobs.filter((j) => j.finished === undefined).map((j) => [j.id, 4]),
  );
  private nextPid = 18200;
  private paxPack: PaxPack = create(PaxPackSchema, {
    state: PaxState.MISSING,
    latest: PAX_RELEASE,
  });

  handle<C extends Command>(
    command: C,
    args: unknown,
  ): CommandResult<C> | Promise<CommandResult<C>> {
    return this.handlers[command]((args ?? {}) as CommandArgs<C>);
  }

  private readonly handlers: Handlers = {
    config: () => this.config,
    saveConfig: (changes) => {
      this.config = create(ConfigSchema, {
        root: changes.root ?? this.config.root,
        game: changes.game ?? this.config.game,
        profile: changes.profile ?? this.config.profile,
      });
      return this.config;
    },
    maps: () => create(MapListSchema, { maps: MAPS }),
    vehicles: () => create(VehicleListSchema, { vehicles: VEHICLES }),
    weather: () => create(WeatherListSchema, { weather: WEATHER }),
    lines: ({ map, date }) => create(LineListSchema, { lines: lines(map ?? '', date ?? '') }),
    minimap: ({ map }) => minimap(map ?? ''),
    ibis: ({ line, hof }) => ibis(line ?? '', hof ?? ''),
    profiles: () => create(ProfileNamesSchema, { names: this.profiles }),
    profile: ({ name }) => profile(name ?? ''),
    createProfile: (args) => {
      const name = (args.name ?? '').trim();
      if (!name) throw new Error('A driver needs a name');
      if (this.profiles.includes(name)) throw new Error(`${name} already exists`);
      this.profiles.push(name);
      this.config = create(ConfigSchema, { ...this.config, profile: name });
      return { ...profile(name), name, exists: true };
    },
    deleteProfile: ({ name }) => {
      this.profiles = this.profiles.filter((p) => p !== name);
      if (this.config.profile === name) {
        this.config = create(ConfigSchema, { ...this.config, profile: this.profiles[0] ?? '' });
      }
      return create(EmptySchema);
    },
    mods: () => this.modsStatus(),
    saveModOrder: ({ order, revision, newMods }) => {
      this.checkRevision(revision);
      const listed = (order ?? []).flatMap(
        (name) => this.installedMods.find((entry) => entry.name === name) ?? [],
      );
      this.installedMods = [
        ...listed,
        ...this.installedMods.filter((entry) => !listed.includes(entry)),
      ];
      this.newMods = newMods === NewMods.BOTTOM ? NewMods.BOTTOM : NewMods.TOP;
      this.orderRevision += 1n;
      return this.modsStatus();
    },
    resetModOrder: ({ revision }) => {
      this.checkRevision(revision);
      this.installedMods = this.installedMods
        .filter((entry) => entry.available)
        .sort((left, right) => left.name.localeCompare(right.name));
      this.orderRevision += 1n;
      return this.modsStatus();
    },
    forgetMod: ({ name }) => {
      this.installedMods = this.installedMods.filter((entry) => entry.name !== name);
      this.orderRevision += 1n;
      return this.modsStatus();
    },
    modConflicts: () => {
      const available = this.installedMods.filter((entry) => entry.available);
      const [first, second] = available.map((entry) => entry.name);
      return create(ModConflictListSchema, {
        mods: available
          .map((entry, index) => ({
            name: entry.name,
            files: 120,
            overrides: index === 0 ? 14 : 0,
            overridden: index === 1 ? 14 : 0,
            hiddenBy: index === 1 ? [first] : [],
            overridesMods: index === 0 && second ? [second] : [],
          }))
          .concat({
            name: 'shared',
            files: 8,
            overrides: 0,
            overridden: 2,
            hiddenBy: first ? [first] : [],
            overridesMods: [],
          }),
      });
    },
    modinfo: ({ path }) => modInfo(path ?? ''),
    startInstall: ({ path, mode, replace }) =>
      this.install(path ?? '', mode ?? InstallMode.AUTO, replace ?? false),
    cancelInstall: ({ id }) => {
      const job = this.jobs.find((j) => j.id === id);
      if (!job || job.finished !== undefined) return create(CancelledSchema);
      job.state = InstallState.CANCELLED;
      job.message = 'cancelled - nothing was installed, the unpacked files were removed';
      job.finished = secs();
      return create(CancelledSchema, { cancelled: true });
    },
    clearInstalls: () => {
      this.jobs = this.jobs.filter((j) => j.finished === undefined);
      return create(EmptySchema);
    },
    uninstallMod: ({ name }) => {
      if (!this.installedMods.some((entry) => entry.name === name)) {
        throw new Error(`'${name}' is not an installed mod`);
      }
      this.installedMods = this.installedMods.filter((entry) => entry.name !== name);
      return create(EmptySchema);
    },
    allowModPlugins: ({ name, allowed }) => {
      const mod = this.installedMods.find((m) => m.name === name);
      if (!mod) throw new Error(`'${name}' is not an installed mod`);
      mod.pluginsAllowed = mod.hasPlugins && (allowed ?? false);
      return create(EmptySchema);
    },
    instances: () => create(InstanceListSchema, { instances: this.instances }),
    launch: (duty) => this.launch(duty),
    stop: ({ pid }) => this.stop(pid ?? 0),
    log: ({ pid, lines }) => create(LogLinesSchema, { lines: this.log(pid ?? 0, lines) }),
    join: ({ text }) => this.join(text ?? ''),
    settings: () => settingsForEngine(this.settings),
    saveSettings: (changes) => {
      this.settings = {
        ...this.settings,
        ...settingsFromEngine(create(SettingsSchema, changes)),
      };
      if (this.settings.pax_models === 'realistic' && this.paxPack.installed === undefined) {
        this.paxPack = create(PaxPackSchema, {
          ...this.paxPack,
          state: PaxState.OUTDATED,
          installed: 1n,
        });
      }
      return settingsForEngine(this.settings);
    },
    paxPack: () => this.paxPack,
    installPaxPack: () => {
      this.paxPack = create(PaxPackSchema, {
        ...this.paxPack,
        state: PaxState.INSTALLED,
        installed: PAX_RELEASE.version,
      });
      return this.paxPack;
    },
    updateCheck: () => create(UpdateCheckSchema, { release: GAME_RELEASE }),
    installUpdate: () =>
      create(GameUpdateSchema, {
        state: UpdateState.FAILED,
        message: 'The mock engine does not install updates.',
      }),
    optionPresets: () => create(OptionPresetListSchema),
    keybindings: () => this.keys,
    saveKeybindings: (keys) => {
      this.keys = create(KeyBindingsSchema, keys);
      return this.keys;
    },
    controllers: () => create(ControllerListSchema, { controllers: this.controllers }),
    saveControllers: ({ controllers }) => {
      this.controllers = create(ControllerListSchema, { controllers }).controllers;
      return create(ControllerListSchema, { controllers: this.controllers });
    },
    preview: ({ paint }) => mockBusModel(paint ?? ''),
    mapPicture: () => new Uint8Array(),
    preflight: ({ map }) =>
      create(DiagnosticListSchema, {
        findings: map === 'maps/Westfeld/global.cfg' ? this.findings() : [],
      }),
    dismissDiagnostic: ({ key }) => {
      this.dismissed.add(key ?? '');
      return create(EmptySchema);
    },
    diagnostics: () => create(DiagnosticListSchema, { findings: this.findings() }),
    situations: ({ map }) =>
      create(SituationListSchema, {
        situations:
          map === 'maps/Westfeld/global.cfg'
            ? [{ name: 'Line 92, tour 2', file: 'laststn.osn', time: BigInt(now() - 7200) }]
            : [],
      }),
    tutorials: () => create(TutorialListSchema, { tutorials: TUTORIALS }),
    servers: () => create(ServerListSchema, { servers: this.servers }),
    saveServers: ({ servers }) => {
      this.servers = [
        ...this.servers.filter((s) => s.official),
        ...(servers ?? []).map(
          (s) =>
            this.servers.find((o) => o.address === s.address) ??
            create(ServerInfoSchema, {
              name: s.name,
              address: s.address,
              error: 'Not reachable',
            }),
        ),
      ];
      return create(EmptySchema);
    },
    version: () => create(EngineVersionSchema, { version: '0.2.0-mock', protocol: 2 }),
  };

  private launch(duty: CommandArgs<'launch'>) {
    const map = duty.map ?? '';
    const bus = duty.bus ?? '';
    if (!duty.tutorial && (!map || !bus)) {
      throw new Error('Choose a bus and a map first.');
    }
    const pid = this.nextPid++;
    const lan = duty.lan ?? 'off';
    const game = create(InstanceSchema, {
      id: `game-${pid}`,
      pid,
      processStarted: secs(),
      slot: this.instances.length,
      log: `C:\\Users\\player\\.neoomsi\\game${this.instances.length ? `-${this.instances.length}` : ''}.log`,
      started: secs(),
      map: MAPS.find((m) => m.file === map)?.friendly ?? map,
      bus: VEHICLES.find((v) => v.file === bus)?.name ?? bus,
      entry: duty.entry,
      line: duty.line,
      tour: duty.tour,
      profile: duty.profile ?? CONFIG.profile,
      lan,
      args: ['--map', map, '--bus', bus, '--time', duty.time ?? ''],
      running: true,
      lanStatus:
        lan === 'host'
          ? {
              role: LanRole.HOST,
              name: CONFIG.profile,
              code: 'OMSI-7KQ2-M4XD-9PRT',
              players: [
                {
                  id: 1,
                  name: CONFIG.profile,
                  bus,
                  line: duty.line ?? '',
                  passengers: 0,
                  drawn: true,
                },
              ],
              connected: true,
              hostName: CONFIG.profile,
              map,
            }
          : undefined,
      lastLine: 'Loading map tiles 12 / 94',
    });
    this.instances.push(game);
    return create(LaunchedSchema, {
      pid,
      log: game.log,
      command: 'neoomsi.exe',
      others: this.instances.filter((i) => i.running).length - 1,
    });
  }

  private stop(pid: number) {
    const instance = this.instances.find((i) => i.pid === pid);
    if (!instance) throw new Error(`No game with process ${pid}`);
    instance.running = false;
    instance.ended = secs();
    instance.exitCode = 0;
    instance.lanStatus = undefined;
    instance.lastLine = 'Session saved, goodbye.';
    return create(StoppedSchema, { endedByItself: true });
  }

  private log(pid: number, lines = 200) {
    const instance = this.instances.find((i) => i.pid === pid);
    if (!instance) return [];
    const started = Number(instance.started);
    const until = Number(instance.ended ?? secs());
    const ticks = Math.min(400, Math.floor((until - started) / 3));
    const events = [
      'INFO  stop "Rathaus Westfeld": 14 in, 9 out',
      'INFO  ticket sold: single fare 2.70',
      'INFO  timetable: 1 min 20 s late at "Altstadtring"',
      'WARN  spline 1184 has no neighbour at its end, AI traffic turns back',
      'INFO  autosave written',
      'INFO  passenger complaint: harsh braking',
    ];
    return [
      `INFO  neoOMSI 0.2.0 starting, process ${pid}`,
      `INFO  map ${instance.map}`,
      `INFO  bus ${instance.bus}`,
      'INFO  graphics: Vulkan, discrete GPU',
      'WARN  texture "Sceneryobjects/Bushaltestelle/hst.dds" missing, using a placeholder',
      'INFO  timetable: 3 lines, 9 tours',
      ...Array.from({ length: ticks }, (_, k) => {
        const at = new Date((started + k * 3) * 1000).toTimeString().slice(0, 8);
        return `${at} ${events[(k * 7 + pid) % events.length]}`;
      }),
      ...(instance.exitCode
        ? ['ERROR access violation in Sceneryobjects/Ampel/ampel.sco script, line 212']
        : []),
      instance.lastLine,
    ].slice(-lines);
  }

  private join(text: string): JoinCheck {
    const value = text.trim();
    if (/^OMSI(-[A-Z0-9]{4}){2,}$/.test(value.toUpperCase())) {
      return {
        ...create(JoinCheckSchema, { ok: true, text: 'The host drives on Westfeld 1989' }),
        map: 'maps/Westfeld/global.cfg',
      };
    }
    const address = value.match(
      /^(\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::(\d+))?$/i,
    );
    if (address) {
      return create(JoinCheckSchema, {
        ok: true,
        text: `Joins ${address[1]} on port ${address[2] ?? '7777'}`,
      });
    }
    return create(JoinCheckSchema, {
      ok: false,
      text: 'This is neither a session code nor an address',
    });
  }

  private replacing = new Set<bigint>();
  private orderRevision = 0n;
  private dismissed = new Set<string>();
  private newMods = NewMods.TOP;

  private findings() {
    return [
      {
        class: DiagnosticClass.MISSING_DEPENDENCY,
        requester: 'Westfeld_1989',
        pack: 'Sceneryobjects/Westfeld_Haltestellen',
        severity: Severity.REQUIRED,
        count: 12,
        samples: ['Sceneryobjects/Westfeld_Haltestellen/hst.sco'],
        key: 'westfeld-hst',
      },
    ].filter((finding) => !this.dismissed.has(finding.key));
  }

  private modsStatus() {
    return create(ModsStatusSchema, {
      ...MODS,
      jobs: this.jobs,
      installed: this.installedMods,
      inboxItems: this.installedMods.filter((entry) => entry.available).map((entry) => entry.name),
      orderRevision: this.orderRevision,
      newMods: this.newMods,
    });
  }

  private checkRevision(revision: bigint | undefined) {
    if ((revision ?? 0n) !== this.orderRevision) {
      throw new Error('the load order was changed elsewhere - it was read again');
    }
  }

  private install(path: string, mode: InstallMode, replace: boolean): InstallProgress {
    const job = create(InstallProgressSchema, {
      id: this.jobs.reduce((max, j) => (j.id > max ? j.id : max), 0n) + 1n,
      source: path,
      name: (path.split(/[\\/]/).pop() ?? path).replace(/\.(zip|7z|rar)$/i, ''),
      state: InstallState.QUEUED,
      mode: mode === InstallMode.UNSPECIFIED ? InstallMode.AUTO : mode,
      freeBytes: MODS.freeBytes,
      message: 'waiting for the install before it',
      started: secs(),
    });
    this.jobs.unshift(job);
    this.jobTicks.set(job.id, 0);
    if (replace) this.replacing.add(job.id);
    return job;
  }

  get installing() {
    return this.jobs.some((j) => j.finished === undefined);
  }

  get installs() {
    return this.jobs;
  }

  get games() {
    return this.instances;
  }

  /** Moves every running install on by one step; true when one of them finished. */
  advanceJobs() {
    let finished = false;
    for (const job of this.jobs) {
      if (job.finished !== undefined) continue;
      const tick = (this.jobTicks.get(job.id) ?? 0) + 1;
      this.jobTicks.set(job.id, tick);
      this.stepJob(job, tick);
      finished ||= job.finished !== undefined;
    }
    return finished;
  }

  private stepJob(job: InstallProgress, tick: number) {
    const copySteps = 6;
    const bytes = Number(job.bytesTotal) || mockSize(job.name);
    const files = Number(job.filesTotal) || Math.max(12, Math.round(bytes / 2_600_000));
    const inPlace = job.mode === InstallMode.IN_PLACE;
    const entry = inPlace ? `${job.name}.zip` : job.name;
    const stem = (name: string) => name.replace(/\.zip$/i, '').toLowerCase();
    const existing = this.installedMods.filter(
      (installed) => stem(installed.name) === job.name.toLowerCase(),
    );
    if (tick === 1 && existing.length > 0 && !this.replacing.has(job.id)) {
      job.state = InstallState.FAILED;
      job.message = `mod '${job.name}' is already installed - install it with Replace to update it`;
      job.report = [`failed: ${job.message}`];
      job.finished = secs();
    } else if (tick < 1 + copySteps) {
      const done = tick / copySteps;
      job.state = InstallState.COPYING;
      job.message = `installing ${job.name} into the mods folder`;
      job.filesTotal = BigInt(files);
      job.bytesTotal = BigInt(bytes);
      job.filesDone = BigInt(Math.round(files * done));
      job.bytesDone = BigInt(Math.round(bytes * done));
    } else if (tick === 1 + copySteps) {
      job.state = InstallState.MOVING;
      job.message = 'moving it into place';
      job.filesDone = BigInt(files);
      job.bytesDone = BigInt(bytes);
    } else {
      job.state = InstallState.DONE;
      job.message = `installed as mods/${entry}`;
      job.report = [job.message];
      job.installed = [`mods/${entry}`];
      job.finished = secs();
      const installed = create(InstalledModSchema, {
        name: entry,
        available: true,
        installed: BigInt(now()),
        size: inPlace ? BigInt(bytes) : 0n,
        inPlace,
      });
      // An update keeps its place; a new mod goes where the player wants new mods.
      const slot = this.installedMods.findIndex((other) => existing.includes(other));
      const rest = this.installedMods.filter((other) => !existing.includes(other));
      if (slot >= 0) rest.splice(slot, 0, installed);
      else if (this.newMods === NewMods.BOTTOM) rest.push(installed);
      else rest.unshift(installed);
      this.installedMods = rest;
    }
  }
}

function mockSize(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 60_000_000 + (hash % 2_100) * 1_000_000;
}

function modInfo(path: string): SourceInfo {
  const ext = path.match(/\.(zip|7z|rar)$/i)?.[1].toLowerCase();
  if (!ext) {
    return create(SourceInfoSchema, {
      freeBytes: MODS.freeBytes,
      fits: true,
      inPlace: 'only a .zip archive can be used in place',
      suggested: InstallMode.EXTRACT,
    });
  }
  const name = (path.split(/[\\/]/).pop() ?? path).replace(/\.(zip|7z|rar)$/i, '');
  const unpacked = /komplett|complete|xxl/i.test(name) ? 260_000_000_000 : mockSize(name);
  const needed = unpacked + 512 * 1024 * 1024;
  const fits = BigInt(needed) <= MODS.freeBytes;
  const zip = ext === 'zip';
  return create(SourceInfoSchema, {
    isArchive: true,
    isZip: zip,
    files: BigInt(Math.max(12, Math.round(unpacked / 2_600_000))),
    unpackedBytes: BigInt(unpacked),
    archiveBytes: BigInt(Math.round(unpacked * 0.58)),
    neededBytes: BigInt(needed),
    freeBytes: MODS.freeBytes,
    fits,
    inPlace: zip ? '' : '7z and RAR archives must be unpacked',
    inPlaceOk: zip,
    suggested: !fits && zip ? InstallMode.IN_PLACE : InstallMode.EXTRACT,
  });
}
