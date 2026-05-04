import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from 'lexical';
import * as React from 'react';

export type SerializedGhostSuggestionNode = Spread<
  { text: string; type: 'ghost-suggestion'; version: 1 },
  SerializedLexicalNode
>;

/**
 * Renders an inline, non-editable "ghost text" suggestion at the cursor.
 * The node is intentionally excluded from markdown serialization.
 */
export class GhostSuggestionNode extends DecoratorNode<React.ReactElement> {
  __text: string;

  static getType(): string {
    return 'ghost-suggestion';
  }

  static clone(node: GhostSuggestionNode): GhostSuggestionNode {
    return new GhostSuggestionNode(node.__text, node.__key);
  }

  constructor(text: string, key?: NodeKey) {
    super(key);
    this.__text = text;
  }

  getTextContent(): string {
    // Excluded from markdown / plain text serialization.
    return '';
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return false;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.className = 'ghost-suggestion';
    span.setAttribute('aria-hidden', 'true');
    span.setAttribute('contenteditable', 'false');
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): React.ReactElement {
    // The plain string includes whitespace that JSX would otherwise normalize.
    return React.createElement(
      'span',
      { className: 'ghost-suggestion-text' },
      this.__text
    );
  }

  getSuggestionText(): string {
    return this.__text;
  }

  static importJSON(json: SerializedGhostSuggestionNode): GhostSuggestionNode {
    return $createGhostSuggestionNode(json.text);
  }

  exportJSON(): SerializedGhostSuggestionNode {
    return {
      type: 'ghost-suggestion',
      version: 1,
      text: this.__text
    };
  }
}

export function $createGhostSuggestionNode(text: string): GhostSuggestionNode {
  return $applyNodeReplacement(new GhostSuggestionNode(text));
}

export function $isGhostSuggestionNode(
  node: LexicalNode | null | undefined
): node is GhostSuggestionNode {
  return node instanceof GhostSuggestionNode;
}
