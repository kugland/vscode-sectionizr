import * as vscode from "vscode";

import { resolveFormat, resolveWidth } from "./config";
import { buildTitle, render } from "./format";
import {
  assembleSection,
  expandTabs,
  leadingWhitespace,
  mergeRanges,
  type LineRange,
} from "./layout";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("sectionizr.createSection0", () =>
      createSection(0),
    ),
    vscode.commands.registerCommand("sectionizr.createSection1", () =>
      createSection(1),
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up; all disposables are owned by the context.
}

function tabSizeOf(editor: vscode.TextEditor): number {
  const { tabSize } = editor.options;
  return typeof tabSize === "number" ? tabSize : 4;
}

async function createSection(level: 0 | 1): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const scope = { uri: document.uri, languageId: document.languageId };
  const editorConfig = vscode.workspace.getConfiguration("editor", scope);
  const ownConfig = vscode.workspace.getConfiguration("sectionizr", scope);

  const format = resolveFormat(
    document.languageId,
    ownConfig.get<Record<string, unknown>>("formats", {}),
  );
  if (!format) {
    void vscode.window.showWarningMessage(
      `Sectionizr: no comment format for language "${document.languageId}". ` +
        'Add one under the "sectionizr.formats" setting.',
    );
    return;
  }

  const width = resolveWidth(
    editorConfig.get("rulers"),
    editorConfig.get("wordWrapColumn"),
  );
  const tabSize = tabSizeOf(editor);
  const uppercaseLevel0 = ownConfig.get<boolean>("uppercaseLevel0", true);
  const blankLines = ownConfig.get<boolean>("blankLines", true);
  const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";

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
  const applied = await editor.edit((builder) => {
    for (const edit of edits) {
      builder.replace(edit.range, edit.text);
    }
  });
  if (!applied) {
    void vscode.window.showWarningMessage(
      "Sectionizr: the edit could not be applied (the document may be read-only).",
    );
  }
}
