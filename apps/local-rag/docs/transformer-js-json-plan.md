
# Plan: Add JSON `responseFormat` Support to `packages/built-in-ai/packages/transformers-js`

## Goal
Teach the TransformersJS provider (main thread + worker + streaming paths) to honor `responseFormat: { type: "json", schema }` instead of emitting a warning. The provider should return model text that is valid JSON matching the schema (or fail clearly) so downstream `Output.object` parsing works.

## Current State (findings)
- `transformers-js-language-model.ts#getArgs` warns that `responseFormat` is unsupported and otherwise ignores it.
- Generation builds a system prompt via `buildJsonToolSystemPrompt` (tool-calling focus) and decodes plain text; no JSON-shaping instructions or parsing.
- Worker path mirrors main-thread behavior; streaming path (see `transformers-js-language-model.ts` inline `doStream` logic and `ToolCallFenceDetector`) currently just streams raw tokens.
- Models (Qwen3-0.6B ONNX, etc.) have no native JSON mode, so we must rely on prompt/decoding/validation.

## Feasibility Review & Adjustments
- **Feasible**: The core approach of Prompt Engineering + Client-side Parsing/Validation is the standard way to handle this for local models.
- **Dependencies**: `zod` is currently a `devDependency` in `packages/transformers-js/package.json`. It **must** be moved to `dependencies` or `peerDependencies` to be available for runtime validation.
- **Worker Complexity**: Passing a custom `LogitsProcessor` function to a worker is not possible via `postMessage`.
  - *Adjustment*: Implement a named `ForceJsonStartLogitsProcessor` inside the worker/shared code and trigger it via a serializable flag (e.g., `forceJsonStart: true`) in the worker message, rather than trying to pass a function.
- **Streaming**: The plan mentions `streaming/transformers-js-language-model-streaming.ts`, but the streaming logic is actually inline in `transformers-js-language-model.ts`.
  - *Adjustment*: We will likely need to extract the streaming logic or implement a new `JsonFenceDetector` similar to `ToolCallFenceDetector` in `src/streaming/` to handle the JSON parsing state machine.

## Reference: built-in-ai provider already supports JSON
- In `packages/built-in-ai/packages/built-in-ai/src/built-in-ai-language-model.ts`, `getArgs` maps `responseFormat.schema` to `promptOptions.responseConstraint` (the Prompt API enforces structured responses) and **does not warn** when JSON is requested.
- That provider still warns on other unsupported knobs (tools, stopSequences, etc.) but silently accepts JSON because the runtime enforces it. We can mirror this UX: drop the blanket unsupported warning for JSON, only warn on size/validation issues.
- Unlike Prompt API, TransformersJS lacks native schema enforcement, so we must add prompt conditioning + client-side parsing/validation to approximate the same contract.

## Design Choices
1) **Prompt-only enforcement**: prepend a compact JSON-only instruction with an inline, compressed schema description (stringified JSON schema) and an example; forbid prose. Works both main thread and worker.
2) **Decoder-side validation**: after generation, extract the first balanced JSON object/array, `JSON.parse`, and validate against provided schema (using `zod` or `@sinclair/typebox` already in deps). On failure, emit a warning and return raw text by default; if a strict flag is enabled, throw a typed `invalid_response_format` error instead.
3) **Streaming**:
   - **Buffer Prefix**: Accumulate tokens only until a JSON start character (`{` or `[` ) is detected.
   - **Stream Body**: Once started, emit tokens immediately so `streamObject` works in real-time.
   - **Stop at Suffix**: Monitor for the corresponding closing brace/bracket and stop generation immediately to prevent trailing prose.
4) **Logits Processing (Reliability)**: Implement a simple `LogitsProcessor` that forces the first generated token to be `{` (or `[` ). This prevents "Sure, here is the JSON..." chatty prefixes common in small models.
5) **Worker parity**: replicate prompt + parsing inside worker handler so browser worker path behaves the same.

## Technical Specification: JsonFenceDetector
The `JsonFenceDetector` class will reside in `src/streaming/json-fence-detector.ts` and manage the streaming state machine to extract a clean JSON string from potentially "chatty" model output.

### Logic & State Machine
The detector maintains a character-level state machine with three primary phases:

1.  **Phase: FINDING_START**
    - **Goal:** Locate the first valid JSON start character (`{` or `[`) while buffering "chatty" prefix text.
    - **Behavior:**
        - Buffer incoming chunks.
        - Scan for `{` or `[`.
        - **Constraints:** Max prefix length (e.g., 500 chars). If exceeded without finding JSON, mark as "failed/no-json" or fallback to streaming raw text (depending on `failHard` config).
        - **Transition:** On finding start char, enter **TRACKING_DEPTH** phase. Emit the start char and any subsequent buffered content. Discard the prefix (or store it for debugging).

