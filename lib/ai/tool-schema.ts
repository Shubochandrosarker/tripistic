import { z } from "zod";

/**
 * Zod → JSON Schema, for function-calling payloads.
 *
 * `lib/ai/tools.ts` previously described tool parameters as a bare list of key
 * names, with a comment explaining why: a hand-rolled converter that quietly
 * disagrees with the schema it claims to describe is worse than no converter,
 * because the model gets told a field is optional that validation then rejects.
 *
 * That reasoning is right, and this module is built to satisfy it rather than
 * to override it. Two properties make the difference:
 *
 *   - **It is total, not best-effort.** Every node type it does not understand
 *     throws at module scope during the test run rather than emitting `{}` and
 *     hoping. `describeToolParameters` is covered by a test that walks the real
 *     `AI_TOOLS` registry, so a tool added with an unsupported Zod construct
 *     fails CI instead of silently shipping a lying descriptor.
 *   - **It is not the validator.** `invokeTool` still re-parses every call
 *     against the actual Zod schema. A descriptor that drifts can therefore
 *     only cost a retry, never correctness — which is exactly the safety margin
 *     the original comment asked for.
 *
 * The supported subset is deliberately small: it is precisely what the tool
 * registry uses. Widening it is a normal change; guessing at it is not.
 */

export type JsonSchema = Record<string, unknown>;

export class UnsupportedSchemaError extends Error {
  constructor(typeName: string) {
    super(`Tool parameters use an unsupported Zod type: ${typeName}`);
    this.name = "UnsupportedSchemaError";
  }
}

function unwrapDescription(schema: z.ZodTypeAny, node: JsonSchema): JsonSchema {
  const description = schema.description;
  return description ? { ...node, description } : node;
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  // `.optional()`, `.nullable()` and `.default()` wrap the inner type. Required
  // -ness is decided by the parent object, so here they simply unwrap; the
  // default value is carried through because it tells the model what happens
  // when it omits the field.
  if (schema instanceof z.ZodOptional) return convert(schema.unwrap() as z.ZodTypeAny);
  if (schema instanceof z.ZodNullable) return convert(schema.unwrap() as z.ZodTypeAny);
  if (schema instanceof z.ZodDefault) {
    const inner = convert(schema.removeDefault() as z.ZodTypeAny);
    return { ...inner, default: schema._def.defaultValue() };
  }
  if (schema instanceof z.ZodEffects) return convert(schema.innerType() as z.ZodTypeAny);

  if (schema instanceof z.ZodString) {
    const node: JsonSchema = { type: "string" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") node.minLength = check.value;
      if (check.kind === "max") node.maxLength = check.value;
      if (check.kind === "datetime") node.format = "date-time";
    }
    return unwrapDescription(schema, node);
  }

  if (schema instanceof z.ZodNumber) {
    const node: JsonSchema = { type: schema.isInt ? "integer" : "number" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") node.minimum = check.value;
      if (check.kind === "max") node.maximum = check.value;
    }
    return unwrapDescription(schema, node);
  }

  if (schema instanceof z.ZodBoolean) return unwrapDescription(schema, { type: "boolean" });

  if (schema instanceof z.ZodEnum) {
    return unwrapDescription(schema, { type: "string", enum: [...schema.options] });
  }

  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    return unwrapDescription(schema, { type: typeof value === "number" ? "number" : "string", const: value });
  }

  if (schema instanceof z.ZodArray) {
    const node: JsonSchema = { type: "array", items: convert(schema.element as z.ZodTypeAny) };
    if (schema._def.minLength) node.minItems = schema._def.minLength.value;
    if (schema._def.maxLength) node.maxItems = schema._def.maxLength.value;
    return unwrapDescription(schema, node);
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convert(value);
      // A field with a default is not required of the caller: omitting it is
      // valid input that parses. Marking it required would make the model send
      // a value it has no basis for choosing.
      if (!value.isOptional()) required.push(key);
    }

    const node: JsonSchema = { type: "object", properties, additionalProperties: false };
    if (required.length > 0) node.required = required;
    return unwrapDescription(schema, node);
  }

  throw new UnsupportedSchemaError(schema.constructor.name);
}

/** Converts a tool's input schema into the `parameters` object providers expect. */
export function describeToolParameters(schema: z.ZodTypeAny): JsonSchema {
  const converted = convert(schema);
  // Providers require the top level of `parameters` to be an object schema.
  // A tool whose input is a bare scalar is a modelling mistake, not something
  // to paper over at the wire.
  if (converted.type !== "object") {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  return converted;
}
