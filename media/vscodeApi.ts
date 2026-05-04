import type {
  ExtensionToWebview,
  WebviewToExtension
} from '../src/protocol';

interface VSCodeApi {
  postMessage(msg: WebviewToExtension): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

let cached: VSCodeApi | undefined;

export function getVsCodeApi(): VSCodeApi {
  if (!cached) {
    cached = acquireVsCodeApi();
  }
  return cached;
}

export type { ExtensionToWebview, WebviewToExtension };
