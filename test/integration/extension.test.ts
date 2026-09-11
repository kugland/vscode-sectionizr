import * as assert from "node:assert";
import * as vscode from "vscode";

async function openPythonDocument(content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    language: "python",
    content,
  });
  return vscode.window.showTextDocument(document);
}

describe("sectionizr", () => {
  before(async () => {
    // The extension host may still be finishing extension registration when
    // the first test's assertions run. Force activation explicitly so every
    // test in this suite observes a fully activated extension.
    const extension = vscode.extensions.getExtension("kugland.sectionizr");
    assert.ok(
      extension,
      "expected the kugland.sectionizr extension to be discoverable",
    );
    await extension!.activate();
  });

  it("registers both commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("sectionizr.createSection0"));
    assert.ok(commands.includes("sectionizr.createSection1"));
  });

  it("replaces the cursor line with a level 0 banner", async () => {
    const editor = await openPythonDocument("my section\n");
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand("sectionizr.createSection0");

    const lines = editor.document.getText().split("\n");
    // blank, rule, title, rule, blank, then the document's original trailing line
    assert.strictEqual(lines[0], "");
    assert.strictEqual(lines[1], "#".repeat(79));
    assert.strictEqual(lines[2].length, 79);
    assert.ok(lines[2].includes("MY SECTION"));
    assert.strictEqual(lines[3], "#".repeat(79));
    assert.strictEqual(lines[4], "");
  });

  it("replaces the cursor line with a level 1 banner", async () => {
    const editor = await openPythonDocument("my section\n");
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand("sectionizr.createSection1");

    const lines = editor.document.getText().split("\n");
    assert.strictEqual(lines[1].length, 79);
    assert.ok(lines[1].includes(" my section "));
  });

  it("produces one banner per cursor with a multi-cursor invocation", async () => {
    const editor = await openPythonDocument("alpha\nbeta\ngamma\ndelta\n");
    const scope = editor.document.uri;
    await vscode.workspace
      .getConfiguration("editor", scope)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    // Disable blank-line padding so each cursor's banner replaces exactly
    // its own line, keeping the resulting line indices easy to reason about.
    await vscode.workspace
      .getConfiguration("sectionizr", scope)
      .update("blankLines", false, vscode.ConfigurationTarget.Global);

    try {
      editor.selections = [
        new vscode.Selection(0, 0, 0, 0),
        new vscode.Selection(2, 0, 2, 0),
      ];

      await vscode.commands.executeCommand("sectionizr.createSection1");

      const lines = editor.document.getText().split("\n");
      assert.ok(lines[0].includes(" alpha "), JSON.stringify(lines));
      assert.strictEqual(lines[1], "beta");
      assert.ok(lines[2].includes(" gamma "), JSON.stringify(lines));
      assert.strictEqual(lines[3], "delta");
    } finally {
      await vscode.workspace
        .getConfiguration("sectionizr", scope)
        .update("blankLines", undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // This test requires a display capable of real window focus. It is known
  // to fail in headless or no-window-manager hosts (including bare Xvfb
  // without a WM), because VS Code's focused-editor tracking — which the
  // built-in `undo` command depends on — never activates there: no real
  // top-level window ever gets mapped/focused, so `codeEditorService`
  // never has a focused code editor for `undo` to act on, and `undo`
  // becomes a silent no-op regardless of which extension (if any) made the
  // edit. A failure here on such a host is an environment limitation, not
  // a product regression. Verified directly: an equivalent single, non-
  // multi-cursor `editor.edit()` call with no Sectionizr code involved at
  // all reproduces the identical no-op under the same conditions.
  //
  // The property this test guards is nonetheless structurally guaranteed
  // by `createSection` in src/extension.ts, which wraps every range's
  // `builder.replace` inside exactly one awaited `editor.edit()` call —
  // by construction, VS Code can only ever record that as a single undo
  // stop.
  it("undoes an entire multi-cursor invocation in a single step", async () => {
    const original = "alpha\nbeta\ngamma\ndelta\n";
    const editor = await openPythonDocument(original);
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);

    editor.selections = [
      new vscode.Selection(0, 0, 0, 0),
      new vscode.Selection(2, 0, 2, 0),
    ];

    await vscode.commands.executeCommand("sectionizr.createSection1");
    assert.notStrictEqual(editor.document.getText(), original);

    // 'undo' targets whichever editor currently holds focus. This attempts
    // to establish that focus explicitly; it does not fix the issue on a
    // host with no mapped window (see comment above the test) but is kept
    // since it is harmless and may matter on hosts with unusual initial
    // focus.
    await vscode.window.showTextDocument(editor.document);
    await vscode.commands.executeCommand(
      "workbench.action.focusActiveEditorGroup",
    );
    await vscode.commands.executeCommand("undo");

    assert.strictEqual(editor.document.getText(), original);
  });

  it("renders a plain divider for a blank line, not a banner with an empty title", async () => {
    const editor = await openPythonDocument("   \n");
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand("sectionizr.createSection0");

    const contentLines = editor.document
      .getText()
      .split("\n")
      .filter((line) => line.trim().length > 0);
    assert.strictEqual(contentLines.length, 1, JSON.stringify(contentLines));
    // A plain divider is fill characters only: no centered title text.
    assert.ok(
      /^#+$/.test(contentLines[0].trim()),
      JSON.stringify(contentLines),
    );
  });

  it("preserves indentation and shrinks the banner to compensate", async () => {
    const editor = await openPythonDocument("    my section\n");
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand("sectionizr.createSection1");

    const lines = editor.document.getText().split("\n");
    const bannerLine = lines.find((line) => line.includes("my section"));
    assert.ok(bannerLine, JSON.stringify(lines));
    assert.ok(bannerLine!.startsWith("    "), JSON.stringify(bannerLine));
    // 79 columns unindented; 4 columns of indent plus a banner shrunk by 4
    // columns (75) lands on the same total column as the unindented banner.
    assert.strictEqual(bannerLine!.length, 79);
  });

  it("makes no edit when the language has no configured comment format", async () => {
    const original = "my section\n";
    const document = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content: original,
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand("sectionizr.createSection0");

    assert.strictEqual(editor.document.getText(), original);
  });

  it("does not inject a bare LF into a CRLF document", async () => {
    const editor = await openPythonDocument("my section\n");
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.CRLF));
    assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF);

    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("sectionizr.createSection0");

    const text = editor.document.getText();
    assert.strictEqual(/(?<!\r)\n/.test(text), false, JSON.stringify(text));
  });

  it("renders with an overridden comment format from sectionizr.formats", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content: "my section\n",
    });
    const editor = await vscode.window.showTextDocument(document);
    const scope = editor.document.uri;
    await vscode.workspace
      .getConfiguration("editor", scope)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    // 'plaintext' has no built-in entry in DEFAULT_FORMATS, so this exercises
    // the override path end-to-end: a wrong setting key here would surface as
    // the "unsupported language" warning and no edit, not a subtle mismatch.
    await vscode.workspace
      .getConfiguration("sectionizr", scope)
      .update(
        "formats",
        { plaintext: { prefix: ";;", fill: ";", suffix: ";;" } },
        vscode.ConfigurationTarget.Global,
      );

    try {
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      await vscode.commands.executeCommand("sectionizr.createSection1");

      const lines = editor.document.getText().split("\n");
      const bannerLine = lines.find((line) => line.includes("my section"));
      assert.ok(bannerLine, JSON.stringify(lines));
      assert.ok(bannerLine!.startsWith(";;"), JSON.stringify(bannerLine));
      assert.ok(bannerLine!.endsWith(";;"), JSON.stringify(bannerLine));
      assert.ok(bannerLine!.includes(";;;"), JSON.stringify(bannerLine));
    } finally {
      await vscode.workspace
        .getConfiguration("sectionizr", scope)
        .update("formats", undefined, vscode.ConfigurationTarget.Global);
    }
  });

  it("keeps the title case when sectionizr.uppercaseLevel0 is false", async () => {
    const editor = await openPythonDocument("My Section\n");
    const scope = editor.document.uri;
    await vscode.workspace
      .getConfiguration("editor", scope)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration("sectionizr", scope)
      .update("uppercaseLevel0", false, vscode.ConfigurationTarget.Global);

    try {
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      await vscode.commands.executeCommand("sectionizr.createSection0");

      const lines = editor.document.getText().split("\n");
      assert.ok(
        lines.some((line) => line.includes("My Section")),
        JSON.stringify(lines),
      );
      assert.ok(
        !lines.some((line) => line.includes("MY SECTION")),
        JSON.stringify(lines),
      );
    } finally {
      await vscode.workspace
        .getConfiguration("sectionizr", scope)
        .update(
          "uppercaseLevel0",
          undefined,
          vscode.ConfigurationTarget.Global,
        );
    }
  });

  it("collapses a multi-line selection into one banner using every non-blank line", async () => {
    const editor = await openPythonDocument(
      "first line\nsecond line\nthird line\n",
    );
    await vscode.workspace
      .getConfiguration("editor", editor.document.uri)
      .update("rulers", [80], vscode.ConfigurationTarget.Global);
    editor.selection = new vscode.Selection(0, 0, 2, "third line".length);

    await vscode.commands.executeCommand("sectionizr.createSection1");

    const lines = editor.document.getText().split("\n");
    // The whole three-line selection collapses to one banner line: blank,
    // banner, blank, then the document's original trailing line.
    assert.strictEqual(lines[0], "");
    assert.ok(
      lines[1].includes("first line second line third line"),
      JSON.stringify(lines),
    );
    assert.strictEqual(lines[2], "");
    assert.strictEqual(lines.length, 4, JSON.stringify(lines));
  });

  it("produces a sane banner when editor.rulers is unset, via the default-width fallback", async () => {
    const editor = await openPythonDocument("my section\n");
    const editorConfig = vscode.workspace.getConfiguration(
      "editor",
      editor.document.uri,
    );
    // Every other test in this file pins editor.rulers to [80], which masks
    // resolveWidth()'s fallback chain. Unset both rulers and wordWrapColumn
    // here so this test actually exercises the path a default-settings user
    // takes: rulers -> wordWrapColumn -> DEFAULT_WIDTH (80).
    await editorConfig.update(
      "rulers",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await editorConfig.update(
      "wordWrapColumn",
      undefined,
      vscode.ConfigurationTarget.Global,
    );

    try {
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      await vscode.commands.executeCommand("sectionizr.createSection1");

      const lines = editor.document.getText().split("\n");
      const bannerLine = lines.find((line) => line.includes(" my section "));
      assert.ok(bannerLine, JSON.stringify(lines));
      // DEFAULT_WIDTH is 80; banners render one column short of the target.
      assert.strictEqual(bannerLine!.length, 79);
    } finally {
      // Restore the pin the rest of this file relies on.
      await editorConfig.update(
        "rulers",
        [80],
        vscode.ConfigurationTarget.Global,
      );
    }
  });
});
