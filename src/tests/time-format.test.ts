import { describe, expect, it } from 'vitest';
import { format24HourTime, is24HourTime } from '../pages/drive/TimeStep';

describe('24-hour drive time', () => {
  it('accepts only zero-padded 24-hour times', () => {
    expect(is24HourTime('00:00')).toBe(true);
    expect(is24HourTime('13:45')).toBe(true);
    expect(is24HourTime('23:59')).toBe(true);
    expect(is24HourTime('12:30 PM')).toBe(false);
    expect(is24HourTime('24:00')).toBe(false);
    expect(is24HourTime('9:00')).toBe(false);
  });

  it('adds the separator to four digit times', () => {
    expect(format24HourTime('2000')).toBe('20:00');
    expect(format24HourTime('0830')).toBe('08:30');
    expect(format24HourTime('20:')).toBe('20:');
  });
});
