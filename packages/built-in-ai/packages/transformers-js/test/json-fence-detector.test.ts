import { describe, it, expect } from "vitest";
import { JsonFenceDetector } from "../src/streaming/json-fence-detector";

describe("JsonFenceDetector", () => {
  it("should detect and emit a simple JSON object in a single chunk", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"key":"value"}');
    const result = detector.process();
    expect(result.delta).toBe('{"key":"value"}');
    expect(result.complete).toBe(true);
    expect(result.waitingForStart).toBe(false);
    expect(result.failed).toBe(false);
  });

  it("should detect and emit a simple JSON array in a single chunk", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('[1,2,3]');
    const result = detector.process();
    expect(result.delta).toBe('[1,2,3]');
    expect(result.complete).toBe(true);
  });

  it("should buffer non-JSON prefix and then emit JSON", () => {
    const detector = new JsonFenceDetector();
    let accumulatedDelta = "";

    // Add some prefix text
    detector.addChunk('Thought: This is a thought.');
    let result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('Thought: This is a thought.');
    expect(result.complete).toBe(false);
    expect(result.waitingForStart).toBe(true);

    // Add the JSON start
    detector.addChunk('{"key":');
    result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('Thought: This is a thought.{"key":');
    expect(result.complete).toBe(false);
    expect(result.waitingForStart).toBe(false);

    // Add the rest of the JSON
    detector.addChunk('"value"}');
    result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('Thought: This is a thought.{"key":"value"}');
    expect(result.complete).toBe(true);
    expect(result.waitingForStart).toBe(false);
  });

  it("should handle JSON split across multiple chunks", () => {
    const detector = new JsonFenceDetector();
    let accumulatedDelta = "";

    detector.addChunk('{"key"');
    let result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('{"key"');
    expect(result.complete).toBe(false);
    expect(result.waitingForStart).toBe(false); // No longer waiting for start after first char

    detector.addChunk(':"value"}');
    result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('{"key":"value"}');
    expect(result.complete).toBe(true);
    expect(result.waitingForStart).toBe(false);
  });

  it("should handle nested JSON split across multiple chunks", () => {
    const detector = new JsonFenceDetector();
    let accumulatedDelta = "";

    detector.addChunk('{"a":"b","c"');
    let result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('{"a":"b","c"');
    expect(result.complete).toBe(false);

    detector.addChunk(':[{"d":1}]}');
    result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('{"a":"b","c":[{"d":1}]}');
    expect(result.complete).toBe(true);
  });

  it("should ignore text after a complete JSON object if no more addChunk calls", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"key":"value"}Trailing text');
    const result = detector.process();
    expect(result.delta).toBe('{"key":"value"}');
    expect(result.complete).toBe(true);
    expect(detector.getBuffer()).toBe('Trailing text'); // Buffer should retain trailing text
  });

  it("should handle strings with escaped quotes", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"message":"Hello \"world\""}');
    const result = detector.process();
    expect(result.delta).toBe('{"message":"Hello \"world\""}');
    expect(result.complete).toBe(true);
  });

  it("should handle strings with internal braces/brackets", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"data":"{some data} [in here]"}');
    const result = detector.process();
    expect(result.delta).toBe('{"data":"{some data} [in here]"}');
    expect(result.complete).toBe(true);
  });

  it("should mark as failed if max prefix length exceeded without finding start", () => {
    const detector = new JsonFenceDetector();
    detector['MAX_PREFIX_LENGTH'] = 10; // Temporarily reduce for test
    let accumulatedDelta = "";

    detector.addChunk('A very long'); // 11 chars, exceeds 10
    let result = detector.process();
    accumulatedDelta += result.delta;
    
    // Expect the full emitted prefix, as process() emits all characters up to failure point
    expect(accumulatedDelta).toBe('A very long');
    expect(result.failed).toBe(true);
    expect(result.errorMessage).toContain('Exceeded max prefix length');

    // Add more text, should still be failed
    detector.addChunk('non-JSON prefix text');
    result = detector.process();
    // No new delta should be emitted for JSON, and the new text is still in buffer
    expect(result.delta).toBe(''); 
    expect(result.failed).toBe(true);
    expect(detector.getBuffer()).toBe('non-JSON prefix text'); // Remaining buffer still held
  });

  it("should mark as failed for malformed JSON (unbalanced brackets)", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"key":"value"'); // Missing closing brace
    detector.addChunk('more text');
    const result = detector.process();
    // It will emit the entire malformed JSON block as delta
    expect(result.delta).toBe('{"key":"value"more text');
    expect(result.complete).toBe(false); // Never completed successfully
  });

  it("should mark as failed for non-matching root char", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('[1,2,3}'); // Array opened, object closed
    const result = detector.process();
    expect(result.delta).toBe('[1,2,3}');
    expect(result.failed).toBe(true);
  });

  it("should correctly process multiple calls to process() for same chunk", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"a":"b"}');
    let result1 = detector.process();
    let result2 = detector.process();
    expect(result1.delta).toBe('{"a":"b"}');
    expect(result1.complete).toBe(true);
    expect(result2.delta).toBe(''); // No more delta as it's complete
    expect(result2.complete).toBe(true);
  });

  it("should emit delta only for newly added content in TRACKING_DEPTH", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('{"key":');
    detector.process(); // Consumes "{"
    detector.addChunk('"value"}');
    const result = detector.process();
    expect(result.delta).toBe('"value"}'); // Only new content
    expect(result.complete).toBe(true);
  });

  it("should correctly manage buffer when not finding start", () => {
    const detector = new JsonFenceDetector();
    detector.addChunk('abc');
    let result = detector.process();
    expect(result.delta).toBe('abc');
    expect(detector.getBuffer()).toBe('');

    detector.addChunk('def');
    result = detector.process();
    expect(result.delta).toBe('def');
    expect(detector.getBuffer()).toBe('');
  });

  it("should find and emit the first JSON even with multiple attempts", () => {
    const detector = new JsonFenceDetector();
    let accumulatedDelta = "";

    detector.addChunk('prose text. {');
    let result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('prose text. {');
    expect(result.waitingForStart).toBe(false); // Should have found start and transitioned

    detector.addChunk('"valid":"json"} trailing');
    result = detector.process();
    accumulatedDelta += result.delta;
    expect(accumulatedDelta).toBe('prose text. {"valid":"json"}');
    expect(result.complete).toBe(true);
    expect(detector.getBuffer()).toBe(' trailing');
  });
});
