export interface SuggestionConfig {
  enabled: boolean;
  debounceMs: number;
}

export type ExtensionToWebview =
  | { type: 'init'; text: string; suggestionConfig: SuggestionConfig }
  | { type: 'externalUpdate'; text: string }
  | { type: 'configUpdate'; suggestionConfig: SuggestionConfig }
  | { type: 'suggestion'; id: number; text: string }
  | { type: 'suggestionError'; id: number; message: string };

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
