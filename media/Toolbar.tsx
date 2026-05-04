import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  type TextFormatType
} from 'lexical';
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  ListNode
} from '@lexical/list';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $createParagraphNode } from 'lexical';
import { TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link';
import { $findMatchingParent, $getNearestNodeOfType } from '@lexical/utils';
import { useCallback, useEffect, useState } from 'react';

type BlockKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'ul' | 'ol';

interface ButtonProps {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ label, title, active, disabled, onClick }: ButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={'mwy-tb-btn' + (active ? ' active' : '')}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      // Prevent the editor from losing selection when the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Toolbar(): React.ReactElement {
  const [editor] = useLexicalComposerContext();
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [strike, setStrike] = useState(false);
  const [code, setCode] = useState(false);
  const [link, setLink] = useState(false);
  const [block, setBlock] = useState<BlockKind>('paragraph');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateState = useCallback(() => {
    const sel = $getSelection();
    if (!$isRangeSelection(sel)) return;
    setBold(sel.hasFormat('bold'));
    setItalic(sel.hasFormat('italic'));
    setUnderline(sel.hasFormat('underline'));
    setStrike(sel.hasFormat('strikethrough'));
    setCode(sel.hasFormat('code'));

    const anchor = sel.anchor.getNode();
    const linkParent = $findMatchingParent(anchor, (n) => $isLinkNode(n));
    setLink(!!linkParent);

    const element = anchor.getKey() === 'root' ? anchor : $findMatchingParent(anchor, (e) => {
      const parent = e.getParent();
      return parent !== null && parent.getKey() === 'root';
    }) ?? anchor.getTopLevelElementOrThrow();
    if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType<ListNode>(anchor, ListNode);
      const listType = parentList ? parentList.getListType() : element.getListType();
      setBlock(listType === 'number' ? 'ol' : 'ul');
    } else {
      const type = element.getType();
      if (type === 'heading' && $isHeadingNode(element)) {
        setBlock(element.getTag());
      } else if (type === 'quote') {
        setBlock('quote');
      } else {
        setBlock('paragraph');
      }
    }
  }, []);

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateState);
    });
    const unregisterSel = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateState();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
    const unregisterUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
    const unregisterRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
    return () => {
      unregisterUpdate();
      unregisterSel();
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor, updateState]);

  const format = (f: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, f);

  const setBlockKind = (kind: BlockKind) => {
    if (kind === 'ul') {
      if (block === 'ul') editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      else editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      return;
    }
    if (kind === 'ol') {
      if (block === 'ol') editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      else editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    }
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      if (kind === 'paragraph') {
        $setBlocksType(sel, () => $createParagraphNode());
      } else if (kind === 'quote') {
        $setBlocksType(sel, () => $createQuoteNode());
      } else {
        $setBlocksType(sel, () => $createHeadingNode(kind));
      }
    });
  };

  const toggleLink = () => {
    if (link) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }
    const url = window.prompt('Enter URL:');
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, trimmed);
  };

  return (
    <div className="mwy-toolbar" role="toolbar" aria-label="Formatting">
      <select
        className="mwy-tb-select"
        value={block}
        title="Block style"
        aria-label="Block style"
        onMouseDown={(e) => {
          // Don't blur the editor on focus, but allow native dropdown to open.
          e.stopPropagation();
        }}
        onChange={(e) => setBlockKind(e.target.value as BlockKind)}
      >
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="h5">Heading 5</option>
        <option value="h6">Heading 6</option>
        <option value="quote">Quote</option>
        <option value="ul">Bullet list</option>
        <option value="ol">Numbered list</option>
      </select>
      <span className="mwy-tb-sep" />
      <ToolbarButton label="B" title="Bold (Ctrl+B)" active={bold} onClick={() => format('bold')} />
      <ToolbarButton label="I" title="Italic (Ctrl+I)" active={italic} onClick={() => format('italic')} />
      <ToolbarButton label="U" title="Underline (Ctrl+U)" active={underline} onClick={() => format('underline')} />
      <ToolbarButton label="S" title="Strikethrough" active={strike} onClick={() => format('strikethrough')} />
      <ToolbarButton label="</>" title="Inline code" active={code} onClick={() => format('code')} />
      <span className="mwy-tb-sep" />
      <ToolbarButton label="• List" title="Bullet list" active={block === 'ul'} onClick={() => setBlockKind('ul')} />
      <ToolbarButton label="1. List" title="Numbered list" active={block === 'ol'} onClick={() => setBlockKind('ol')} />
      <ToolbarButton label="❝" title="Quote" active={block === 'quote'} onClick={() => setBlockKind('quote')} />
      <ToolbarButton label="🔗" title="Link" active={link} onClick={toggleLink} />
      <span className="mwy-tb-sep" />
      <ToolbarButton
        label="↶"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      />
      <ToolbarButton
        label="↷"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      />
    </div>
  );
}
