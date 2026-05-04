// Toast UI Editor's package.json `exports` field doesn't expose its `types`
// entry, so TypeScript can't resolve them under modern moduleResolution.
// Re-export the bundled type definitions so we get full IntelliSense.
declare module '@toast-ui/editor' {
  import Editor from '@toast-ui/editor/types';
  export * from '@toast-ui/editor/types';
  export default Editor;
}

declare module '@toast-ui/editor/dist/toastui-editor.css';
declare module '*.css';
