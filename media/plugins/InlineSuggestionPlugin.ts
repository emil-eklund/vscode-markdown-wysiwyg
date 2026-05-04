import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalNode,
  type NodeKey
} from 'lexical';
import { useEffect, useRef } from 'react';
import {
  $createGhostSuggestionNode,
  $isGhostSuggestionNode,
  GhostSuggestionNode
} from '../nodes/GhostSuggestionNode';
import { getVsCodeApi, type ExtensionToWebview } from '../vscodeApi';
import { EXTERNAL_TAG, SUGGESTION_TAG } from './MarkdownSyncPlugin';

interface Config {
  enabled: boolean;
  debounceMs: number;
}

interface Props {
  config: Config;
}

/**
 * Inline AI suggestions plugin.
 *
 * Strategy:
 * - Whenever the user pauses editing (debounced) and the selection is collapsed
 *   at the end of a text node (i.e. typing forward), request a continuation
 *   from the extension (which calls vscode.lm).
 * - The returned text is rendered as a non-editable `GhostSuggestionNode`
 *   inserted at the cursor.
 * - Tab accepts (replaces ghost with a real text node and moves caret).
 * - Esc, selection change, or any further editing dismisses the ghost.
 */
export function InlineSuggestionPlugin({ config }: Props): null {
  const [editor] = useLexicalComposerContext();
  const requestIdRef = useRef(0);
  const ghostKeyRef = useRef<NodeKey | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!editor.hasNodes([GhostSuggestionNode])) {
      // Editor was constructed without our node; nothing to do.
      return;
    }

    const vscode = getVsCodeApi();

    function clearTimer() {
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
    }

    function dismissGhost() {
      const key = ghostKeyRef.current;
      ghostKeyRef.current = null;
      if (key === null) return;
      editor.update(
        () => {
          const node = $getNodeByKey(key);
          if (node && $isGhostSuggestionNode(node)) {
            node.remove();
          }
        },
        { tag: SUGGESTION_TAG }
      );
    }

    function acceptGhost(): boolean {
      const key = ghostKeyRef.current;
      if (key === null) return false;
      let accepted = false;
      editor.update(() => {
        const node = $getNodeByKey(key);
        if (!node || !$isGhostSuggestionNode(node)) return;
        const textNode = $createTextNode(node.getSuggestionText());
        node.replace(textNode);
        textNode.selectEnd();
        accepted = true;
      });
      ghostKeyRef.current = null;
      return accepted;
    }

    function scheduleRequest() {
      clearTimer();
      if (!config.enabled) return;
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = undefined;
        sendRequest();
      }, Math.max(100, config.debounceMs));
    }

    function sendRequest() {
      const snapshot = editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) {
          return null;
        }
        // Compute prefix/suffix as the linearized text content split at the cursor.
        const root = $getRoot();
        const anchor = sel.anchor;
        const anchorNode = anchor.getNode();
        const anchorOffset = anchor.offset;

        let prefix = '';
        let suffix = '';
        let foundAnchor = false;

        function visit(node: LexicalNode) {
          if ($isGhostSuggestionNode(node)) {
            return;
          }
          if ('getChildren' in node && typeof (node as { getChildren?: unknown }).getChildren === 'function') {
            const children = (node as unknown as { getChildren: () => LexicalNode[] }).getChildren();
            for (const child of children) {
              visit(child);
            }
            // Treat top-level block as a paragraph break for context.
            if (node.getParent && node.getParent() === root) {
              const sep = '\n\n';
              if (foundAnchor) suffix += sep;
              else prefix += sep;
            }
            return;
          }
          const text = node.getTextContent();
          if (node === anchorNode) {
            prefix += text.slice(0, anchorOffset);
            suffix += text.slice(anchorOffset);
            foundAnchor = true;
          } else if (foundAnchor) {
            suffix += text;
          } else {
            prefix += text;
          }
        }

        for (const child of root.getChildren()) {
          visit(child);
        }
        // Trim trailing block separators we may have appended after last block.
        prefix = prefix.replace(/\n+$/, '');
        suffix = suffix.replace(/^\n+/, '');
        return { prefix, suffix };
      });

      if (!snapshot) return;
      // Don't ask for suggestions for empty docs.
      if (!snapshot.prefix && !snapshot.suffix) return;

      const id = ++requestIdRef.current;
      vscode.postMessage({
        type: 'requestSuggestion',
        request: { id, prefix: snapshot.prefix, suffix: snapshot.suffix }
      });
    }

    function handleMessage(event: MessageEvent<ExtensionToWebview>) {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'suggestion' && msg.id === requestIdRef.current) {
        if (!msg.text) return;
        editor.update(
          () => {
            const sel = $getSelection();
            if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
            // Remove any stale ghost first.
            if (ghostKeyRef.current !== null) {
              const stale = $getNodeByKey(ghostKeyRef.current);
              if (stale && $isGhostSuggestionNode(stale)) {
                stale.remove();
              }
              ghostKeyRef.current = null;
            }
            const ghost = $createGhostSuggestionNode(msg.text);
            sel.insertNodes([ghost]);
            ghostKeyRef.current = ghost.getKey();
            // Move selection back before the ghost so the user keeps typing in place.
            const prev = ghost.getPreviousSibling();
            if (prev && 'selectEnd' in prev && typeof (prev as { selectEnd?: unknown }).selectEnd === 'function') {
              (prev as unknown as { selectEnd: () => void }).selectEnd();
            } else {
              ghost.selectPrevious();
            }
          },
          { tag: SUGGESTION_TAG }
        );
      } else if (msg.type === 'suggestionError') {
        // Silently ignore — we don't want the editor flashing errors per keystroke.
        // The user can check the developer console / settings.
        // eslint-disable-next-line no-console
        console.warn('[markdown-wysiwyg] suggestion error:', msg.message);
      }
    }

    window.addEventListener('message', handleMessage);

    const unregisterUpdate = editor.registerUpdateListener(({ tags }) => {
      if (tags.has(SUGGESTION_TAG)) {
        return;
      }
      // Any other change (typing, selection move, external) invalidates an outstanding suggestion.
      if (ghostKeyRef.current !== null) {
        const id = requestIdRef.current;
        getVsCodeApi().postMessage({ type: 'cancelSuggestion', id });
        dismissGhost();
      }
      // Don't request suggestions in response to programmatic / external edits.
      if (tags.has(EXTERNAL_TAG)) {
        return;
      }
      scheduleRequest();
    });

    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (ghostKeyRef.current === null) return false;
        event?.preventDefault();
        return acceptGhost();
      },
      COMMAND_PRIORITY_HIGH
    );

    const unregisterEsc = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (ghostKeyRef.current === null) return false;
        getVsCodeApi().postMessage({ type: 'cancelSuggestion', id: requestIdRef.current });
        dismissGhost();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      clearTimer();
      window.removeEventListener('message', handleMessage);
      unregisterUpdate();
      unregisterTab();
      unregisterEsc();
    };
  }, [editor, config.enabled, config.debounceMs]);

  return null;
}
