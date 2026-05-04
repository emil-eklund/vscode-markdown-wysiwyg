import * as vscode from 'vscode';
import type { ExtensionToWebview, WebviewToExtension } from './protocol';

export class MarkdownWysiwygEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markdownWysiwyg.editor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownWysiwygEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MarkdownWysiwygEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')]
    };

    webview.html = this.getHtml(webview);

    // Track the last text we sent the webview, so we can avoid round-trip
    // updates when the document changes because of our own applyEdit.
    let lastSyncedText = document.getText();
    // Track the latest text the webview has reported, so we can dedupe edits.
    let lastWebviewText = lastSyncedText;
    let isApplyingFromWebview = false;

    const send = (msg: ExtensionToWebview) => {
      void webview.postMessage(msg);
    };

    const post = (text: string) => {
      lastSyncedText = text;
      lastWebviewText = text;
      send({ type: 'externalUpdate', text });
    };

    const changeDocSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (isApplyingFromWebview) {
        // This change originated from the webview; just track it.
        lastSyncedText = e.document.getText();
        return;
      }
      const text = e.document.getText();
      if (text === lastSyncedText) {
        return;
      }
      post(text);
    });

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToExtension) => {
      switch (msg.type) {
        case 'ready':
          lastSyncedText = document.getText();
          lastWebviewText = lastSyncedText;
          send({ type: 'init', text: lastSyncedText });
          break;
        case 'edit':
          if (msg.text === lastWebviewText) {
            return;
          }
          lastWebviewText = msg.text;
          await this.replaceDocumentContent(document, msg.text, () => {
            isApplyingFromWebview = true;
          }, () => {
            isApplyingFromWebview = false;
          });
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocSub.dispose();
      messageSub.dispose();
    });
  }

  private async replaceDocumentContent(
    document: vscode.TextDocument,
    newText: string,
    onBefore: () => void,
    onAfter: () => void
  ): Promise<void> {
    if (document.getText() === newText) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, newText);
    onBefore();
    try {
      await vscode.workspace.applyEdit(edit);
    } finally {
      // Defer clearing the flag until after the change event fires.
      setTimeout(onAfter, 0);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'editor.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'editor.css')
    );

    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Markdown WYSIWYG</title>
</head>
<body>
  <div id="editor"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
