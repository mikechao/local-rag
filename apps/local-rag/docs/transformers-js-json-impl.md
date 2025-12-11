# JSON `responseFormat` Implementation Summary for `@built-in-ai/transformers-js`

## Goal
The primary goal was to enhance the Transformers.js provider within the Vercel AI SDK to support the `responseFormat: { type: "json", schema }` option. This enables users to instruct the model to produce structured JSON output that adheres to a specified Zod schema, with client-side validation.

## Implemented Features and Design Choices

### 1. Schema Summarization
*   **What was implemented:** A `summarizeSchema` utility function was created in `src/utils/schema-utils.ts`. This function takes a Zod schema or a plain JSON schema object and converts it into a compact, stringified JSON schema representation.
*   **Why:** To inject the schema information directly into the model's system prompt. This guides the model to produce output conforming to the desired JSON structure. We chose to use `zod-to-json-schema` to provide a robust conversion from Zod schemas to standard JSON Schema.

### 2. Prompt Injection
*   **What was implemented:** The `getArgs` method in `transformers-js-language-model.ts` was modified to detect `responseFormat: { type: "json" }`. When detected, it constructs a system prompt snippet (`Return ONLY valid JSON matching this schema: <schema>. No prose.`) and prepends it to the user's messages before feeding them to the model.
*   **Why:** Transformers.js models do not natively support a "JSON mode". Prompt engineering is the primary method to encourage structured output from such models.

### 3. Non-Streaming JSON Extraction and Validation
*   **What was implemented:**
    *   An `extractJsonPayload` utility function was created in `src/utils/json-utils.ts`. This function robustly scans a string for the first balanced and syntactically valid JSON object or array, correctly handling nested structures, strings, and escape characters.
    *   In `doGenerate` (non-streaming generation), after the model generates a response, `extractJsonPayload` is used. If JSON is extracted, it's then validated against the provided Zod schema (converted from `jsonSchema`) using `zod`.
*   **Why:** To ensure that the model's output, even if prompted for JSON, is actually valid JSON and conforms to the specified schema. This enables downstream applications to reliably use `Output.object`.

### 4. Streaming JSON Extraction (`JsonFenceDetector`)
*   **What was implemented:** A `JsonFenceDetector` class was created in `src/streaming/json-fence-detector.ts`. This stateful detector processes incoming text chunks from the model stream incrementally. It tracks bracket depth, string states, and escape sequences to accurately identify and emit valid JSON as it is streamed.
*   **Why:** Directly parsing a full JSON object from a streaming output is impossible before the stream ends. `JsonFenceDetector` enables real-time extraction and emission of JSON parts, allowing streaming use cases like `streamObject`.

### 5. Worker Parity
*   **What was implemented:** The worker handler (`transformers-js-worker-handler.ts`) was updated to mirror the main thread's JSON handling logic. This includes accepting `jsonSchema`, integrating `JsonFenceDetector` into its `output_callback` for streaming, and performing `extractJsonPayload` and Zod validation on the final decoded text.
*   **Why:** To ensure consistent behavior and functionality whether the model is run on the main thread or in a Web Worker, which is crucial for performance in browser environments.

### 6. Contract on Failure (`responseFormatFailHard`)
*   **What was implemented:** A `responseFormatFailHard` boolean option (default `false`) was introduced.
    *   If `false` (default): On JSON parsing or validation failure, the provider emits a `SharedV3Warning` and returns the raw text output, preserving backward compatibility.
    *   If `true`: On JSON parsing or validation failure (either non-streaming or streaming), the provider immediately throws a `LoadSettingError`, terminating the generation process.
*   **Why:** To give developers control over how strictly JSON output adherence is enforced. Some applications may tolerate non-conforming JSON with a warning, while others require strict compliance.

### 7. Comprehensive Testing
*   **What was implemented:** Extensive unit tests were added for `schema-utils.ts`, `json-utils.ts`, and `json-fence-detector.ts` to cover various scenarios including valid, invalid, malformed, and streaming inputs. Integration tests were added to `transformers-js-language-model.test.ts` to verify the end-to-end functionality of JSON `responseFormat` in both success and failure modes (including `responseFormatFailHard`).
*   **Why:** To ensure the robustness, correctness, and reliability of the new JSON handling logic across different conditions and to prevent regressions.

## Limitations / Future Work (as per plan)
*   **First-token control (Logits Processing):** This was identified as complex for worker scenarios and was deferred. The current prompt-based approach is considered sufficient for now.
*   **External Documentation:** The main README.md has been updated with a new section describing the JSON Response Format.

This implementation provides a solid foundation for structured JSON output from Transformers.js models within the AI SDK.
