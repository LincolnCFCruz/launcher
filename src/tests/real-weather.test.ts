import { describe, expect, it } from 'vitest';
import { resolvedMetarStation, toDuty, type Choice } from '../lib/duty';
import type { MetarStation } from '../types/launcher';

const choice = (patch: Partial<Choice> = {}): Choice => ({
  bus: 'bus',
  paint: '',
  hof: '',
  number: '',
  plate: '',
  map: 'map',
  free: true,
  entry: -1,
  stop: null,
  line: '',
  tour: '',
  trip: '',
  time: '09:00',
  date: '1989-05-30',
  season: 'auto',
  traffic: 30,
  passengers: true,
  schedule: true,
  autostart: false,
  onFoot: false,
  lan: 'off',
  weather: 'metar',
  metar: 'EGNX',
  metarRefresh: false,
  custom: {
    visibility: 20000,
    brightness: 100,
    windDirection: 270,
    windSpeed: 4,
    temperature: 15,
    humidity: 50,
    clouds: 'none',
    precipitation: 0,
    intensity: 0,
    wetness: 0,
    snowCover: false,
    snowOnRoad: false,
  },
  ...patch,
});

const station = (icao: string): MetarStation => ({ icao, name: 'Airport' }) as MetarStation;

describe('real weather', () => {
  it('does not reuse a previous airport result for a new ICAO', () => {
    expect(resolvedMetarStation(choice(), station('EGLL'))).toBeUndefined();
    expect(resolvedMetarStation(choice(), station('EGNX'))).toEqual(station('EGNX'));
  });

  it('does not send unresolved ICAOs to the game', () => {
    expect(toDuty(choice(), 'default', null).weather).toBe('');
    expect(toDuty(choice(), 'default', null, station('EGNX')).weather).toBe('metar-once:EGNX');
  });
});
