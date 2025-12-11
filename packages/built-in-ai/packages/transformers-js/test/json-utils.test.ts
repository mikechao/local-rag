import { describe, it, expect } from "vitest";
import { extractJsonPayload } from "../src/utils/json-utils";

describe("extractJsonPayload", () => {
  // Test cases for valid JSON
  it("should extract a simple JSON object", () => {
    const text = 'Hello {"key": "value"} world';
    expect(extractJsonPayload(text)).toBe('{"key": "value"}');
  });

  it("should extract a simple JSON array", () => {
    const text = 'Some text [1, 2, 3] more text';
    expect(extractJsonPayload(text)).toBe('[1, 2, 3]');
  });

  it("should extract a nested JSON object", () => {
    const text = 'Start {"a": {"b": 1}, "c": 2} End';
    expect(extractJsonPayload(text)).toBe('{"a": {"b": 1}, "c": 2}');
  });

  it("should extract a JSON object with nested arrays", () => {
    const text = 'Start {"a": [1, {"b": 2}], "c": 3} End';
    expect(extractJsonPayload(text)).toBe('{"a": [1, {"b": 2}], "c": 3}');
  });

  it("should handle strings containing braces/brackets correctly", () => {
    const text = 'Start {"message": "This is a {string} with [braces]"} End';
    expect(extractJsonPayload(text)).toBe('{"message": "This is a {string} with [braces]"}');
  });

  it("should handle escaped quotes in strings", () => {
    const text = 'Start {"key": "value with \\"quotes\\""} End';
    expect(extractJsonPayload(text)).toBe('{"key": "value with \\"quotes\\""}');
  });

  it("should return the first valid JSON found", () => {
    const text = 'Invalid JSON } { "first": 1 } { "second": 2 }';
    expect(extractJsonPayload(text)).toBe('{ "first": 1 }');
  });

  // Test cases for invalid/no JSON
  it("should return null if no JSON object or array is found", () => {
    const text = 'Just plain text without JSON';
    expect(extractJsonPayload(text)).toBeNull();
  });

  it("should return null for unbalanced braces/brackets", () => {
    const text = 'Text {"key": "value"';
    expect(extractJsonPayload(text)).toBeNull();
  });

  it("should return null for malformed JSON", () => {
    const text = 'Text {"key": "value", "key2":}';
    expect(extractJsonPayload(text)).toBeNull();
  });

  it("should return null for JSON-like string not starting with { or [", () => {
    const text = 'Text "key": "value"';
    expect(extractJsonPayload(text)).toBeNull();
  });

  it("should handle empty string", () => {
    expect(extractJsonPayload("")).toBeNull();
  });

  it("should handle JSON with leading/trailing whitespace", () => {
    const text = '  { "key": "value" }  ';
    expect(extractJsonPayload(text)).toBe('{ "key": "value" }');
  });

  it("should handle JSON followed by other text", () => {
    const text = '{"data": "value"} some extra text';
    expect(extractJsonPayload(text)).toBe('{"data": "value"}');
  });

  it("should handle arrays with mixed content", () => {
    const text = '[1, "two", {"three": 3}]';
    expect(extractJsonPayload(text)).toBe('[1, "two", {"three": 3}]');
  });

  it("should correctly handle nested malformed JSON attempts after a good one", () => {
    const text = 'Initial text {"valid": "json"} and then {"malformed": "json"';
    expect(extractJsonPayload(text)).toBe('{"valid": "json"}');
  });

  it("should find the first complete JSON object even if incomplete parts exist earlier", () => {
    const text = 'incomplete { "a" : { "valid": "json" } some more';
    expect(extractJsonPayload(text)).toBeNull();
  });
});
