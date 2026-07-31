/**
 * Shared tool-argument JSON parsing for all provider drivers.
 *
 * Models emit tool-call arguments as a JSON string. Every driver (Anthropic,
 * OpenAI/OpenRouter Responses, Ollama) funnels that string through this single
 * helper so the failure behaviour is identical across providers.
 *
 * On malformed JSON we return `{}` rather than the raw string. Downstream,
 * `execTool.ts` runs the result through `parseValue(aiTool.inputSchema, …)`:
 *   - for a schema with required fields, `{}` produces a clean TypeBox
 *     validation error that is reported back to the model (a far better signal
 *     than a type error on a raw string), so the model can retry;
 *   - for an all-optional schema, `{}` validates and the tool runs with
 *     defaults — the only sane interpretation of "no usable arguments".
 *
 * Previously each driver had its own copy with divergent catch behaviour
 * (`{}` vs. the raw string), so the same model error produced different
 * outcomes per provider. This is the one source of truth.
 */
export function parseToolArguments(json: string): unknown {
  if (!json.trim()) return {}
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}
