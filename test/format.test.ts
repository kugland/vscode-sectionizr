import { describe, expect, it } from 'vitest';
import type { CommentFormat } from '../src/format';
import { buildTitle, center, render } from '../src/format';

describe('center', () => {
  it('matches CPython str.center padding bias', () => {
    // Verified against CPython: 'abc'.center(10, '.') etc.
    expect(center('abc', 10, '.')).toBe('...abc....');
    expect(center('abcd', 10, '.')).toBe('...abcd...');
    expect(center('abc', 11, '.')).toBe('....abc....');
    expect(center('abcd', 11, '.')).toBe('....abcd...');
  });

  it('produces a string of exactly the requested width', () => {
    for (let width = 0; width <= 40; width++) {
      for (const text of ['', 'a', 'ab', 'title', 'a longer title']) {
        const result = center(text, width, '#');
        expect(result.length).toBe(Math.max(width, text.length));
      }
    }
  });

  it('returns the text unchanged when it does not fit', () => {
    expect(center('a very long title', 5, '#')).toBe('a very long title');
    expect(center('exact', 5, '#')).toBe('exact');
  });

  it('pads an empty string to the full width', () => {
    expect(center('', 4, '#')).toBe('####');
  });
});

describe('buildTitle', () => {
  it('trims and joins lines with a single space', () => {
    expect(buildTitle(['  hello  ', ' world '])).toBe('hello world');
  });

  it('drops blank and whitespace-only lines', () => {
    expect(buildTitle(['first', '   ', '', 'second'])).toBe('first second');
  });

  it('returns an empty string when nothing has content', () => {
    expect(buildTitle(['', '  ', '\t'])).toBe('');
  });

  it('collapses a single line to its trimmed self', () => {
    expect(buildTitle(['\tMy Section  '])).toBe('My Section');
  });
});

const HASH: CommentFormat = { prefix: '#', fill: '#', suffix: '#' };
const SLASH: CommentFormat = { prefix: '//', fill: '/', suffix: '//' };
const BLOCK: CommentFormat = { prefix: '/*', fill: '*', suffix: '*/' };
const HTML: CommentFormat = { prefix: '<!--', fill: '-', suffix: '-->' };

const base = {
  format: HASH,
  width: 80,
  indentWidth: 0,
  uppercaseLevel0: true,
};

describe('render', () => {
  it('renders a level 0 banner as three lines ending one column short of the width', () => {
    const lines = render({ ...base, title: 'My Section', level: 0 });
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.length).toBe(79); // width 80, minus the inherited -1 offset
    }
    expect(lines[0]).toBe('#'.repeat(79));
    expect(lines[2]).toBe(lines[0]);
    expect(lines[1]).toContain('MY SECTION');
    expect(lines[1].startsWith('# ')).toBe(true);
    expect(lines[1].endsWith(' #')).toBe(true);
  });

  it('renders a level 1 banner as a single line padded with the fill character', () => {
    const lines = render({ ...base, title: 'My Section', level: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBe(79);
    expect(lines[0]).toContain('# My Section #');
    expect(lines[0]).not.toContain('MY SECTION');
  });

  it('uppercases level 0 only when enabled', () => {
    const on = render({ ...base, title: 'My Section', level: 0, uppercaseLevel0: true });
    const off = render({ ...base, title: 'My Section', level: 0, uppercaseLevel0: false });
    expect(on[1]).toContain('MY SECTION');
    expect(off[1]).toContain('My Section');
  });

  it('leaves level 1 titles verbatim regardless of the uppercase setting', () => {
    const lines = render({ ...base, title: 'My Section', level: 1, uppercaseLevel0: true });
    expect(lines[0]).toContain(' My Section ');
  });

  it('emits a single divider rule for an empty title at both levels', () => {
    expect(render({ ...base, title: '', level: 0 })).toEqual(['#'.repeat(79)]);
    expect(render({ ...base, title: '', level: 1 })).toEqual(['#'.repeat(79)]);
  });

  it('subtracts the indent width from the banner width', () => {
    const lines = render({ ...base, title: 'x', level: 1, indentWidth: 4 });
    expect(lines[0].length).toBe(75); // 79 - 4
  });

  it('accounts for multi-character prefixes and suffixes', () => {
    expect(render({ ...base, format: SLASH, title: 'x', level: 1 })[0].length).toBe(79);
    expect(render({ ...base, format: BLOCK, title: 'x', level: 1 })[0].length).toBe(79);
    expect(render({ ...base, format: HTML, title: 'x', level: 1 })[0].length).toBe(79);
    expect(render({ ...base, format: HTML, title: '', level: 0 })).toEqual([
      '<!--' + '-'.repeat(72) + '-->',
    ]);
  });

  it('lets an over-long title overflow rather than truncating it', () => {
    const title = 'x'.repeat(200);
    const lines = render({ ...base, title, level: 0, uppercaseLevel0: false });
    expect(lines[1]).toBe('#' + title + '#');
  });

  it('clamps the center width at zero for degenerate widths', () => {
    const lines = render({ ...base, title: '', level: 0, width: 1 });
    expect(lines).toEqual(['##']);
  });
});
