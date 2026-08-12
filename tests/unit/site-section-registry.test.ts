import { describe, expect, it } from "vitest";

import {
  LAYOUT_FIELDS,
  SECTION_DEFINITIONS,
  createSection,
  sectionDefinition,
  type FieldDescriptor,
} from "@/lib/sites/section-registry";
import { SITE_SECTION_TYPES, siteSectionSchema, validatePageContent } from "@/lib/sites/schema";

/**
 * The registry against the schema.
 *
 * These are the tests that keep the editor and the content contract from
 * drifting apart. Drift here is not a cosmetic problem: a default that fails
 * validation is an "Add section" button that throws, and a field descriptor
 * pointing at a prop that no longer exists is an input nobody notices does
 * nothing until a customer reports that their edit did not save.
 */

describe("section registry coverage", () => {
  it("defines an editor entry for every section type in the schema", () => {
    const defined = new Set(SECTION_DEFINITIONS.map((definition) => definition.type));
    const missing = SITE_SECTION_TYPES.filter((type) => !defined.has(type));
    expect(missing, "section types with no editor definition").toEqual([]);
  });

  it("does not define an entry for a type the schema does not accept", () => {
    const known = new Set<string>(SITE_SECTION_TYPES);
    const extra = SECTION_DEFINITIONS.filter((definition) => !known.has(definition.type));
    expect(extra.map((definition) => definition.type)).toEqual([]);
  });

  it("has no duplicate definitions", () => {
    const types = SECTION_DEFINITIONS.map((definition) => definition.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("newly created sections", () => {
  /**
   * The important one. Every "Add section" click must produce something the
   * schema accepts, or the button is broken for that type only — the kind of
   * defect that ships because nobody clicks all thirty.
   */
  it("produces a valid section for every type", () => {
    for (const type of SITE_SECTION_TYPES) {
      const section = createSection(type);
      const parsed = siteSectionSchema.safeParse(section);
      expect(
        parsed.success,
        `${type}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`,
      ).toBe(true);
    }
  });

  it("produces a page that validates when every section is added at once", () => {
    const sections = SITE_SECTION_TYPES.map((type) => createSection(type));
    expect(() => validatePageContent({ version: 1, sections })).not.toThrow();
  });

  it("gives every section a distinct id", () => {
    const ids = Array.from({ length: 50 }, () => createSection("hero").id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps ids inside the schema's 64-character limit", () => {
    for (const type of SITE_SECTION_TYPES) {
      expect(createSection(type).id.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("field descriptors", () => {
  function keysOf(fields: FieldDescriptor[]): string[] {
    return fields.map((field) => field.key);
  }

  /**
   * Every editable field must correspond to a prop the section actually has.
   *
   * Compared against the Zod *shape*, not against parsed output. Parsed output
   * omits optional props that were not supplied — `announcement.cta` is a real,
   * editable field that simply has no default — so checking the parsed object
   * would flag every optional field as bogus and force them all to be given
   * meaningless defaults just to satisfy the test.
   */
  it("only edits props the section defines", () => {
    for (const definition of SECTION_DEFINITIONS) {
      const option = siteSectionSchema.options.find(
        (candidate) => candidate.shape.type.value === definition.type,
      );
      expect(option, `${definition.type} has no schema option`).toBeDefined();
      const propKeys = new Set(Object.keys(option!.shape.props.shape));
      for (const key of keysOf(definition.fields)) {
        expect(propKeys.has(key), `${definition.type}.${key} is not a prop of that section`).toBe(true);
      }
    }
  });

  it("offers an editor field for every required prop, so nothing is uneditable", () => {
    for (const definition of SECTION_DEFINITIONS) {
      const option = siteSectionSchema.options.find(
        (candidate) => candidate.shape.type.value === definition.type,
      )!;
      const editable = new Set(keysOf(definition.fields));
      for (const [key, schema] of Object.entries(option.shape.props.shape)) {
        if (schema.isOptional()) continue;
        expect(editable.has(key), `${definition.type}.${key} is required but has no editor field`).toBe(
          true,
        );
      }
    }
  });

  it("has no duplicate field keys within a section", () => {
    for (const definition of SECTION_DEFINITIONS) {
      const keys = keysOf(definition.fields);
      expect(new Set(keys).size, `${definition.type} has duplicate fields`).toBe(keys.length);
    }
  });

  it("gives every repeater an item label so the editor can name the add button", () => {
    for (const definition of SECTION_DEFINITIONS) {
      for (const field of definition.fields) {
        if (field.kind === "repeater") {
          expect(field.itemLabel, `${definition.type}.${field.key}`).toBeTruthy();
          expect(field.fields.length).toBeGreaterThan(0);
        }
      }
    }
  });

  /**
   * Alt text is required by the schema, so the editor has to offer it. An
   * image repeater without an alt field would force every publish through a
   * validation error the operator cannot fix from the UI.
   */
  it("offers an alt-text field wherever an image is editable", () => {
    for (const definition of SECTION_DEFINITIONS) {
      for (const field of definition.fields) {
        if (field.kind === "repeater" && /logo|image/i.test(field.key)) {
          expect(keysOf(field.fields), `${definition.type}.${field.key}`).toContain("alt");
        }
      }
    }
  });

  it("edits only real layout keys", () => {
    const parsed = siteSectionSchema.parse(createSection("hero"));
    const layoutKeys = new Set(Object.keys(parsed.layout));
    for (const field of LAYOUT_FIELDS) {
      expect(layoutKeys.has(field.key), `layout.${field.key}`).toBe(true);
    }
  });

  it("marks the header and footer structural so the editor will not delete them", () => {
    expect(sectionDefinition("header")?.structural).toBe(true);
    expect(sectionDefinition("footer")?.structural).toBe(true);
    expect(sectionDefinition("hero")?.structural).toBeFalsy();
  });
});
