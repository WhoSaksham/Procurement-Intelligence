import type { BaseMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { z } from 'zod';
import { ModelError, type AskModel } from './model-port.js';
import { ContextualiseOut, contextualiseMessages, DraftOut, draftMessages, VerifyOut, verifyMessages } from './prompts.js';

export const CALL_TIMEOUT_MS = 8_000;

/** Something that turns messages into structured output (a LangChain runnable). */
export interface Structured {
  invoke(messages: BaseMessage[], options: { signal: AbortSignal; runName?: string }): Promise<unknown>;
}

type MakeStructured = (schema: z.ZodType, name: string) => Structured;

function errorKind(e: unknown, signal: AbortSignal): ModelError['kind'] {
  if (signal.aborted) return 'timeout';
  const err = e as { status?: number; name?: string; message?: string };
  if (err?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED/.test(err?.message ?? '')) return 'quota';
  if (err?.name === 'OutputParserException' || err?.name === 'ZodError') return 'invalid';
  return 'upstream';
}

/** Gemini through LangChain, one structured-output call per step. `make` replaces the runnable in tests. */
export function geminiModel(cfg: { apiKey: string; model: string }, make?: MakeStructured): AskModel {
  const build: MakeStructured =
    make ??
    ((schema, name) => {
      const chat = new ChatGoogleGenerativeAI({ apiKey: cfg.apiKey, model: cfg.model, temperature: 0, maxOutputTokens: 2048, maxRetries: 0 });
      return chat.withStructuredOutput(schema, { name }) as unknown as Structured;
    });
  const runnables = {
    contextualise: build(ContextualiseOut, 'contextualise'),
    draft: build(DraftOut, 'draft'),
    verify: build(VerifyOut, 'verify'),
  };

  async function call<S extends z.ZodType>(name: keyof typeof runnables, schema: S, messages: BaseMessage[], outer: AbortSignal): Promise<z.infer<S>> {
    const signal = AbortSignal.any([outer, AbortSignal.timeout(CALL_TIMEOUT_MS)]);
    let raw: unknown;
    try {
      raw = await runnables[name].invoke(messages, { signal, runName: name });
    } catch (e) {
      throw new ModelError(errorKind(e, signal), e);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ModelError('invalid', parsed.error);
    return parsed.data;
  }

  return {
    name: cfg.model,
    contextualise: (i, signal) => call('contextualise', ContextualiseOut, contextualiseMessages(i), signal),
    draft: (i, signal) => call('draft', DraftOut, draftMessages(i), signal),
    verify: (i, signal) => call('verify', VerifyOut, verifyMessages(i), signal),
  };
}
