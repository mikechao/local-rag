# Plan: Add JSON `responseFormat` Support to `packages/built-in-ai/packages/transformers-js`

## Goal
Teach the TransformersJS provider (main thread + worker + streaming paths) to honor `responseFormat: { type: "json", schema }` instead of emitting a warning. The provider should return model text that is valid JSON matching the schema (or fail clearly) so downstream `Output.object` parsing works.

## Current State (findings)
- `transformers-js-language-model.ts#getArgs` warns that `responseFormat` is unsupported and otherwise ignores it.
- Generation builds a system prompt via `buildJsonToolSystemPrompt` (tool-calling focus) and decodes plain text; no JSON-shaping instructions or parsing.
- Worker path mirrors main-thread behavior; streaming path (see `streaming/transformers-js-language-model-streaming.ts` and worker handler) currently just streams raw tokens.
- Models (Qwen3-0.6B ONNX, etc.) have no native JSON mode, so we must rely on prompt/decoding/validation.

## Reference: built-in-ai provider already supports JSON
- In `packages/built-in-ai/packages/built-in-ai/src/built-in-ai-language-model.ts`, `getArgs` maps `responseFormat.schema` to `promptOptions.responseConstraint` (the Prompt API enforces structured responses) and **does not warn** when JSON is requested.
- That provider still warns on other unsupported knobs (tools, stopSequences, etc.) but silently accepts JSON because the runtime enforces it. We can mirror this UX: drop the blanket unsupported warning for JSON, only warn on size/validation issues.
- Unlike Prompt API, TransformersJS lacks native schema enforcement, so we must add prompt conditioning + client-side parsing/validation to approximate the same contract.

## Design Choices
1) **Prompt-only enforcement**: prepend a compact JSON-only instruction with an inline, compressed schema description (stringified JSON schema) and an example; forbid prose. Works both main thread and worker.
2) **Decoder-side validation**: after generation, extract the first balanced JSON object/array, `JSON.parse`, and validate against provided schema (using `zod` or `@sinclair/typebox` already in deps). On failure, return an `unsupported` or `invalid_response_format` warning and fall back to text? (See open question below.)
3) **Streaming**: accumulate streamed tokens until a complete JSON object is parsable; then emit a single `text` part containing the raw JSON string (AI SDK will parse later). If parsing never succeeds before `finish`, surface an error/warning.
4) **Worker parity**: replicate prompt + parsing inside worker handler so browser worker path behaves the same.

## Implementation Steps
1) **Define schema summarizer**: helper that turns `responseFormat.schema` (likely JSONSchema7 or Record) into a compact string for prompts; truncate if huge (e.g., 1–2 KB cap) and add a warning when truncated.
2) **Prompt injection**:
   - In `getArgs`, when `responseFormat?.type === "json"`, remove the current unsupported warning.
   - Build an additional system message snippet like: `"Return ONLY valid JSON matching this schema: <schema>. No prose."` and thread it into `buildJsonToolSystemPrompt` or prepend to `systemPrompt` before `apply_chat_template`.
3) **Non-streaming parse & validate**:
   - After `generatedText` is produced (both vision and text paths), run `extractJsonPayload(generatedText)` to grab the first JSON object/array.
   - If parse succeeds and `responseFormat.schema` is present, validate; on success, set `textContent` to the compact stringified JSON (no extra text). On failure, add an `invalid_response_format` warning and optionally fall back to raw text.
4) **Streaming support**:
   - In `streaming/transformers-js-language-model-streaming.ts` and worker streaming handler, accumulate tokens; when `extractJsonPayload` succeeds, emit the JSON chunk once and mark subsequent tokens as ignored, then close with `finishReason: "stop"`.
   - Expose partial-state buffer to detect timeouts; if stream ends without parse, emit warning similar to non-streaming failure.
5) **Worker path parity**:
   - Mirror prompt shaping and parsing in `transformers-js-worker-handler` (generation) and `transformers-js-language-model` worker code paths.
6) **Config toggles & limits**:
   - Add optional `responseFormatMaxSchemaChars` in provider settings with a sensible default (e.g., 2000) to avoid bloating prompts.
   - Guard against multimodal messages where JSON might be hard; document any limitations.
7) **Tests**:
   - Unit tests for `extractJsonPayload` (clean JSON, JSON with leading prose, malformed JSON, nested arrays).
   - Integration test on a tiny model stub/mocked generate that returns JSON to ensure main-thread path strips warnings and outputs JSON only.
   - Streaming test using a mocked generator yielding token-by-token JSON and one with trailing prose to ensure buffer stops after JSON.
8) **Docs & warnings**:
   - Update README to state JSON responseFormat is supported (prompt-based) and note limitations (model must follow instructions; schema truncated when too large; tool calls + JSON combined not supported in same turn yet).
   - Adjust warning messages: remove current blanket warning; instead warn when schema is truncated, validation fails, or JSON cannot be extracted. Mirror tone/style used in built-in-ai provider warnings.

## Open Questions / Decisions
- Should we fail hard (throw) when JSON can’t be parsed, or return best-effort text with a warning? (Leaning: warning + raw text to avoid breaking callers.)
- Validate schema with `zod` (already in deps) or a minimal JSON Schema validator? (Need to check bundle size; zod likely acceptable.)
- Do we support `responseFormat.schema` only, or also a schema-less `{ type: "json" }` meaning “any JSON object”? (Probably support both.)

## Estimated Effort
- Prompt + parsing + validation (main thread): 0.5–1 day
- Streaming + worker parity: 0.5 day
- Tests + docs + polish: 0.5 day

Total: ~1.5–2 person-days.
