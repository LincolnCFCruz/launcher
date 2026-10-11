import { describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { TourInfoSchema, TripInfoSchema } from '../types/launcher';
import { selectedTrip } from '../pages/drive/DrivePage';

const trip = (index: number, name: string) => create(TripInfoSchema, { index, name });

describe('roadbook trip selection', () => {
  it('uses the timetable trip ID instead of its position in the tour', () => {
    const first = trip(1, '07:22 depot journey');
    const second = trip(2, '07:30 service journey');
    const tour = create(TourInfoSchema, { trips: [first, second] });

    expect(selectedTrip(tour, '1')).toBe(first);
  });
});
