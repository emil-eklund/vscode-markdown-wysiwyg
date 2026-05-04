import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import './editor.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <MarkdownEditor />
    </StrictMode>
  );
}
