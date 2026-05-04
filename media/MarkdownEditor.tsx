import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { useState } from 'react';
import { GhostSuggestionNode } from './nodes/GhostSuggestionNode';
import { MarkdownSyncPlugin } from './plugins/MarkdownSyncPlugin';
import { InlineSuggestionPlugin } from './plugins/InlineSuggestionPlugin';
import { CommandBridgePlugin } from './plugins/CommandBridgePlugin';
import { Toolbar } from './Toolbar';

const theme = {
  paragraph: 'mwy-paragraph',
  heading: {
    h1: 'mwy-h1',
    h2: 'mwy-h2',
    h3: 'mwy-h3',
    h4: 'mwy-h4',
    h5: 'mwy-h5',
    h6: 'mwy-h6'
  },
  quote: 'mwy-quote',
  list: {
    nested: { listitem: 'mwy-nested-listitem' },
    ol: 'mwy-list-ol',
    ul: 'mwy-list-ul',
    listitem: 'mwy-listitem'
  },
  link: 'mwy-link',
  text: {
    bold: 'mwy-bold',
    italic: 'mwy-italic',
    underline: 'mwy-underline',
    strikethrough: 'mwy-strikethrough',
    code: 'mwy-inline-code'
  },
  code: 'mwy-code-block'
};

export function MarkdownEditor(): React.ReactElement {
  const [config, setConfig] = useState<{ enabled: boolean; debounceMs: number }>({
    enabled: true,
    debounceMs: 600
  });

  const initialConfig = {
    namespace: 'markdown-wysiwyg',
    theme,
    onError(error: Error) {
      // eslint-disable-next-line no-console
      console.error('[markdown-wysiwyg] Lexical error:', error);
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      AutoLinkNode,
      GhostSuggestionNode
    ]
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="mwy-shell">
        <Toolbar />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="mwy-content"
              ariaLabel="Markdown WYSIWYG editor"
              spellCheck
            />
          }
          placeholder={<div className="mwy-placeholder">Start writing…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin />
        <TabIndentationPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <MarkdownSyncPlugin onConfig={setConfig} />
        <InlineSuggestionPlugin config={config} />
        <CommandBridgePlugin />
      </div>
    </LexicalComposer>
  );
}
