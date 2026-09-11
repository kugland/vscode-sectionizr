# vscode-sectionizr Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a VS Code extension that inserts comment-delimited section banners, reproducing the kugland/sectionizr Sublime Text plugin's output column-for-column.

**Architecture:** Three pure modules (`format.ts`, `config.ts`, `layout.ts`) hold all arithmetic and string work and never import `vscode`; a single thin adapter (`extension.ts`) reads editor state, calls into them, and applies one batched edit. Unit tests run under Vitest against the pure modules with no editor host; a single Mocha smoke test under `@vscode/test-cli` proves the editor-facing wiring.

**Tech Stack:** TypeScript, esbuild (bundle), Vitest (unit), `@vscode/test-cli` + `@vscode/test-electron` (integration), `@vscode/vsce` (packaging).

**Spec:** `docs/superpowers/specs/2026-09-10-vscode-sectionizr-design.md`

## Global Constraints

- **VS Code engine:** `^1.85.0`. Node 18+.
- **Zero runtime dependencies.** Everything is a `devDependency`; the bundle ships as a single file.
- **`src/format.ts`, `src/config.ts`, and `src/layout.ts` MUST NOT import `vscode`.** This is what keeps them Vitest-testable. Only `src/extension.ts` may import it.
- **`fill` MUST be exactly one character.** All padding math assumes `fill.repeat(n)` has length `n`.
- **Width formula, verbatim:** `centerWidth = width - prefix.length - suffix.length - indentWidth - 1`, clamped to a minimum of `0`.
- **Centering uses CPython's `str.center` algorithm**, not an even split: `left = (margin >> 1) + (margin & width & 1)`.
- **License:** MIT, `Copyright (c) 2015 André von Kugland`, carried over from the original.
- **Command ids:** `sectionizr.createSection0`, `sectionizr.createSection1`.
- **Keybindings:** `ctrl+k 0` / `ctrl+k 1` (`cmd+k 0` / `cmd+k 1` on macOS), `when: editorTextFocus`.
- Commit after every task.

---

### Task 1: Project scaffolding

Sets up the toolchain so every later task has a working `npm test`. No product code yet.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.js`
- Create: `vitest.config.ts`
- Create: `.vscode/launch.json`
- Create: `.vscode/tasks.json`
- Create: `.vscodeignore`
- Create: `LICENSE`
- Test: `test/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (Vitest, unit), `npm run compile` (esbuild bundle to `dist/extension.js`), `npm run compile-tests` (tsc to `out/`), F5 debugging.

- [ ] **Step 1: Create `package.json`**

Contributions for commands, keybindings, and settings are added in Task 7; this is the toolchain shell.

```json
{
  "name": "sectionizr",
  "displayName": "Sectionizr",
  "description": "Creates comment section banners in multiple languages.",
  "version": "0.1.0",
  "publisher": "kugland",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/kugland/vscode-sectionizr.git" },
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Formatters", "Other"],
  "main": "./dist/extension.js",
  "activationEvents": [],
  "contributes": {},
  "scripts": {
    "vscode:prepublish": "npm run compile -- --production",
    "compile": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "compile-tests": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "npm run compile && npm run compile-tests && vscode-test",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/test-cli": "^0.0.9",
    "@vscode/test-electron": "^2.3.9",
    "@vscode/vsce": "^2.24.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

This config drives `compile-tests` (integration tests need real `.js` on disk). Vitest transpiles on its own and does not use the emit settings.

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": ".",
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "noImplicitReturns": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/integration/**/*.ts"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

`include` deliberately covers only `src/` and the integration tests. The Vitest
tests are transpiled by Vitest itself and must not be emitted into `out/`,
where the VS Code test runner would try to run them against a `vscode` module
that only exists inside the Electron host.

- [ ] **Step 3: Create `esbuild.js`**

```js
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

