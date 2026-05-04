import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type ElementNode,
  type TextFormatType
} from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode
} from '@lexical/list';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link';
import { $findMatchingParent, $getNearestNodeOfType } from '@lexical/utils';
import { useEffect } from 'react';
import { getVsCodeApi, type ExtensionToWebview } from '../vscodeApi';

/**
 * Listens for `command` messages from the extension host (triggered by
 * VS Code keybindings) and dispatches the equivalent editor action.
 *
 * This is necessary because VS Code captures keystrokes like Ctrl+B / Ctrl+I
 * before they ever reach the contenteditable element.
 */
export function CommandBridgePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    function handler(event: MessageEvent<ExtensionToWebview>) {
      const msg = event.data;
      if (!msg || msg.type !== 'command') return;
      runCommand(msg.command);
    }

    function format(f: TextFormatType) {
      // Save selection before formatting
      let anchor: any = null;
      let focus: any = null;
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (sel && typeof sel === 'object' && 'anchor' in sel && 'focus' in sel) {
          anchor = sel.anchor;
          focus = sel.focus;
        }
      });
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, f);
      // Restore selection after a short delay to allow format to apply
      setTimeout(() => {
        if (anchor && focus) {
          editor.update(() => {
            const sel = $getSelection();
            if (sel && typeof sel === 'object' && 'anchor' in sel && 'focus' in sel) {
              (sel.anchor as any).set(anchor.key, anchor.offset, anchor.type);
              (sel.focus as any).set(focus.key, focus.offset, focus.type);
            }
          });
        }
      }, 0);
    }

    function setBlock(create: () => ElementNode) {
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        $setBlocksType(sel, create);
      });
    }

    function toggleList(kind: 'ul' | 'ol') {
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const anchor = sel.anchor.getNode();
        const list = $getNearestNodeOfType<ListNode>(anchor, ListNode);
        if (list && $isListNode(list)) {
          const current = list.getListType();
          const want = kind === 'ol' ? 'number' : 'bullet';
          if (current === want) {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
            return;
          }
        }
        if (kind === 'ol') editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        else editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      });
    }

    function toggleLink() {
      let isLink = false;
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const anchor = sel.anchor.getNode();
        isLink = !!$findMatchingParent(anchor, (n) => $isLinkNode(n));
      });
      if (isLink) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        return;
      }
      const url = window.prompt('Enter URL:');
      if (url === null) return;
      const trimmed = url.trim();
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, trimmed || null);
    }

    function runCommand(name: string) {
      switch (name) {
        case 'bold':
          format('bold');
          break;
        case 'italic':
          format('italic');
          break;
        case 'underline':
          format('underline');
          break;
        case 'strikethrough':
          format('strikethrough');
          break;
        case 'code':
          format('code');
          break;
        case 'undo':
          editor.dispatchCommand(UNDO_COMMAND, undefined);
          break;
        case 'redo':
          editor.dispatchCommand(REDO_COMMAND, undefined);
          break;
        case 'paragraph':
          setBlock(() => $createParagraphNode());
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          setBlock(() => $createHeadingNode(name as HeadingTagType));
          break;
        case 'quote':
          setBlock(() => $createQuoteNode());
          break;
        case 'unorderedList':
          toggleList('ul');
          break;
        case 'orderedList':
          toggleList('ol');
          break;
        case 'link':
          toggleLink();
          break;
      }
    }

    window.addEventListener('message', handler);
    // Tell the extension we're ready to receive command messages. This is a
    // no-op signal; MarkdownSyncPlugin already sends `ready`.
    void getVsCodeApi();
    return () => {
      window.removeEventListener('message', handler);
    };
  }, [editor]);

  return null;
}
