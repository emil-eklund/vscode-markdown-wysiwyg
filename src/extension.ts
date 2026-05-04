import * as vscode from 'vscode';
import { MarkdownWysiwygEditorProvider } from './markdownEditorProvider';
import type { EditorCommand } from './protocol';

const FORMAT_COMMANDS: ReadonlyArray<EditorCommand> = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'undo',
  'redo',
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'quote',
  'unorderedList',
  'orderedList',
  'link'
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(MarkdownWysiwygEditorProvider.register(context));

  for (const cmd of FORMAT_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`markdownWysiwyg.format.${cmd}`, () => {
        MarkdownWysiwygEditorProvider.sendCommand(cmd);
      })
    );
  }

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
