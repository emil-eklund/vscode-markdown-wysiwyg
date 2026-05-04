# Markdown WYSIWYG

Edit Markdown files directly in VS Code with a rich text editor — no more tabbing in and out of preview mode.

Built on [Lexical](https://lexical.dev/), themed to follow VS Code's color theme, with optional **inline AI completions** powered by the built-in [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model) (e.g. GitHub Copilot).

## Features

- WYSIWYG Markdown editing (headings, lists, quotes, code blocks, links, inline marks).
- Live Markdown shortcuts (`# `, `- `, `> `, ``` ``` ```, `**bold**`, etc.).
- Standard document lifecycle: edits mark the document **dirty**, **`Ctrl+S` / `Cmd+S` to save** — never auto-saved.
- Inline AI suggestions as ghost text — **Tab** to accept, **Esc** to dismiss, any further typing dismisses.
- Theme-aware (light, dark, high contrast) via `--vscode-*` CSS variables.
- Source editor remains the default — opt in per file via:
  - **Markdown: Open in WYSIWYG Editor**
  - **Markdown: Open Source Editor**

## Inline AI suggestions

Suggestions are requested from the first available chat model registered with VS Code (`vscode.lm.selectChatModels`). To use them you need a provider extension installed (e.g. **GitHub Copilot**).

Settings (`Settings → Extensions → Markdown WYSIWYG`):

| Setting | Default | Description |
| --- | --- | --- |
| `markdownWysiwyg.inlineSuggestions.enabled` | `true` | Toggle ghost-text suggestions. |
| `markdownWysiwyg.inlineSuggestions.debounceMs` | `600` | Idle time before requesting a suggestion. |
| `markdownWysiwyg.inlineSuggestions.model` | `""` | Preferred model family (empty = first available). |
| `markdownWysiwyg.inlineSuggestions.maxTokens` | `80` | Approximate maximum suggestion length. |

VS Code will prompt for consent the first time a model is used.

## Develop

```bash
npm install
npm run build      # one-shot build
npm run watch      # incremental build for F5 development
```

Press **F5** in VS Code to launch the Extension Development Host, open any `.md` file, and run **Markdown: Open in WYSIWYG Editor**.

## Architecture

- `src/extension.ts` — activation + commands.
- `src/markdownEditorProvider.ts` — `CustomTextEditorProvider`. Owns the `TextDocument`, syncs it with the webview via `postMessage`, and proxies suggestion requests to the language model service. Webview edits flow through `WorkspaceEdit`, so dirty state and save behavior match a normal text editor.
- `src/suggestionService.ts` — wraps `vscode.lm.selectChatModels` + `sendRequest` with a writing-assistant prompt and output sanitization.
- `media/editor.tsx` — React entry that mounts the Lexical editor.
- `media/MarkdownEditor.tsx` — Lexical composer + plugins (rich text, history, lists, links, markdown shortcuts, sync, suggestions).
- `media/plugins/MarkdownSyncPlugin.ts` — bridges Lexical's editor state with the document text via `@lexical/markdown` `$convertFromMarkdownString` / `$convertToMarkdownString`.
- `media/plugins/InlineSuggestionPlugin.ts` — debounced suggestion requests, ghost-text insertion, Tab/Esc handling.
- `media/nodes/GhostSuggestionNode.ts` — Lexical `DecoratorNode` that renders inline ghost text and is excluded from markdown serialization.
- `media/editor.css` — theming via `--vscode-*` CSS variables.

## Notes / known limitations

- Round-tripping through `@lexical/markdown` normalizes some syntax (e.g. emphasis style). Content is preserved; exact byte-formatting may not be.
- Cursor position resets when the document is updated externally (e.g. by another editor saving over it).
- Suggestions require a language model provider extension; without one the editor still works as a normal WYSIWYG editor.
