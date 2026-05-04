import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import './editor.css';

type ExtensionToWebview =
  | { type: 'init'; text: string }
  | { type: 'externalUpdate'; text: string };

type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'edit'; text: string };

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToExtension): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
};

const vscode = acquireVsCodeApi();

function isDarkTheme(): boolean {
  return (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  );
}

const container = document.getElementById('editor') as HTMLDivElement;

let suppressNextChange = false;
let lastSentText = '';
let editor: Editor | null = null;

const editorTheme = isDarkTheme() ? 'dark' : 'light';

editor = new Editor({
  el: container,
  height: '100%',
  initialEditType: 'wysiwyg',
  previewStyle: 'vertical',
  usageStatistics: false,
  theme: editorTheme,
  hideModeSwitch: false,
  initialValue: ''
});

let editTimer: number | undefined;
function scheduleEdit() {
  if (editTimer !== undefined) {
    window.clearTimeout(editTimer);
  }
  editTimer = window.setTimeout(() => {
    editTimer = undefined;
    if (!editor) {
      return;
    }
    const text = editor.getMarkdown();
    if (text === lastSentText) {
      return;
    }
    lastSentText = text;
    vscode.postMessage({ type: 'edit', text });
  }, 150);
}

editor.on('change', () => {
  if (suppressNextChange) {
    return;
  }
  scheduleEdit();
});

function applyExternalText(text: string) {
  if (!editor) {
    return;
  }
  if (editor.getMarkdown() === text) {
    lastSentText = text;
    return;
  }
  suppressNextChange = true;
  try {
    // setMarkdown(text, cursorToEnd=false) preserves scroll roughly; cursor will reset.
    editor.setMarkdown(text, false);
    lastSentText = text;
  } finally {
    // Allow the synchronous 'change' from setMarkdown to be ignored, then re-enable.
    setTimeout(() => {
      suppressNextChange = false;
    }, 0);
  }
}

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init':
    case 'externalUpdate':
      applyExternalText(msg.text);
      break;
  }
});

// React to VS Code theme changes by reloading editor with new theme.
const themeObserver = new MutationObserver(() => {
  if (!editor) {
    return;
  }
  const desired = isDarkTheme() ? 'dark' : 'light';
  // Toast UI doesn't support runtime theme switching cleanly; rebuild.
  if (
    (desired === 'dark' && !container.querySelector('.toastui-editor-dark')) ||
    (desired === 'light' && container.querySelector('.toastui-editor-dark'))
  ) {
    const current = editor.getMarkdown();
    editor.destroy();
    editor = new Editor({
      el: container,
      height: '100%',
      initialEditType: 'wysiwyg',
      previewStyle: 'vertical',
      usageStatistics: false,
      theme: desired,
      hideModeSwitch: false,
      initialValue: current
    });
    editor.on('change', () => {
      if (suppressNextChange) {
        return;
      }
      scheduleEdit();
    });
  }
});
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

vscode.postMessage({ type: 'ready' });
