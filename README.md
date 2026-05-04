# Markdown WYSIWYG

Edit Markdown files directly in VS Code with a rich text editor — no more tabbing in and out of preview mode.

## Features

- WYSIWYG Markdown editing powered by [Toast UI Editor](https://ui.toast.com/tui-editor).
- Integrates with VS Code's normal document lifecycle:
  - Edits mark the document as **dirty**.
  - **Saving requires `Ctrl+S` / `Cmd+S`** (no auto-save).
  - Undo/redo, hot-exit, file watchers — all work as usual.
- Follows your active VS Code color theme (light, dark, high contrast).
- Open via the editor title bar, the explorer context menu, or the command palette:
  - **Markdown: Open in WYSIWYG Editor**
  - **Markdown: Open Source Editor** (to switch back)
- Source editor remains the default — opt in per file.

## Develop

```bash
npm install
npm run build      # one-shot build
npm run watch      # incremental build for F5 development
```

Press `F5` in VS Code to launch the Extension Development Host, then open any `.md` file and run **Markdown: Open in WYSIWYG Editor**.

## Architecture

- `src/extension.ts` — activation + commands.
- `src/markdownEditorProvider.ts` — `CustomTextEditorProvider` that owns the `TextDocument` lifecycle and bridges it with the webview via `postMessage`. Edits from the webview are applied via `WorkspaceEdit`, so dirty state and save behavior match a normal text editor.
- `media/editor.ts` — webview entry that hosts Toast UI Editor.
- `media/editor.css` — overrides Toast UI styles using `--vscode-*` CSS variables for theme-aware rendering.

## Notes / known limitations

- Switching from WYSIWYG markdown back to text can produce equivalent but not byte-identical Markdown (e.g. `*` vs `_` for emphasis). The displayed content is preserved, but formatting style of source may normalize on edit.
- Cursor position resets when the document is updated externally.
