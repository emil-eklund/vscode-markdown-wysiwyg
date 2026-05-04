export type ExtensionToWebview =
  | { type: 'init'; text: string }
  | { type: 'externalUpdate'; text: string };

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'edit'; text: string };