Integration tests live under `test/integration/` and must be excluded — they import `vscode`, which only resolves inside the Electron host.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
  },
});
```

- [ ] **Step 5: Create `.vscode/launch.json` and `.vscode/tasks.json`**

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

`.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "watch",
      "type": "npm",
      "script": "watch",
      "problemMatcher": "$esbuild-watch",
      "isBackground": true,
      "group": { "kind": "build", "isDefault": true }
    }
  ]
}
```

- [ ] **Step 6: Create `.vscodeignore` and `LICENSE`**

`.vscodeignore`:

```
.vscode/**
.vscode-test/**
.vscode-test.mjs
out/**
src/**
test/**
docs/**
node_modules/**
esbuild.js
tsconfig.json
vitest.config.ts
**/*.map
**/*.ts
```

`LICENSE`: the MIT license text with `Copyright (c) 2015 André von Kugland`. Copy it verbatim from the original plugin if available, otherwise use the standard MIT text with that copyright line.

- [ ] **Step 7: Write a scaffold smoke test**

`test/scaffold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('scaffolding', () => {
  it('targets a supported VS Code engine', () => {
    expect(pkg.engines.vscode).toBe('^1.85.0');
  });

  it('ships no runtime dependencies', () => {
    expect((pkg as Record<string, unknown>).dependencies).toBeUndefined();
  });
});
```

- [ ] **Step 8: Install and run**

Run: `npm install && npm test`
Expected: 2 tests PASS. If `node`/`npm` are missing, prefix with `,` (Nix comma), e.g. `, npm install`.

- [ ] **Step 9: Verify the bundle builds**

Create a temporary `src/extension.ts` containing exactly `export function activate(): void {}`, then run `npm run compile`.
Expected: `dist/extension.js` exists. Leave this stub in place; Task 7 replaces it.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json esbuild.js vitest.config.ts .vscode .vscodeignore LICENSE test/scaffold.test.ts src/extension.ts
git commit -m "chore: scaffold TypeScript extension with esbuild and vitest"
```

---

### Task 2: `center()` and `buildTitle()`

The two pure string helpers. `center()` is the subtlest code in the project — it reproduces a CPython quirk — so it gets its own test cycle.

**Files:**
- Create: `src/format.ts`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `center(text: string, width: number, fill: string): string`
  - `buildTitle(lines: string[]): string`

- [ ] **Step 1: Write the failing tests**

The expected values below were produced by running CPython's `str.center`. Do not "correct" them to an even split — the asymmetry is the point.

`test/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTitle, center } from '../src/format';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/format"`.

- [ ] **Step 3: Write the implementation**

`src/format.ts`:

```ts
/**
 * Pads `text` to `width` using CPython's `str.center` algorithm.
 *
 * CPython does not split leftover padding evenly: it biases by the parity of
 * both the margin and the target width, so `'abc'.center(10, '.')` yields
 * three fill characters on the left and four on the right. Reproducing that
 * exactly is what makes output match the original Sublime Text plugin
 * column-for-column.
 *
 * `fill` must be exactly one character. As in Python, text that does not fit
 * is returned unchanged rather than truncated.
 */
export function center(text: string, width: number, fill: string): string {
  const margin = width - text.length;
  if (margin <= 0) {
    return text;
  }
  const left = (margin >> 1) + (margin & width & 1);
  return fill.repeat(left) + text + fill.repeat(margin - left);
}

/**
 * Collapses the selected lines into a single banner title: each line trimmed,
 * blank lines dropped, the rest joined with a single space.
 */
