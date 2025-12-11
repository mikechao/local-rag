import {
  LanguageModelV3Schema,
  ZodSchema,
} from "@ai-sdk/provider";
import { z } from "zod";
import * as ZodToJsonSchema from "zod-to-json-schema";

/**
 * Summarizes a Zod or JSONSchema7/Record into a compact string representation.
 * If the schema is too long, it will be truncated.
 * @param schema The schema to summarize.
 * @param maxLength The maximum length of the summarized schema string.
 * @returns A compact string representation of the schema.
 */
export function summarizeSchema(
  schema: LanguageModelV3Schema | ZodSchema<any, any>,
  maxLength: number = 2000,
): string {
  let schemaString: string;

  if ("jsonSchema" in schema) {
    // It's a LanguageModelV3Schema (e.g., ZodSchema with jsonSchema field)
    schemaString = JSON.stringify(schema.jsonSchema);
  } else if (schema instanceof z.ZodType) {
    // It's a pure Zod schema, convert to JSON schema first
    schemaString = JSON.stringify(ZodToJsonSchema.zodToJsonSchema(schema));
  } else {
    // Assume it's a JSONSchema7 or similar plain object
    schemaString = JSON.stringify(schema);
  }

  if (schemaString.length > maxLength) {
    // Truncate and add ellipsis
    return schemaString.slice(0, maxLength - 3) + "...";
  }

  return schemaString;
}

/**
 * Generates a JSON schema from a Zod schema using `zod-to-json-schema`
 * @param schema The Zod schema to convert
 * @returns A JSON schema object
 */
export function zodToJsonSchema(schema: z.ZodType<any>): any {
  return ZodToJsonSchema.zodToJsonSchema(schema);
}
