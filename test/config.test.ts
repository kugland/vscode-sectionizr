import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMATS, DEFAULT_WIDTH, isValidFormat, resolveFormat, resolveWidth } from '../src/config';

describe('DEFAULT_FORMATS', () => {
  it('covers the language families from the original plugin', () => {
    expect(DEFAULT_FORMATS.python).toEqual({ prefix: '#', fill: '#', suffix: '#' });
    expect(DEFAULT_FORMATS.typescript).toEqual({ prefix: '//', fill: '/', suffix: '//' });
    expect(DEFAULT_FORMATS.css).toEqual({ prefix: '/*', fill: '*', suffix: '*/' });
    expect(DEFAULT_FORMATS.sql).toEqual({ prefix: '--', fill: '-', suffix: '--' });
    expect(DEFAULT_FORMATS.latex).toEqual({ prefix: '%', fill: '%', suffix: '%' });
    expect(DEFAULT_FORMATS.markdown).toEqual({ prefix: '<!--', fill: '-', suffix: '-->' });
  });

  it('keeps the original split of c (block) versus cpp (line) comments', () => {
    expect(DEFAULT_FORMATS.c.prefix).toBe('/*');
    expect(DEFAULT_FORMATS.cpp.prefix).toBe('//');
  });

  it('uses a single-character fill everywhere, as the padding math requires', () => {
    for (const [languageId, format] of Object.entries(DEFAULT_FORMATS)) {
      expect(format.fill, languageId).toHaveLength(1);
    }
  });
});

describe('resolveFormat', () => {
  it('returns the built-in format when there is no override', () => {
    expect(resolveFormat('python', {})).toEqual(DEFAULT_FORMATS.python);
  });

  it('returns undefined for an unknown language', () => {
    expect(resolveFormat('brainfuck', {})).toBeUndefined();
  });

  it('lets a user override replace a built-in', () => {
    const override = { prefix: ';;', fill: ';', suffix: ';;' };
    expect(resolveFormat('python', { python: override })).toEqual(override);
  });

  it('lets a user override add a new language', () => {
    const override = { prefix: ';', fill: ';', suffix: ';' };
    expect(resolveFormat('clojure', { clojure: override })).toEqual(override);
  });

  it('leaves other languages untouched when one is overridden', () => {
    const formats = { python: { prefix: ';;', fill: ';', suffix: ';;' } };
    expect(resolveFormat('ruby', formats)).toEqual(DEFAULT_FORMATS.ruby);
  });

  it('falls back to the built-in when an override is malformed', () => {
    expect(resolveFormat('python', { python: { prefix: '#' } })).toEqual(DEFAULT_FORMATS.python);
    expect(resolveFormat('python', { python: { prefix: '#', fill: '##', suffix: '#' } }))
      .toEqual(DEFAULT_FORMATS.python);
    expect(resolveFormat('python', { python: 'nonsense' })).toEqual(DEFAULT_FORMATS.python);
  });

  it('returns undefined when a malformed override has no built-in to fall back to', () => {
    expect(resolveFormat('clojure', { clojure: { fill: ';' } })).toBeUndefined();
  });
});

describe('isValidFormat', () => {
  it('requires all three string fields and a single-character fill', () => {
    expect(isValidFormat({ prefix: '#', fill: '#', suffix: '#' })).toBe(true);
    expect(isValidFormat({ prefix: '#', fill: '', suffix: '#' })).toBe(false);
    expect(isValidFormat({ prefix: '#', fill: '--', suffix: '#' })).toBe(false);
    expect(isValidFormat({ prefix: 1, fill: '#', suffix: '#' })).toBe(false);
    expect(isValidFormat(null)).toBe(false);
    expect(isValidFormat(undefined)).toBe(false);
  });

  it('rejects non-object and non-null types outright', () => {
    expect(isValidFormat([])).toBe(false);
    expect(isValidFormat('nonsense')).toBe(false);
  });

  it('accepts an empty prefix and suffix', () => {
    expect(isValidFormat({ prefix: '', fill: '-', suffix: '' })).toBe(true);
  });

  it('rejects control characters in fill, prefix, and suffix', () => {
    expect(isValidFormat({ prefix: '#', fill: '\n', suffix: '#' })).toBe(false);
    expect(isValidFormat({ prefix: '#', fill: '\r', suffix: '#' })).toBe(false);
    expect(isValidFormat({ prefix: '#', fill: '\t', suffix: '#' })).toBe(false);
    expect(isValidFormat({ prefix: '#\n', fill: '#', suffix: '#' })).toBe(false);
    expect(isValidFormat({ prefix: '#', fill: '#', suffix: '#\n' })).toBe(false);
  });

  it('accepts fullwidth fills despite display-width limitations (out of scope)', () => {
    // Fullwidth characters like '中' have .length === 1 but occupy 2 display columns.
    // Display-width awareness is deliberately deferred; rejecting fullwidth fills while
    // still mis-centering fullwidth titles would be an inconsistent half-measure.
    // A fullwidth fill yields a too-wide banner, not a structurally broken one.
    expect(isValidFormat({ prefix: '#', fill: '中', suffix: '#' })).toBe(true);
  });

  it('respects the malformed override fallback in resolveFormat', () => {
    expect(resolveFormat('python', { python: { prefix: '#', fill: '\n', suffix: '#' } }))
      .toEqual(DEFAULT_FORMATS.python);
  });
});

describe('resolveWidth', () => {
  it('uses the smallest ruler', () => {
    expect(resolveWidth([100, 80, 120], undefined)).toBe(80);
  });

  it('accepts the { column, color } ruler form', () => {
    expect(resolveWidth([{ column: 100, color: '#333' }, { column: 72 }], undefined)).toBe(72);
  });

  it('accepts a mix of both ruler forms', () => {
    expect(resolveWidth([100, { column: 72 }], undefined)).toBe(72);
  });

  it('falls back to wordWrapColumn when no rulers are set', () => {
    expect(resolveWidth([], 100)).toBe(100);
    expect(resolveWidth(undefined, 100)).toBe(100);
  });

  it('falls back to 80 when neither is set', () => {
    expect(resolveWidth([], undefined)).toBe(DEFAULT_WIDTH);
    expect(resolveWidth(undefined, undefined)).toBe(80);
  });

  it('ignores malformed ruler entries', () => {
    expect(resolveWidth(['nonsense', null, { color: '#333' }, 90], undefined)).toBe(90);
    expect(resolveWidth(['nonsense'], 100)).toBe(100);
  });

  it('ignores non-positive values', () => {
    expect(resolveWidth([0, -5, 90], undefined)).toBe(90);
    expect(resolveWidth([], 0)).toBe(80);
  });

  it('ignores a non-array rulers value', () => {
    expect(resolveWidth('nonsense', 100)).toBe(100);
  });
});