export function buildTitle(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format.ts test/format.test.ts
git commit -m "feat: add center() with CPython padding parity and buildTitle()"
```

---

### Task 3: `render()`

Turns a title plus context into banner lines. No indent applied, no blank-line padding — those belong to Task 6.

**Files:**
- Modify: `src/format.ts`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `center()` from Task 2.
- Produces:
  - `interface CommentFormat { prefix: string; fill: string; suffix: string }`
  - `interface RenderOptions { title: string; level: 0 | 1; format: CommentFormat; width: number; indentWidth: number; uppercaseLevel0: boolean }`
  - `render(opts: RenderOptions): string[]`

- [ ] **Step 1: Write the failing tests**

Append to `test/format.test.ts` (and extend the existing import from `../src/format` to include `render` and the `CommentFormat` type):

```ts
import type { CommentFormat } from '../src/format';
import { render } from '../src/format';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `render is not a function` / no exported member `render`.

- [ ] **Step 3: Write the implementation**

Append to `src/format.ts`:

```ts
/** Comment tokens for one language. `fill` must be exactly one character. */
export interface CommentFormat {
  prefix: string;
  fill: string;
  suffix: string;
}

export interface RenderOptions {
  /** Already trimmed and joined; empty means "render a plain divider". */
  title: string;
  level: 0 | 1;
  format: CommentFormat;
  /** Target column, from the ruler chain. */
  width: number;
  /** Tab-expanded width of the leading whitespace. */
  indentWidth: number;
  uppercaseLevel0: boolean;
}

/**
 * Renders the banner lines, without indentation and without blank-line
 * padding. The trailing `- 1` in the width is inherited from the original
 * plugin: it leaves the banner one column short of the ruler, so the ruler
 * stays visible just past the banner's right edge.
 */
export function render(opts: RenderOptions): string[] {
  const { title, level, format, width, indentWidth, uppercaseLevel0 } = opts;
  const { prefix, fill, suffix } = format;

  const centerWidth = Math.max(
    0,
    width - prefix.length - suffix.length - indentWidth - 1,
  );
  const rule = prefix + fill.repeat(centerWidth) + suffix;

  if (title.length === 0) {
    return [rule];
  }

  if (level === 0) {
    const text = uppercaseLevel0 ? title.toUpperCase() : title;
    return [rule, prefix + center(text, centerWidth, ' ') + suffix, rule];
  }

  return [prefix + center(` ${title} `, centerWidth, fill) + suffix];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format.ts test/format.test.ts
git commit -m "feat: add render() for level 0 and level 1 section banners"
```

---

### Task 4: The format table and `resolveFormat()`

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: `CommentFormat` from Task 3.
- Produces:
  - `DEFAULT_FORMATS: Record<string, CommentFormat>`
  - `isValidFormat(value: unknown): value is CommentFormat`
  - `resolveFormat(languageId: string, userFormats: Record<string, unknown>): CommentFormat | undefined`

- [ ] **Step 1: Write the failing tests**

`test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMATS, isValidFormat, resolveFormat } from '../src/config';

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

  it('accepts an empty prefix and suffix', () => {
    expect(isValidFormat({ prefix: '', fill: '-', suffix: '' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/config"`.

- [ ] **Step 3: Write the implementation**

`src/config.ts`:

```ts
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

/**
 * A format is usable only if all three tokens are strings and `fill` is
 * exactly one character — every padding calculation assumes `fill.repeat(n)`
 * has length `n`.
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
    fill.length === 1
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add built-in comment format table and resolveFormat()"
```

---

### Task 5: `resolveWidth()`

**Files:**
- Modify: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_WIDTH: number` (`80`)
  - `resolveWidth(rulers: unknown, wordWrapColumn: unknown): number`

- [ ] **Step 1: Write the failing tests**

Append to `test/config.test.ts`, extending the existing import from `../src/config` to include `DEFAULT_WIDTH` and `resolveWidth`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — no exported member `resolveWidth`.

- [ ] **Step 3: Write the implementation**

Append to `src/config.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add resolveWidth() with ruler fallback chain"
```

---

### Task 6: Layout helpers

The remaining editor-shaped logic, extracted into pure functions so the adapter in Task 7 contains no arithmetic.

**Files:**
- Create: `src/layout.ts`
- Test: `test/layout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LineRange { start: number; end: number }` (inclusive line numbers, 0-based)
  - `expandTabs(text: string, tabSize: number): number`
  - `leadingWhitespace(line: string): string`
  - `mergeRanges(ranges: LineRange[]): LineRange[]`
  - `assembleSection(lines: string[], indent: string, blankLines: boolean): string[]`

- [ ] **Step 1: Write the failing tests**

`test/layout.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/layout"`.

- [ ] **Step 3: Write the implementation**

`src/layout.ts`:

```ts
/** An inclusive range of 0-based document line numbers. */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * Display width of `text`, expanding tabs to the next tab stop the way
 * Python's `str.expandtabs` does — a tab advances to the next multiple of
 * `tabSize` rather than always adding `tabSize` columns.
 */
export function expandTabs(text: string, tabSize: number): number {
  const stop = Math.max(1, tabSize);
  let width = 0;
  for (const char of text) {
    width += char === '\t' ? stop - (width % stop) : 1;
  }
  return width;
}

/** The line's leading whitespace, verbatim — tabs stay tabs. */
export function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

/**
 * Merges overlapping line ranges so two cursors on the same line cannot
 * produce colliding edits. Adjacent-but-separate ranges stay separate: they
 * are distinct banners.
 */
export function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Applies the indent to each banner line and, when enabled, surrounds the
 * banner with blank lines. The padding lines are left truly empty rather than
 * carrying trailing indent whitespace.
 */
export function assembleSection(
  lines: string[],
  indent: string,
  blankLines: boolean,
): string[] {
  const body = lines.map((line) => indent + line);
  return blankLines ? ['', ...body, ''] : body;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layout.ts test/layout.test.ts
git commit -m "feat: add tab expansion, range merging, and section assembly"
```

---

### Task 7: The extension adapter and manifest contributions

Wires everything to VS Code. Verified by hand in the Extension Development Host here; the automated smoke test lands in Task 8.

**Files:**
- Modify: `src/extension.ts` (replaces the Task 1 stub)
- Modify: `package.json` (fills in `activationEvents` and `contributes`)

**Interfaces:**
- Consumes: `render`, `buildTitle`, `CommentFormat` (Tasks 2–3); `resolveFormat`, `resolveWidth` (Tasks 4–5); `expandTabs`, `leadingWhitespace`, `mergeRanges`, `assembleSection`, `LineRange` (Task 6).
- Produces: commands `sectionizr.createSection0` and `sectionizr.createSection1`.

- [ ] **Step 1: Add the manifest contributions**

In `package.json`, replace `"activationEvents": []` and `"contributes": {}` with:

```json
  "activationEvents": [],
  "contributes": {
    "commands": [
      {
        "command": "sectionizr.createSection0",
        "title": "Sectionizr: Create Section (Level 0)",
        "enablement": "editorIsOpen"
      },
      {
        "command": "sectionizr.createSection1",
        "title": "Sectionizr: Create Section (Level 1)",
        "enablement": "editorIsOpen"
      }
    ],
    "keybindings": [
      {
        "command": "sectionizr.createSection0",
        "key": "ctrl+k 0",
        "mac": "cmd+k 0",
        "when": "editorTextFocus && !editorReadonly"
      },
      {
        "command": "sectionizr.createSection1",
        "key": "ctrl+k 1",
        "mac": "cmd+k 1",
        "when": "editorTextFocus && !editorReadonly"
      }
    ],
    "configuration": {
      "title": "Sectionizr",
      "properties": {
        "sectionizr.formats": {
          "type": "object",
          "default": {},
          "scope": "language-overridable",
          "markdownDescription": "Comment tokens per language id, merged over the built-in table. `fill` must be exactly one character.",
          "additionalProperties": {
            "type": "object",
            "required": ["prefix", "fill", "suffix"],
            "properties": {
              "prefix": { "type": "string", "description": "Opening comment token." },
              "fill": { "type": "string", "minLength": 1, "maxLength": 1, "description": "Single character used to pad the banner." },
              "suffix": { "type": "string", "description": "Closing comment token." }
            }
          }
        },
        "sectionizr.uppercaseLevel0": {
          "type": "boolean",
          "default": true,
          "scope": "language-overridable",
          "description": "Uppercase the title in level 0 banners."
        },
        "sectionizr.blankLines": {
          "type": "boolean",
          "default": true,
          "scope": "language-overridable",
          "description": "Surround the inserted banner with blank lines."
        }
      }
    }
  },
```

Note: `activationEvents` stays empty. VS Code 1.75+ derives activation from `contributes.commands` automatically.

- [ ] **Step 2: Write the adapter**

Replace `src/extension.ts` entirely:

```ts
import * as vscode from 'vscode';

import { resolveFormat, resolveWidth } from './config';
import { buildTitle, render } from './format';
import {
  assembleSection,
  expandTabs,
  leadingWhitespace,
  mergeRanges,
  type LineRange,
} from './layout';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sectionizr.createSection0', () =>
      createSection(0),
    ),
    vscode.commands.registerCommand('sectionizr.createSection1', () =>
      createSection(1),
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up; all disposables are owned by the context.
}

function tabSizeOf(editor: vscode.TextEditor): number {
  const { tabSize } = editor.options;
  return typeof tabSize === 'number' ? tabSize : 4;
}

async function createSection(level: 0 | 1): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const scope = { uri: document.uri, languageId: document.languageId };
  const editorConfig = vscode.workspace.getConfiguration('editor', scope);
  const ownConfig = vscode.workspace.getConfiguration('sectionizr', scope);

  const format = resolveFormat(
    document.languageId,
    ownConfig.get<Record<string, unknown>>('formats', {}),
  );
  if (!format) {
    void vscode.window.showWarningMessage(
      `Sectionizr: no comment format for language "${document.languageId}". ` +
        'Add one under the "sectionizr.formats" setting.',
    );
    return;
  }

  const width = resolveWidth(
    editorConfig.get('rulers'),
    editorConfig.get('wordWrapColumn'),
  );
  const tabSize = tabSizeOf(editor);
  const uppercaseLevel0 = ownConfig.get<boolean>('uppercaseLevel0', true);
  const blankLines = ownConfig.get<boolean>('blankLines', true);
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';

  const ranges: LineRange[] = mergeRanges(
    editor.selections.map((selection) => ({
      start: selection.start.line,
      end: selection.end.line,
    })),
  );

  const edits = ranges.map((range) => {
    const lines: string[] = [];
    for (let line = range.start; line <= range.end; line++) {
      lines.push(document.lineAt(line).text);
    }

    const indent = leadingWhitespace(lines[0]);
    const body = render({
      title: buildTitle(lines),
      level,
      format,
      width,
      indentWidth: expandTabs(indent, tabSize),
      uppercaseLevel0,
    });

    return {
      range: new vscode.Range(
        range.start,
        0,
        range.end,
        document.lineAt(range.end).text.length,
      ),
      text: assembleSection(body, indent, blankLines).join(eol),
    };
  });

  // One edit call, so the whole thing is a single undo step.
  await editor.edit((builder) => {
    for (const edit of edits) {
      builder.replace(edit.range, edit.text);
    }
  });
}
```

- [ ] **Step 3: Verify it compiles and unit tests still pass**

Run: `npm run compile && npm test`
Expected: `dist/extension.js` written, all unit tests PASS.

- [ ] **Step 4: Verify by hand in the Extension Development Host**

Press <kbd>F5</kbd> (or run `code --extensionDevelopmentPath=$PWD`). In the new window:

1. Open a new file, set the language to Python, and set `"editor.rulers": [80]`.
2. Type `my section`, leave the cursor on that line, press `ctrl+k 0`.
   Expected: three `#` lines, each 79 characters, with `MY SECTION` centered.
3. Undo, press `ctrl+k 1`.
   Expected: one 79-character line reading `#...# my section #...#`.
4. Put the cursor on an empty line and press `ctrl+k 0`.
   Expected: a single 79-character `#` divider.
5. Indent a line by 4 spaces, type a title, press `ctrl+k 0`.
   Expected: the banner is indented 4 spaces and each line is 75 characters.
6. Place two cursors on two different lines and press `ctrl+k 1`.
   Expected: two banners, and a single <kbd>ctrl+z</kbd> undoes both.
7. Switch the language to Plain Text and press `ctrl+k 0`.
   Expected: a warning message naming `plaintext`, and no edit.

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: wire commands, keybindings, and settings to the editor"
```

---

### Task 8: Integration smoke test

Proves the wiring holds without a human at the keyboard: the extension activates, the command is registered, and it edits a real document.

**Files:**
- Create: `.vscode-test.mjs`
- Test: `test/integration/extension.test.ts`

**Interfaces:**
- Consumes: the commands from Task 7.
- Produces: `npm run test:integration`.

- [ ] **Step 1: Create the test runner config**

`.vscode-test.mjs`:

```js
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
  mocha: { timeout: 20000 },
});
```

- [ ] **Step 2: Write the failing test**

These are Mocha tests (the VS Code test host uses Mocha, not Vitest), so they use `assert` and bare `suite`-style `describe`/`it` from Mocha's BDD interface.

`test/integration/extension.test.ts`:

```ts
import * as assert from 'node:assert';
import * as vscode from 'vscode';

