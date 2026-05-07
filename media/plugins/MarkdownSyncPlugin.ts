import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS
} from '@lexical/markdown';
import { useEffect, useRef } from 'react';
import { getVsCodeApi, type ExtensionToWebview } from '../vscodeApi';

interface Props {
  onConfig: (cfg: { enabled: boolean; debounceMs: number }) => void;
}

export const EXTERNAL_TAG = 'mwy-external';
export const SUGGESTION_TAG = 'mwy-suggestion';

/**
 * Bridges Lexical's editor state with the VS Code TextDocument:
 * - Receives `init` / `externalUpdate` and rebuilds the editor state from markdown.
 * - On user edits, serializes back to markdown and posts an `edit` message.
 * Edits made by the suggestion plugin (tagged) are also synced; ghost-text nodes
 * are excluded from serialization by the node itself.
 */
export function MarkdownSyncPlugin({ onConfig }: Props): null {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);
  const lastSerializedRef = useRef<string>('');

  useEffect(() => {
    const vscode = getVsCodeApi();

    function handler(event: MessageEvent<ExtensionToWebview>) {
      const msg = event.data;
      if (!msg) return;
      switch (msg.type) {
        case 'init':
          onConfig(msg.suggestionConfig);
          applyExternalText(msg.text);
          initializedRef.current = true;
          break;
        case 'externalUpdate':
          applyExternalText(msg.text);
          break;
        case 'configUpdate':
          onConfig(msg.suggestionConfig);
          break;
      }
    }

    function applyExternalText(text: string) {
      // Lexical always serializes with LF; the host doc may use CRLF. Compare
      // and parse on a normalized version so EOL alone never forces a rebuild.
      const normalized = text.replace(/\r\n/g, '\n');
      if (normalized === lastSerializedRef.current && initializedRef.current) {
        return;
      }
      editor.update(
        () => {
          // $convertFromMarkdownString replaces the root's contents, which
          // also drops any inline ghost-suggestion nodes.
          $convertFromMarkdownString(normalized, TRANSFORMERS);
          lastSerializedRef.current = normalized;
        },
        { tag: EXTERNAL_TAG, discrete: true }
      );
    }

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });

    const unregister = editor.registerUpdateListener(({ editorState, tags }) => {
      if (tags.has(EXTERNAL_TAG)) {
        return;
      }
      // Serialize to markdown. Ghost nodes are excluded automatically.
      editorState.read(() => {
        const md = $convertToMarkdownString(TRANSFORMERS);
        if (md === lastSerializedRef.current) {
          return;
        }
        lastSerializedRef.current = md;
        vscode.postMessage({ type: 'edit', text: md });
      });
    });

    return () => {
      window.removeEventListener('message', handler);
      unregister();
    };
  }, [editor, onConfig]);

  return null;
}
