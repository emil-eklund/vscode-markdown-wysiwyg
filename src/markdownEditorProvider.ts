import * as vscode from 'vscode';
import type { EditorCommand, ExtensionToWebview, SuggestionConfig, WebviewToExtension } from './protocol';
import { SuggestionService } from './suggestionService';

const CONFIG_SECTION = 'markdownWysiwyg';

export class MarkdownWysiwygEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markdownWysiwyg.editor';

  private static activePanel: vscode.WebviewPanel | undefined;

  /**
   * Sends a command to the currently focused WYSIWYG editor webview, if any.
   * Used by VS Code commands bound to keybindings (e.g. Ctrl+B).
   */
  public static sendCommand(command: EditorCommand): boolean {
    const panel = MarkdownWysiwygEditorProvider.activePanel;
    if (!panel) return false;
    void panel.webview.postMessage({ type: 'command', command } satisfies ExtensionToWebview);
    return true;
  }

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

  private readonly suggestions = new SuggestionService();

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

    if (webviewPanel.active) {
      MarkdownWysiwygEditorProvider.activePanel = webviewPanel;
    }
    const viewStateSub = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        MarkdownWysiwygEditorProvider.activePanel = webviewPanel;
      } else if (MarkdownWysiwygEditorProvider.activePanel === webviewPanel) {
        MarkdownWysiwygEditorProvider.activePanel = undefined;
      }
    });

    let lastSyncedText = document.getText();
    let lastWebviewText = lastSyncedText;
    let isApplyingFromWebview = false;
    let activeSuggestion: { id: number; cts: vscode.CancellationTokenSource } | undefined;

    const send = (msg: ExtensionToWebview) => {
      void webview.postMessage(msg);
    };

    const cancelActiveSuggestion = () => {
      if (activeSuggestion) {
        activeSuggestion.cts.cancel();
        activeSuggestion.cts.dispose();
        activeSuggestion = undefined;
      }
    };

    const changeDocSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (isApplyingFromWebview) {
        lastSyncedText = e.document.getText();
        return;
      }
      const text = e.document.getText();
      if (text === lastSyncedText) {
        return;
      }
      lastSyncedText = text;
      lastWebviewText = text;
      send({ type: 'externalUpdate', text });
    });

    const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        send({ type: 'configUpdate', suggestionConfig: this.getSuggestionConfig() });
      }
    });

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToExtension) => {
      switch (msg.type) {
        case 'ready':
          lastSyncedText = document.getText();
          lastWebviewText = lastSyncedText;
          send({
            type: 'init',
            text: lastSyncedText,
            suggestionConfig: this.getSuggestionConfig()
          });
          break;

        case 'edit':
          cancelActiveSuggestion();
          if (msg.text === lastWebviewText) {
            return;
          }
          lastWebviewText = msg.text;
          await this.replaceDocumentContent(
            document,
            msg.text,
            () => {
              isApplyingFromWebview = true;
            },
            () => {
              isApplyingFromWebview = false;
            }
          );
          break;

        case 'cancelSuggestion':
          if (activeSuggestion?.id === msg.id) {
            cancelActiveSuggestion();
          }
          break;

        case 'requestSuggestion': {
          if (!this.isSuggestionsEnabled()) {
            return;
          }
          cancelActiveSuggestion();
          const cts = new vscode.CancellationTokenSource();
          activeSuggestion = { id: msg.request.id, cts };
          try {
            const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
            const text = await this.suggestions.getSuggestion(
              msg.request.prefix,
              msg.request.suffix,
              {
                modelFamily: config.get<string>('inlineSuggestions.model', ''),
                maxTokens: config.get<number>('inlineSuggestions.maxTokens', 80)
              },
              cts.token
            );
            if (cts.token.isCancellationRequested || activeSuggestion?.id !== msg.request.id) {
              return;
            }
            send({ type: 'suggestion', id: msg.request.id, text });
          } catch (err) {
            if (cts.token.isCancellationRequested) {
              return;
            }
            const message = err instanceof Error ? err.message : String(err);
            send({ type: 'suggestionError', id: msg.request.id, message });
          } finally {
            if (activeSuggestion?.id === msg.request.id) {
              activeSuggestion.cts.dispose();
              activeSuggestion = undefined;
            }
          }
          break;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      if (MarkdownWysiwygEditorProvider.activePanel === webviewPanel) {
        MarkdownWysiwygEditorProvider.activePanel = undefined;
      }
      cancelActiveSuggestion();
      viewStateSub.dispose();
      changeDocSub.dispose();
      configSub.dispose();
      messageSub.dispose();
    });
  }

  private isSuggestionsEnabled(): boolean {
    return vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<boolean>('inlineSuggestions.enabled', true);
  }

  private getSuggestionConfig(): SuggestionConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
      enabled: config.get<boolean>('inlineSuggestions.enabled', true),
      debounceMs: config.get<number>('inlineSuggestions.debounceMs', 600)
    };
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
  <div id="root"></div>
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
