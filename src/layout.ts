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
    width += char === "\t" ? stop - (width % stop) : 1;
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
  return blankLines ? ["", ...body, ""] : body;
}
