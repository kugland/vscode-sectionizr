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
    .join(" ");
}

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
    return [rule, prefix + center(text, centerWidth, " ") + suffix, rule];
  }

  return [prefix + center(` ${title} `, centerWidth, fill) + suffix];
}
