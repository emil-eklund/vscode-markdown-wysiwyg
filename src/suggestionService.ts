import * as vscode from 'vscode';

export interface SuggestionOptions {
  modelFamily: string;
  maxTokens: number;
}

const SYSTEM_PROMPT = `You are an inline writing assistant embedded in a Markdown WYSIWYG editor.
You receive the document split as PREFIX (text before the cursor) and SUFFIX (text after the cursor).
Predict ONLY the text that should appear directly after the cursor — a brief, natural continuation
that would make sense as the user keeps typing. Rules:
- Output plain text only, no Markdown fences, no commentary, no quotes.
- Continue the user's tone and language.
- Keep it short (a few words, at most one or two sentences).
- Do not repeat the PREFIX or SUFFIX. If a sensible continuation isn't obvious, output an empty response.
- Never include explanations, labels, or surrounding whitespace beyond what naturally continues the text.`;

export class SuggestionService {
  /**
   * Request a single inline continuation. Returns the suggestion text, or
   * an empty string if no useful suggestion is available.
   */
  public async getSuggestion(
    prefix: string,
    suffix: string,
    options: SuggestionOptions,
    token: vscode.CancellationToken
  ): Promise<string> {
    const model = await this.pickModel(options.modelFamily);
    if (!model) {
      throw new Error('No VS Code language model is available. Install a provider such as GitHub Copilot.');
    }

    const userPrompt =
      `<PREFIX>\n${prefix}\n</PREFIX>\n` +
      `<SUFFIX>\n${suffix}\n</SUFFIX>\n` +
      `Write ONLY the continuation that should be inserted at the cursor.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
      vscode.LanguageModelChatMessage.User(userPrompt)
    ];

    const response = await model.sendRequest(
      messages,
      { justification: 'Inline suggestion in the Markdown WYSIWYG editor' },
      token
    );

    let result = '';
    for await (const chunk of response.text) {
      if (token.isCancellationRequested) {
        break;
      }
      result += chunk;
      // Cap output length defensively.
      if (result.length > options.maxTokens * 8) {
        break;
      }
    }
    return this.sanitize(result);
  }

  private async pickModel(family: string): Promise<vscode.LanguageModelChat | undefined> {
    try {
      if (family) {
        const matched = await vscode.lm.selectChatModels({ family });
        if (matched.length > 0) {
          return matched[0];
        }
      }
      const any = await vscode.lm.selectChatModels({});
      return any[0];
    } catch {
      return undefined;
    }
  }

  private sanitize(text: string): string {
    let out = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trimEnd();
    // Strip wrapping quotes the model sometimes adds.
    if (out.length >= 2) {
      const first = out[0];
      const last = out[out.length - 1];
      if ((first === '"' && last === '"') || (first === '\u201c' && last === '\u201d')) {
        out = out.slice(1, -1);
      }
    }
    // Avoid suggestions that are just whitespace.
    if (!out.trim()) {
      return '';
    }
    return out;
  }
}