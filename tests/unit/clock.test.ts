import { describe, it, expect } from 'vitest';
import { eventToSourceMs } from '../../src/audio/clock';

describe('audio output clock', () => {
  it('maps key event time to original source time instead of the later render tick', () => {
    expect(eventToSourceMs(1300, { contextTime: 4, performanceTime: 1200 }, { offsetMs: 12000, contextStart: 3, rate: 1 })).toBeCloseTo(13100);
  });
  it('keeps original timestamps at half speed', () => {
    expect(eventToSourceMs(1500, { contextTime: 5, performanceTime: 1000 }, { offsetMs: 2000, contextStart: 3, rate: 0.5 })).toBe(3250);
  });
});
