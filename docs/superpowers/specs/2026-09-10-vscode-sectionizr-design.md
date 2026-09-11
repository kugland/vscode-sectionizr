# vscode-sectionizr — Design

**Date:** 2026-09-10
**Status:** Approved
**Source:** Port of [kugland/sectionizr](https://github.com/kugland/sectionizr), a Sublime Text plugin (MIT, © 2015 André von Kugland).

## Purpose

Insert commented section banners into source files. The user types a title on a
line, presses a key, and the line becomes a centered, comment-delimited banner
padded out to the editor's ruler column.

The VS Code port reproduces the Sublime plugin's output column-for-column by
default, while exposing the previously hardcoded choices as settings.

## Behavior

### Levels

Two levels, matching the original's `level 0` and `level >= 1`.

**Level 0** — a boxed banner, three lines. Title uppercased by default.

```
###############################################################################
#                                  MY SECTION                                 #
###############################################################################
```

**Level 1** — a single line, title surrounded by spaces and centered in fill
characters. Title is used verbatim.

```
################################## My Section #################################
```

### Width math

```
centerWidth = width - prefix.length - suffix.length - indentWidth - 1
```

Clamped to a minimum of 0. The trailing `-1` is inherited from the original: it
leaves the rendered line one column short of the ruler, so the ruler remains
visible just past the banner's right edge.

`width` resolves in order:

1. The smallest entry in language-scoped `editor.rulers`. Entries may be a
   number or `{ column, color }`; both forms are handled.
2. `editor.wordWrapColumn`.
3. `80`.

`indentWidth` is the tab-expanded width of the first target line's leading
whitespace, using the active editor's live `tabSize` (`editor.options.tabSize`,
which reflects `detectIndentation`). The indent itself is preserved verbatim in
the output — tabs stay tabs.

### Centering

Padding is distributed using CPython's `str.center` algorithm, not a naive
even split:

```
margin = width - text.length
left   = (margin >> 1) + (margin & width & 1)
```

This biases padding by the parity of both the margin and the width
(`'abc'.center(10, '.')` is `'...abc....'`, three left and four right).
Reproducing it exactly is what makes output match the Sublime plugin
column-for-column.

A title longer than `centerWidth` overflows rather than being truncated, which
is also what `str.center` does.

### Empty titles

If the target line(s) contain no non-whitespace text, both levels emit a single
fill rule with no centered text — a plain horizontal divider.

### Selections

For each selection, the target range is the full lines spanned from selection
start through selection end.

- **Title:** the non-empty lines in that range, each trimmed, joined with a
  single space. A multi-line selection therefore collapses into one banner.
- **Indent:** the literal leading whitespace of the range's first line.
- The range is replaced by the rendered banner.

Selections touching the same lines are merged before editing, so overlapping
cursors cannot produce colliding edits. All selections are applied in a single
`editor.edit()` call, yielding one undo step.

Rendered lines are joined with the document's own EOL and each prefixed with
the indent. When `sectionizr.blankLines` is enabled, one blank line is inserted
above and below the banner.

## Configuration

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `sectionizr.formats` | object | `{}` | Language id → `{prefix, fill, suffix}`. Merged **over** the built-in table, so an entry replaces one language without disturbing others. |
| `sectionizr.uppercaseLevel0` | boolean | `true` | Uppercase the title at level 0. |
| `sectionizr.blankLines` | boolean | `true` | Surround the banner with blank lines. |

There is no width setting; width comes from the ruler chain above.

### Built-in format table

| prefix / fill / suffix | Language ids |
|---|---|
| `#` `#` `#` | python, ruby, shellscript, perl, makefile, powershell, r, yaml, toml, dockerfile, nix, elixir, julia |
| `//` `/` `//` | javascript, javascriptreact, typescript, typescriptreact, json, jsonc, java, cpp, csharp, objective-c, objective-cpp, php, sass, scss, less, go, rust, swift, kotlin, scala, dart, zig, groovy |
| `/*` `*` `*/` | c, css |
| `--` `-` `--` | sql, haskell, lua |
| `%` `%` `%` | tex, latex, bibtex, lilypond |
| `<!--` `-` `-->` | html, xml, xsl, markdown, vue, svelte |

`c` uses block comments while `cpp` uses line comments. That split is inherited
from the original and is intentional.

An unresolved language produces a warning message naming the language id and
pointing at `sectionizr.formats`, and makes no edit. This is the port of the
original's `NotImplementedError`.

## Commands and keybindings

| Command id | Title | Key | macOS |
|---|---|---|---|
| `sectionizr.createSection0` | Sectionizr: Create Section (Level 0) | `ctrl+k 0` | `cmd+k 0` |
| `sectionizr.createSection1` | Sectionizr: Create Section (Level 1) | `ctrl+k 1` | `cmd+k 1` |

