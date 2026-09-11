import type { CommentFormat } from './format';

const HASH: CommentFormat = { prefix: '#', fill: '#', suffix: '#' };
const SLASH: CommentFormat = { prefix: '//', fill: '/', suffix: '//' };
const BLOCK: CommentFormat = { prefix: '/*', fill: '*', suffix: '*/' };
const DASH: CommentFormat = { prefix: '--', fill: '-', suffix: '--' };
const PERCENT: CommentFormat = { prefix: '%', fill: '%', suffix: '%' };
const MARKUP: CommentFormat = { prefix: '<!--', fill: '-', suffix: '-->' };

function family(format: CommentFormat, languageIds: string[]): Record<string, CommentFormat> {
  return Object.fromEntries(languageIds.map((id) => [id, format]));
}

/**
 * Built-in comment tokens by VS Code language id.
 *
 * `c` uses block comments while `cpp` uses line comments. That split looks
 * odd but is inherited from the original plugin and is intentional.
 */
export const DEFAULT_FORMATS: Record<string, CommentFormat> = {
  ...family(HASH, [
    'python', 'ruby', 'shellscript', 'perl', 'makefile', 'powershell',
    'r', 'yaml', 'toml', 'dockerfile', 'nix', 'elixir', 'julia',
  ]),
  ...family(SLASH, [
    'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
    'json', 'jsonc', 'java', 'cpp', 'csharp', 'objective-c', 'objective-cpp',
    'php', 'sass', 'scss', 'less', 'go', 'rust', 'swift', 'kotlin', 'scala',
    'dart', 'zig', 'groovy',
  ]),
  ...family(BLOCK, ['c', 'css']),
  ...family(DASH, ['sql', 'haskell', 'lua']),
  ...family(PERCENT, ['tex', 'latex', 'bibtex', 'lilypond']),
  ...family(MARKUP, ['html', 'xml', 'xsl', 'markdown', 'vue', 'svelte']),
};

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Reject C0 controls (0-31), DEL (127), and C1 controls (128-159)
    if ((code >= 0 && code <= 31) || (code >= 127 && code <= 159)) {
      return true;
    }
  }
  return false;
}

/**
 * A format is usable only if all three tokens are strings, `fill` is exactly
 * one character, and none of the three tokens contain control characters
 * (C0: 0-31, DEL: 127, C1: 128-159). Control characters break the banner structure:
 * a newline in any token injects literal line breaks into what must be a
 * single line. Every padding calculation also assumes `fill.repeat(n)` has
 * length `n`, which control characters violate.
 */
export function isValidFormat(value: unknown): value is CommentFormat {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { prefix, fill, suffix } = value as Record<string, unknown>;
  return (
    typeof prefix === 'string' &&
    typeof suffix === 'string' &&
    typeof fill === 'string' &&
    fill.length === 1 &&
    !hasControlCharacters(prefix) &&
    !hasControlCharacters(fill) &&
    !hasControlCharacters(suffix)
  );
}

/**
 * User formats are merged over the built-in table per language, so overriding
 * one language leaves the rest alone. A malformed override is ignored in
 * favour of the built-in rather than breaking the command.
 */
export function resolveFormat(
  languageId: string,
  userFormats: Record<string, unknown>,
): CommentFormat | undefined {
  const override = userFormats[languageId];
  if (isValidFormat(override)) {
    return override;
  }
  return DEFAULT_FORMATS[languageId];
}

export const DEFAULT_WIDTH = 80;

function rulerColumn(entry: unknown): number | undefined {
  if (typeof entry === 'number') {
    return entry;
  }
  if (typeof entry === 'object' && entry !== null) {
    const { column } = entry as Record<string, unknown>;
    if (typeof column === 'number') {
      return column;
    }
  }
  return undefined;
}

/**
 * Banner width, resolved in the order: smallest `editor.rulers` entry, then
 * `editor.wordWrapColumn`, then 80. Ruler entries may be a bare number or a
 * `{ column, color }` object; both forms are accepted.
 */
export function resolveWidth(rulers: unknown, wordWrapColumn: unknown): number {
  const columns = (Array.isArray(rulers) ? rulers : [])
    .map(rulerColumn)
    .filter((column): column is number => column !== undefined && column > 0);

  if (columns.length > 0) {
    return Math.min(...columns);
  }
  if (typeof wordWrapColumn === 'number' && wordWrapColumn > 0) {
    return wordWrapColumn;
  }
  return DEFAULT_WIDTH;
}