async function openPythonDocument(content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    language: 'python',
    content,
  });
  return vscode.window.showTextDocument(document);
}

describe('sectionizr', () => {
  it('registers both commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('sectionizr.createSection0'));
    assert.ok(commands.includes('sectionizr.createSection1'));
  });

  it('replaces the cursor line with a level 0 banner', async () => {
    const editor = await openPythonDocument('my section\n');
    await vscode.workspace
      .getConfiguration('editor', editor.document.uri)
      .update('rulers', [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand('sectionizr.createSection0');

    const lines = editor.document.getText().split('\n');
    // blank, rule, title, rule, blank, then the document's original trailing line
    assert.strictEqual(lines[0], '');
    assert.strictEqual(lines[1], '#'.repeat(79));
    assert.strictEqual(lines[2].length, 79);
    assert.ok(lines[2].includes('MY SECTION'));
    assert.strictEqual(lines[3], '#'.repeat(79));
    assert.strictEqual(lines[4], '');
  });

  it('replaces the cursor line with a level 1 banner', async () => {
    const editor = await openPythonDocument('my section\n');
    await vscode.workspace
      .getConfiguration('editor', editor.document.uri)
      .update('rulers', [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand('sectionizr.createSection1');

    const lines = editor.document.getText().split('\n');
    assert.strictEqual(lines[1].length, 79);
    assert.ok(lines[1].includes(' my section '));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

First confirm the harness runs at all. Temporarily change the first assertion to `assert.ok(commands.includes('sectionizr.doesNotExist'))`, then:

Run: `npm run test:integration`
Expected: the Electron host launches and that test FAILS. Restore the assertion.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:integration`
Expected: 3 tests PASS.

If the banner assertions fail on line indices, print `JSON.stringify(editor.document.getText())` to see exactly what was produced before adjusting anything — the pure-module tests are authoritative on the banner content, so a mismatch here is a wiring bug, not a formatting one.

- [ ] **Step 5: Verify unit tests are unaffected**

Run: `npm test`
Expected: all PASS, and the integration test is NOT collected (it is excluded in `vitest.config.ts`).

- [ ] **Step 6: Commit**

```bash
git add .vscode-test.mjs test/integration/extension.test.ts
git commit -m "test: add integration smoke test for command registration and editing"
```

---

### Task 9: Documentation and packaging

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything.
- Produces: a `.vsix` that installs and works.

- [ ] **Step 1: Write `README.md`**

Include, in this order:

1. A one-line description and a note that it is a port of [kugland/sectionizr](https://github.com/kugland/sectionizr) for Sublime Text.
2. Rendered examples of both levels, copied from the spec's Behavior section — they are exact output at ruler 80.
3. The keybinding table: `ctrl+k 0` / `ctrl+k 1` (`cmd+k 0` / `cmd+k 1` on macOS), plus the Command Palette entries.
4. The settings table: `sectionizr.formats`, `sectionizr.uppercaseLevel0`, `sectionizr.blankLines`, with the `formats` example:

```jsonc
"sectionizr.formats": {
  "rust": { "prefix": "//", "fill": "/", "suffix": "//" }
}
```

5. A "How the width is chosen" section: smallest `editor.rulers` entry → `editor.wordWrapColumn` → 80, and a note that banners end one column short of the ruler by design.
6. A "Differences from the Sublime version" section covering: the two-keystroke chord limit (`ctrl+k c 0` is not expressible, and `ctrl+k ctrl+0` is the built-in Fold All); languages are matched by VS Code language id rather than TextMate scope; a multi-line selection joins into one title; an empty line yields a plain divider; and full-width (CJK) characters are not accounted for in the centering math.
7. The MIT license line.

- [ ] **Step 2: Write `CHANGELOG.md`**

```markdown
# Changelog

## 0.1.0

Initial release. Port of the Sectionizr plugin for Sublime Text.

- Level 0 (boxed) and level 1 (single line) section banners.
- Comment tokens for 50+ languages, overridable via `sectionizr.formats`.
- Width from `editor.rulers`, falling back to `editor.wordWrapColumn`, then 80.
- `sectionizr.uppercaseLevel0` and `sectionizr.blankLines` settings.
```

- [ ] **Step 3: Package the extension**

Run: `npm run package`
Expected: `sectionizr-0.1.0.vsix` is produced. `vsce` may warn about a missing icon and a missing repository badge; those are acceptable. Fix anything it reports as an error.

- [ ] **Step 4: Install the package and verify**

Run: `code --install-extension sectionizr-0.1.0.vsix`

Open a Python file with `"editor.rulers": [80]`, type a title, press `ctrl+k 0`.
Expected: a three-line banner, exactly as in the dev host.

This step catches `.vscodeignore` and activation mistakes that the Extension Development Host hides.

- [ ] **Step 5: Run the full suite one last time**

Run: `npm test && npm run test:integration`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: add README and changelog for the 0.1.0 release"
```