Both are gated on `editorTextFocus` for the keybinding and shown in the Command
Palette when an editor is active. The original's three-key `ctrl+k c 0` chord is
not expressible in VS Code, which caps chords at two keystrokes. `ctrl+k 0` was
chosen over `ctrl+k ctrl+0` because the latter is the built-in **Fold All**.

## Architecture

Four source modules. `vscode` is imported by exactly one.

### `src/format.ts` (pure)

```ts
export interface CommentFormat {
  prefix: string;
  fill: string;
  suffix: string;
}

export interface RenderOptions {
  title: string;            // trimmed and joined
  level: 0 | 1;
  format: CommentFormat;
  width: number;            // target column
  indentWidth: number;      // tab-expanded
  uppercaseLevel0: boolean;
}

export function render(opts: RenderOptions): string[];
export function center(text: string, width: number, fill: string): string;
export function buildTitle(lines: string[]): string;
```

`render` returns banner lines with no indent applied and no blank-line padding.

### `src/config.ts` (pure)

```ts
export const DEFAULT_FORMATS: Record<string, CommentFormat>;
export function resolveFormat(
  languageId: string,
  userFormats: Record<string, CommentFormat>,
): CommentFormat | undefined;
export function resolveWidth(
  rulers: unknown[],
  wordWrapColumn: number | undefined,
): number;
```

Both functions take plain data, so neither needs a VS Code host to test.

A third export, `isValidFormat(value: unknown): value is CommentFormat`, guards
the trust boundary where user configuration enters. It requires all three tokens
to be strings, `fill` to be exactly one character, and none of the three to
contain a C0/C1 control character or DEL. The control-character rule is
load-bearing: a `fill` of `\n` satisfies every other check but injects literal
line breaks into a single-line banner once the padding math repeats it. Display
width is deliberately NOT checked -- a fullwidth or zero-width `fill` is accepted
and yields a mis-widthed banner, consistent with full-width handling being out of
scope. Because this validator is the only guard, the padding functions in
`format.ts` carry no redundant `fill` checks of their own.

### `src/layout.ts` (pure)

```ts
/** An inclusive range of 0-based document line numbers. */
export interface LineRange {
  start: number;
  end: number;
}

export function expandTabs(text: string, tabSize: number): number;
export function leadingWhitespace(line: string): string;
export function mergeRanges(ranges: LineRange[]): LineRange[];
export function assembleSection(
  lines: string[],
  indent: string,
  blankLines: boolean,
): string[];
```

The editor-shaped logic that is still arithmetic: tab-stop expansion, indent
extraction, overlapping-selection merging, and applying the indent and
blank-line padding to rendered lines. Kept out of the adapter so it is
testable without an editor host.

### `src/extension.ts` (adapter)

Registers the two commands. Per invocation it reads the active editor, language
id, language-scoped `editor.rulers` / `editor.wordWrapColumn`, live `tabSize`,
and the `sectionizr.*` settings; merges and normalizes the selections; calls
into the pure modules; and applies the result in one `editor.edit()`.

Kept deliberately thin — it contains no padding or width arithmetic.

## Testing

Vitest covers the pure modules, which is where the substantive logic lives:

- Both levels, with and without indentation, including tab-indented input.
- Empty and whitespace-only lines producing a divider.
- Titles longer than `centerWidth` overflowing rather than truncating.
- Each of the six token families.
- The CPython center-parity quirk, verified against known `str.center` outputs.
- Degenerate widths where `centerWidth` clamps to 0.
- `resolveFormat` with no override, an override of a built-in, and an override
  adding a new language.
- `resolveWidth` across the full fallback chain and both ruler entry shapes.
- Tab-stop expansion, indent extraction, selection merging, and the assembly
  of indent plus blank-line padding.

One `@vscode/test-cli` integration smoke test activates the extension, runs a
command against a real buffer, and asserts the resulting document text.

## Tooling

TypeScript, esbuild for bundling, Vitest for unit tests, `@vscode/test-cli` for
the integration test, `@vscode/vsce` for packaging. MIT license carried over
from the original. README documents the settings, the keybindings, and the
Sublime-parity notes.

## Out of scope

- **Full-width (CJK) character handling in the centering math.** The original
  contains a `str_width()` helper for this, but it has a broken signature
  (missing `self`) and is never called. It is dropped rather than ported.
  Adding real double-width support would be new behavior, not a port.
- A configurable width setting; the ruler chain covers it.
- Additional section styles or levels beyond the original's two.
- Re-detecting and updating an existing banner in place.
