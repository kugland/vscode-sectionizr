import { describe, expect, it } from 'vitest';
import {
  assembleSection,
  expandTabs,
  leadingWhitespace,
  mergeRanges,
} from '../src/layout';

describe('expandTabs', () => {
  it('counts spaces one column each', () => {
    expect(expandTabs('    ', 4)).toBe(4);
    expect(expandTabs('', 4)).toBe(0);
  });

  it('advances a tab to the next multiple of the tab size', () => {
    expect(expandTabs('\t', 4)).toBe(4);
    expect(expandTabs('\t\t', 4)).toBe(8);
    expect(expandTabs(' \t', 4)).toBe(4);
    expect(expandTabs('   \t', 4)).toBe(4);
    expect(expandTabs('    \t', 4)).toBe(8);
  });

  it('honours a non-default tab size', () => {
    expect(expandTabs('\t', 8)).toBe(8);
    expect(expandTabs('  \t', 8)).toBe(8);
  });

  it('treats a non-positive tab size as 1', () => {
    expect(expandTabs('\t', 0)).toBe(1);
  });
});

describe('leadingWhitespace', () => {
  it('returns the indent verbatim, preserving tabs', () => {
    expect(leadingWhitespace('    hello')).toBe('    ');
    expect(leadingWhitespace('\t\thello')).toBe('\t\t');
    expect(leadingWhitespace(' \thello')).toBe(' \t');
    expect(leadingWhitespace('hello')).toBe('');
  });

  it('returns the whole string when the line is only whitespace', () => {
    expect(leadingWhitespace('   ')).toBe('   ');
    expect(leadingWhitespace('')).toBe('');
  });
});

describe('mergeRanges', () => {
  it('sorts ranges by start line', () => {
    expect(mergeRanges([{ start: 5, end: 5 }, { start: 1, end: 1 }])).toEqual([
      { start: 1, end: 1 },
      { start: 5, end: 5 },
    ]);
  });

  it('merges two cursors on the same line', () => {
    expect(mergeRanges([{ start: 3, end: 3 }, { start: 3, end: 3 }])).toEqual([
      { start: 3, end: 3 },
    ]);
  });

  it('merges overlapping ranges', () => {
    expect(mergeRanges([{ start: 1, end: 4 }, { start: 3, end: 6 }])).toEqual([
      { start: 1, end: 6 },
    ]);
  });

  it('keeps adjacent but non-overlapping ranges separate', () => {
    expect(mergeRanges([{ start: 1, end: 2 }, { start: 3, end: 4 }])).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it('absorbs a range fully contained in another', () => {
    expect(mergeRanges([{ start: 1, end: 10 }, { start: 4, end: 5 }])).toEqual([
      { start: 1, end: 10 },
    ]);
  });

  it('returns an empty array unchanged', () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

describe('assembleSection', () => {
  it('indents every line and pads with blank lines', () => {
    expect(assembleSection(['aaa', 'bbb'], '  ', true)).toEqual([
      '', '  aaa', '  bbb', '',
    ]);
  });

  it('omits the blank lines when disabled', () => {
    expect(assembleSection(['aaa'], '  ', false)).toEqual(['  aaa']);
  });

  it('leaves the padding lines empty rather than indenting them', () => {
    const result = assembleSection(['aaa'], '\t\t', true);
    expect(result[0]).toBe('');
    expect(result[result.length - 1]).toBe('');
    expect(result[1]).toBe('\t\taaa');
  });

  it('handles an empty indent', () => {
    expect(assembleSection(['aaa'], '', false)).toEqual(['aaa']);
  });
});