2.  **Phase: TRACKING_DEPTH**
    - **Goal:** Stream valid JSON tokens while tracking nesting depth to detect the end of the object/array.
    - **State Variables:**
        - `depth`: Integer (starts at 1).
        - `inString`: Boolean.
        - `isEscaped`: Boolean (for `\"` inside strings).
        - `rootChar`: `'{'` or `'['` (to match the corresponding closing tag).
    - **Logic (Char-by-Char):**
        - If `isEscaped`: Reset `isEscaped`. Continue.
        - If char is `\`: Set `isEscaped = true`.
        - If char is `"`: Toggle `inString`.
        - If `!inString`:
            - If char matches opening (`{` or `[`): `depth++`.
            - If char matches closing (`}` or `]`): `depth--`.
    - **Transition:** When `depth === 0`, the JSON object is complete. Enter **COMPLETED** phase.

3.  **Phase: COMPLETED**
    - **Goal:** Stop emission and ignore trailing text.
    - **Behavior:**
        - Return `complete: true` signal to the stream controller.
        - Any further incoming chunks are ignored (effectively implementing "stop sequence" behavior).

### API Surface
```typescript
interface JsonStreamResult {
  /** Newly identified JSON content to emit immediately */
  delta: string;
  /** Whether the JSON object has fully closed */
  complete: boolean;
  /** If true, we are still scanning for the start of JSON */
  waitingForStart: boolean;
}

class JsonFenceDetector {
  addChunk(chunk: string): void;
  /** Returns the next piece of safe JSON content */
  process(): JsonStreamResult;
}
```

## Implementation Steps
1) **Define schema summarizer**: helper that turns `responseFormat.schema` (Zod schema or JSONSchema7/Record) into a compact string for prompts. Keep prompt and validator on the same representation; if truncated (e.g., 2 KB cap), truncate the validator input too (or annotate that validation uses the full schema) and emit a warning.
2) **Prompt injection (exact slot)**:
   - In `getArgs`, when `responseFormat?.type === "json"`, remove the current unsupported warning.
   - Prepend a JSON-only system snippet (`Return ONLY valid JSON matching this schema: <schema>. No prose.`) before `apply_chat_template` and keep `buildJsonToolSystemPrompt` unchanged to avoid tool prompt conflicts.
3) **First-token control**:
   - Verify Transformers.js exposes logits processors or token biasing. If supported, add a processor to force the first generated token to `{` or `[` (and allow whitespace). If not supported, document the limitation and rely on prompt + validator only.
4) **Non-streaming parse & validate (robust scanner)**:
   - Implement `extractJsonPayload` as a string-aware scanner that respects strings and escapes to find the first balanced object/array.
   - Parse, then validate with Zod (preferred, already in deps) or chosen validator; on success, set `textContent` to compact JSON string. On failure, follow the decided contract (see step 8).
5) **Streaming support (string-aware)**:
   - Phase 1: buffer until the first `{`/`[` while respecting strings/escapes; fail fast if buffer exceeds ~50 chars with no start.
   - Phase 2: stream tokens, maintaining a brace/bracket depth counter that is string-aware. When depth returns to zero, stop generation and prevent trailing text (hard stop or stop token if available).
6) **Worker parity + shared helpers**:
   - Share the summarizer, scanner, and validator logic between main thread and worker (e.g., small shared module) to avoid divergence and bundle bloat.
7) **Config toggles & limits**:
   - Add `responseFormatMaxSchemaChars` default 2000; document multimodal limitations.
   - Add an optional `stopAfterJson` flag to hard-stop generation once JSON closes (no trailing prose).
8) **Contract on failure (decided)**:
   - Default: warn + return raw text (or best-effort parsed JSON) to preserve backward compatibility.
   - Strict opt-in: `responseFormatFailHard` (boolean, default false). When true, throw/emit a typed `invalid_response_format` error on parse/validation failure or when no JSON is found; streaming should terminate with that error instead of continuing.
   - Apply the same policy across batch and streaming; pair with `stopAfterJson` so non-strict mode still stops at the closed JSON before trailing prose.
9) **Tests**:
   - Unit: `extractJsonPayload` with quotes/escapes, leading prose, malformed JSON, nested arrays, UTF-8 chars.
   - Integration: mocked generate returning JSON and chatty prefixes; ensure main-thread and worker paths strip warnings appropriately.
   - Streaming: mocked token stream with valid JSON and with trailing prose; assert stop-after-JSON behavior.
10) **Docs & warnings**:
   - README: JSON support is prompt-based; schemas may be truncated; tool calls + JSON not supported in the same turn yet.
   - Warnings: remove blanket unsupported warning; warn on schema truncation, parse/validation failure, or no JSON found.

## Open Questions / Decisions
- Validate schema with `zod` (already in deps) or a minimal JSON Schema validator? (Need to check bundle size; zod likely acceptable.)
- Do we support `responseFormat.schema` only, or also a schema-less `{ type: "json" }` meaning “any JSON object”? (Probably support both.)

## Estimated Effort
- Prompt + parsing + validation (main thread): 0.5–1 day
- Streaming + worker parity: 0.5 day
- Tests + docs + polish: 0.5 day

Total: ~1.5–2 person-days.
