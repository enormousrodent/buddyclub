import { describe, expect, it } from 'vitest';
import { kingOfTheCourt } from './king-of-the-court';

/** King of the court movement (Addendum 1.2 step 4). */
describe('kingOfTheCourt', () => {
  const doubles = (
    courts: string[],
    previous: { courtId: string; teams: string[][]; winnerSide: 1 | 2 | null }[],
    available: string[],
  ) => kingOfTheCourt({ courts, previous, available, teamSize: 2 });

  it('winners move up, losers move down, top winners stay, bottom losers rest when someone waits', () => {
    const result = doubles(
      ['c1', 'c2', 'c3'],
      [
        {
          courtId: 'c1',
          teams: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          winnerSide: 1,
        },
        {
          courtId: 'c2',
          teams: [
            ['e', 'f'],
            ['g', 'h'],
          ],
          winnerSide: 2,
        },
        {
          courtId: 'c3',
          teams: [
            ['i', 'j'],
            ['k', 'l'],
          ],
          winnerSide: 1,
        },
      ],
      ['m', 'n', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
    );
    expect(result.assignments).toEqual([
      {
        courtId: 'c1',
        teams: [
          ['a', 'b'],
          ['g', 'h'],
        ],
      },
      {
        courtId: 'c2',
        teams: [
          ['c', 'd'],
          ['i', 'j'],
        ],
      },
      {
        courtId: 'c3',
        teams: [
          ['e', 'f'],
          ['m', 'n'],
        ],
      },
    ]);
    expect(result.rests).toEqual(['k', 'l']);
    expect(result.warnings).toEqual([]);
  });

  it('keeps the bottom losers on when nobody is waiting', () => {
    const result = doubles(
      ['c1', 'c2'],
      [
        {
          courtId: 'c1',
          teams: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          winnerSide: 2,
        },
        {
          courtId: 'c2',
          teams: [
            ['e', 'f'],
            ['g', 'h'],
          ],
          winnerSide: 1,
        },
      ],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    );
    expect(result.assignments).toEqual([
      {
        courtId: 'c1',
        teams: [
          ['c', 'd'],
          ['e', 'f'],
        ],
      },
      {
        courtId: 'c2',
        teams: [
          ['a', 'b'],
          ['g', 'h'],
        ],
      },
    ]);
    expect(result.rests).toEqual([]);
  });

  it('counts side 1 as winners with a warning when no result was recorded', () => {
    const result = doubles(
      ['c1'],
      [
        {
          courtId: 'c1',
          teams: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          winnerSide: null,
        },
      ],
      ['e', 'f', 'a', 'b', 'c', 'd'],
    );
    expect(result.assignments).toEqual([
      {
        courtId: 'c1',
        teams: [
          ['a', 'b'],
          ['e', 'f'],
        ],
      },
    ]);
    expect(result.rests).toEqual(['c', 'd']);
    expect(result.warnings.map((w) => w.code)).toEqual(['RESULT_MISSING']);
  });

  it('fills a gap left by a player who went home from the waiting list', () => {
    const result = doubles(
      ['c1', 'c2'],
      [
        {
          courtId: 'c1',
          teams: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          winnerSide: 1,
        },
        {
          courtId: 'c2',
          teams: [
            ['e', 'f'],
            ['g', 'h'],
          ],
          winnerSide: 1,
        },
      ],
      // c went home; x is waiting.
      ['x', 'a', 'b', 'd', 'e', 'f', 'g', 'h'],
    );
    expect(result.assignments).toEqual([
      {
        courtId: 'c1',
        teams: [
          ['a', 'b'],
          ['e', 'f'],
        ],
      },
      {
        courtId: 'c2',
        teams: [
          ['d', 'x'],
          ['g', 'h'],
        ],
      },
    ]);
    expect(result.rests).toEqual([]);
  });

  it('drops a court it cannot fill and rests those players', () => {
    const result = doubles(
      ['c1', 'c2'],
      [
        {
          courtId: 'c1',
          teams: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          winnerSide: 1,
        },
        {
          courtId: 'c2',
          teams: [
            ['e', 'f'],
            ['g', 'h'],
          ],
          winnerSide: 1,
        },
      ],
      ['a', 'b', 'c', 'd', 'e', 'f'],
    );
    expect(result.assignments).toEqual([
      {
        courtId: 'c1',
        teams: [
          ['a', 'b'],
          ['e', 'f'],
        ],
      },
    ]);
    expect(result.rests).toEqual(['c', 'd']);
    expect(result.warnings.map((w) => w.code)).toEqual(['COURT_LEFT_IDLE']);
  });

  it('works for singles', () => {
    const result = kingOfTheCourt({
      courts: ['c1', 'c2'],
      previous: [
        { courtId: 'c1', teams: [['a'], ['b']], winnerSide: 2 },
        { courtId: 'c2', teams: [['c'], ['d']], winnerSide: 1 },
      ],
      available: ['e', 'a', 'b', 'c', 'd'],
      teamSize: 1,
    });
    expect(result.assignments).toEqual([
      { courtId: 'c1', teams: [['b'], ['c']] },
      { courtId: 'c2', teams: [['a'], ['e']] },
    ]);
    expect(result.rests).toEqual(['d']);
  });
});
