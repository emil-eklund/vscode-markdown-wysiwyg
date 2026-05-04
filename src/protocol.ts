export interface SuggestionConfig {
  enabled: boolean;
  debounceMs: number;
}

export type EditorCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'undo'
  | 'redo'
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'quote'
  | 'unorderedList'
  | 'orderedList'
  | 'link';

export type ExtensionToWebview =
  | { type: 'init'; text: string; suggestionConfig: SuggestionConfig }
  | { type: 'externalUpdate'; text: string }
  | { type: 'configUpdate'; suggestionConfig: SuggestionConfig }
  | { type: 'suggestion'; id: number; text: string }
  | { type: 'suggestionError'; id: number; message: string }
  | { type: 'command'; command: EditorCommand };

export interface SuggestionRequest {
  id: number;
  /** Plain-text content of the document up to the cursor. */
  prefix: string;
  /** Plain-text content of the document after the cursor. */
  suffix: string;
}

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'edit'; text: string }
  | { type: 'requestSuggestion'; request: SuggestionRequest }
  | { type: 'cancelSuggestion'; id: number };
