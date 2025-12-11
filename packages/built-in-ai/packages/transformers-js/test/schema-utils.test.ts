import { describe, it, expect } from "vitest";
import { summarizeSchema } from "../src/utils/schema-utils";
import { z } from "zod";

describe("summarizeSchema", () => {
  it("should return a stringified JSON for a simple Zod object", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const summarized = summarizeSchema(schema);
    // Expect standard JSON schema output
    expect(summarized).toContain('"type":"object"');
    expect(summarized).toContain('"properties":{');
    expect(summarized).toContain('"name":{"type":"string"}');
    expect(summarized).toContain('"age":{"type":"number"}');
  });

  it("should return a stringified JSON for a simple JSONSchema7 object", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    };
    const summarized = summarizeSchema(schema);
    expect(summarized).toEqual(JSON.stringify(schema));
  });

  it("should truncate the schema if it exceeds maxLength", () => {
    const longString = "a".repeat(1000);
    const schema = z.object({
      longField: z.string().default(longString),
    });
    const maxLength = 50;
    const summarized = summarizeSchema(schema, maxLength);

    expect(summarized.length).toBeLessThanOrEqual(maxLength);
    expect(summarized).toContain("...");
    expect(summarized.endsWith("...")).toBe(true);
  });

  it("should not truncate if schema length is within maxLength", () => {
    const shortString = "short";
    const schema = z.object({
      field: z.string().default(shortString),
    });
    const maxLength = 500; // Sufficiently large
    const summarized = summarizeSchema(schema, maxLength);
    expect(summarized.length).toBeLessThanOrEqual(maxLength);
    expect(summarized).not.toContain("...");
  });

  it("should handle nested Zod objects", () => {
    const nestedSchema = z.object({
      address: z.object({
        street: z.string(),
        zip: z.string(),
      }),
    });
    const summarized = summarizeSchema(nestedSchema);
    // Note: zod-to-json-schema output structure might vary slightly but these should be present
    expect(summarized).toContain('"type":"object"');
    expect(summarized).toContain('"address":{');
    expect(summarized).toContain('"street":{"type":"string"}');
  });

  it("should handle Zod schema with jsonSchema property", () => {
    const zodSchemaWithJson = Object.assign(z.object({ a: z.string() }), {
      jsonSchema: { type: "object", properties: { a: { type: "string" } } },
    });
    const summarized = summarizeSchema(zodSchemaWithJson);
    expect(summarized).toEqual(
      JSON.stringify({ type: "object", properties: { a: { type: "string" } } }),
    );
  });
});