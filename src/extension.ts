import * as vscode from 'vscode';
import { MarkdownWysiwygEditorProvider } from './markdownEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(MarkdownWysiwygEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownWysiwyg.openEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage('No Markdown file is active.');
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        MarkdownWysiwygEditorProvider.viewType
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownWysiwyg.openSourceEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, 'default');
    })
  );
}

export function deactivate(): void {
  // nothing
}
