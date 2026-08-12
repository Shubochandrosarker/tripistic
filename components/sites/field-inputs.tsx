"use client";

import { Plus, Trash2 } from "lucide-react";

import type { FieldDescriptor } from "@/lib/sites/section-registry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The properties panel's input layer.
 *
 * One renderer driven by the section registry's field descriptors, rather than
 * thirty hand-written panels. The registry is checked against the Zod schema by
 * a unit test, so a field that appears here is a field that exists — the usual
 * failure mode of a generic editor (an input bound to a prop that was renamed)
 * is caught in CI instead of by a customer whose edit silently did nothing.
 *
 * Values are passed up as plain JSON. Nothing here validates: validation
 * belongs to `validatePageContent` on save and on preview, and duplicating it
 * in the UI would create two rules that disagree.
 */

export type FieldValue = unknown;

type Setter = (value: FieldValue) => void;

const labelClass = "block text-xs font-medium text-muted-foreground";
const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent";

function Help({ text, id }: { text?: string; id?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1 text-[11px] leading-4 text-muted-foreground">
      {text}
    </p>
  );
}

/**
 * A labelled field whose help text is *described by*, not *named by*, the input.
 *
 * Putting the hint inside the `<label>` folds it into the accessible name, so a
 * screen reader announces "Image overlay Darkens the image behind the text.
 * Raise it if the headline is hard to read, spin button" every time focus lands
 * — and the same concatenation makes `getByLabel("Headline")` ambiguous with
 * "Subheadline". `aria-describedby` keeps the name short and the hint reachable.
 */
function Field({
  label,
  help,
  fieldId,
  children,
}: {
  label: string;
  help?: string;
  fieldId: string;
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const helpId = help ? `${fieldId}-help` : undefined;
  return (
    <div>
      <label className={labelClass} htmlFor={fieldId}>
        {label}
      </label>
      {children({ id: fieldId, "aria-describedby": helpId })}
      <Help text={help} id={helpId} />
    </div>
  );
}

/**
 * A DOM id for one input.
 *
 * Prefixed by the caller, because repeaters render the same descriptor once per
 * item: without a per-item prefix every "Heading" input in a five-column footer
 * would share an id, and a `<label for>` would point at whichever the browser
 * saw first — so clicking the third column's label would focus the first.
 */
function fieldIdFor(prefix: string, key: string, label: string): string {
  return `sf-${prefix}${key}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function asRecord(value: FieldValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: FieldValue): unknown[] {
  return Array.isArray(value) ? value : [];
}

function ImageInput({ value, onChange, label, help }: { value: FieldValue; onChange: Setter; label: string; help?: string }) {
  const image = asRecord(value);
  const patch = (key: string, next: string) => onChange({ ...image, [key]: next });
  return (
    <fieldset className="rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <label className={labelClass}>
        Image URL
        <input
          className={inputClass}
          value={String(image.url ?? "")}
          onChange={(event) => patch("url", event.target.value)}
          placeholder="https://…"
        />
      </label>
      <label className={cn(labelClass, "mt-2 block")}>
        Alt text
        <input
          className={inputClass}
          value={String(image.alt ?? "")}
          onChange={(event) => patch("alt", event.target.value)}
          maxLength={200}
        />
      </label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Describe what the image shows. Leave empty only when the image is decorative.
      </p>
      <label className={cn(labelClass, "mt-2 block")}>
        Caption
        <input
          className={inputClass}
          value={String(image.caption ?? "")}
          onChange={(event) => patch("caption", event.target.value)}
          maxLength={200}
        />
      </label>
      <Help text={help} />
    </fieldset>
  );
}

function CtaInput({ value, onChange, label }: { value: FieldValue; onChange: Setter; label: string }) {
  const cta = asRecord(value);
  const enabled = Boolean(cta.label || cta.href);
  return (
    <fieldset className="rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      {enabled ? (
        <>
          <label className={labelClass}>
            Button text
            <input
              className={inputClass}
              value={String(cta.label ?? "")}
              onChange={(event) => onChange({ ...cta, label: event.target.value })}
              maxLength={60}
            />
          </label>
          <label className={cn(labelClass, "mt-2 block")}>
            Link
            <input
              className={inputClass}
              value={String(cta.href ?? "")}
              onChange={(event) => onChange({ ...cta, href: event.target.value })}
              placeholder="/tours or https://…"
            />
          </label>
          <label className={cn(labelClass, "mt-2 block")}>
            Style
            <select
              className={inputClass}
              value={String(cta.style ?? "primary")}
              onChange={(event) => onChange({ ...cta, style: event.target.value })}
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="ghost">Ghost</option>
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onChange(undefined)}
          >
            Remove button
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange({ label: "Book now", href: "/tours", style: "primary" })}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Add button
        </Button>
      )}
    </fieldset>
  );
}

function StringListInput({
  value,
  onChange,
  label,
  itemLabel,
}: {
  value: FieldValue;
  onChange: Setter;
  label: string;
  itemLabel: string;
}) {
  const items = asArray(value).map((item) => String(item ?? ""));
  return (
    <fieldset className="rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <input
              className={cn(inputClass, "mt-0")}
              value={item}
              aria-label={`${itemLabel} ${index + 1}`}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              aria-label={`Remove ${itemLabel} ${index + 1}`}
              className="rounded p-1.5 text-muted-foreground hover:text-red-600"
              onClick={() => onChange(items.filter((_, position) => position !== index))}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...items, ""])}
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
        Add {itemLabel.toLowerCase()}
      </Button>
    </fieldset>
  );
}

function RepeaterInput({
  field,
  value,
  onChange,
  tours,
  idPrefix,
}: {
  field: Extract<FieldDescriptor, { kind: "repeater" }>;
  value: FieldValue;
  onChange: Setter;
  tours: TourOption[];
  idPrefix: string;
}) {
  const items = asArray(value).map(asRecord);

  function patchItem(index: number, key: string, next: FieldValue) {
    const updated = items.map((item, position) =>
      position === index ? { ...item, [key]: next } : item,
    );
    onChange(updated);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <fieldset className="rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{field.label}</legend>
      <Help text={field.help} />
      <div className="space-y-2.5">
        {items.map((item, index) => (
          <div key={index} className="rounded-md border border-border bg-muted/40 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                {field.itemLabel} {index + 1}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Move ${field.itemLabel} ${index + 1} up`}
                  disabled={index === 0}
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${field.itemLabel} ${index + 1} down`}
                  disabled={index === items.length - 1}
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${field.itemLabel} ${index + 1}`}
                  className="rounded p-1 text-muted-foreground hover:text-red-600"
                  onClick={() => onChange(items.filter((_, position) => position !== index))}
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {field.fields.map((child) => (
                <FieldInput
                  key={child.key}
                  field={child}
                  value={item[child.key]}
                  onChange={(next) => patchItem(index, child.key, next)}
                  tours={tours}
                  idPrefix={`${idPrefix}${field.key}-${index}-`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...items, {}])}
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
        Add {field.itemLabel.toLowerCase()}
      </Button>
    </fieldset>
  );
}

export type TourOption = { id: string; title: string; status: string };

function TourSelect({
  value,
  onChange,
  label,
  help,
  tours,
  idPrefix,
}: {
  value: FieldValue;
  onChange: Setter;
  label: string;
  help?: string;
  tours: TourOption[];
  idPrefix: string;
}) {
  return (
    <Field label={label} help={help} fieldId={fieldIdFor(idPrefix, "tour", label)}>
      {(inputProps) => (
        <select
          {...inputProps}
          className={inputClass}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">Not set</option>
          {tours.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.title}
              {tour.status !== "active" ? ` (${tour.status})` : ""}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function TourMultiSelect({
  value,
  onChange,
  label,
  help,
  tours,
}: {
  value: FieldValue;
  onChange: Setter;
  label: string;
  help?: string;
  tours: TourOption[];
}) {
  const selected = new Set(asArray(value).map(String));
  return (
    <fieldset className="rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      {tours.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          You have no tours yet. Create one and it will appear here.
        </p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {tours.map((tour) => (
            <li key={tour.id}>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selected.has(tour.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(tour.id);
                    else next.delete(tour.id);
                    onChange([...next]);
                  }}
                />
                <span className="truncate">{tour.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Help text={help} />
    </fieldset>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  tours,
  idPrefix = "",
}: {
  field: FieldDescriptor;
  value: FieldValue;
  onChange: Setter;
  tours: TourOption[];
  /** Namespaces DOM ids so repeated descriptors do not collide. */
  idPrefix?: string;
}) {
  switch (field.kind) {
    case "text":
    case "url":
    case "link":
      return (
        <Field label={field.label} help={field.help} fieldId={fieldIdFor(idPrefix, field.key, field.label)}>
          {(inputProps) => (
            <input
              {...inputProps}
              className={inputClass}
              value={String(value ?? "")}
              maxLength={field.kind === "text" ? field.maxLength : 2000}
              placeholder={field.kind === "text" ? field.placeholder : undefined}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </Field>
      );

    case "textarea":
      return (
        <Field label={field.label} help={field.help} fieldId={fieldIdFor(idPrefix, field.key, field.label)}>
          {(inputProps) => (
            <textarea
              {...inputProps}
              className={cn(inputClass, "resize-y")}
              rows={field.rows ?? 3}
              maxLength={field.maxLength}
              value={String(value ?? "")}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </Field>
      );

    case "number":
      return (
        <Field label={field.label} help={field.help} fieldId={fieldIdFor(idPrefix, field.key, field.label)}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="number"
              className={inputClass}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(event) => {
                // An empty box means "unset", not zero. Coercing it to 0 would
                // silently move a map to the equator.
                const raw = event.target.value;
                onChange(raw === "" ? undefined : Number(raw));
              }}
            />
          )}
        </Field>
      );

    case "boolean": {
      const id = fieldIdFor(idPrefix, field.key, field.label);
      const helpId = field.help ? `${id}-help` : undefined;
      return (
        <div className="flex items-start gap-2 text-sm text-foreground">
          <input
            id={id}
            type="checkbox"
            className="mt-0.5"
            aria-describedby={helpId}
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            <label htmlFor={id}>{field.label}</label>
            <Help text={field.help} id={helpId} />
          </span>
        </div>
      );
    }

    case "select":
      return (
        <Field label={field.label} help={field.help} fieldId={fieldIdFor(idPrefix, field.key, field.label)}>
          {(inputProps) => (
            <select
              {...inputProps}
              className={inputClass}
              value={String(value ?? field.options[0]?.value ?? "")}
              onChange={(event) => {
                // `columns` is a numeric union in the schema but a string in
                // the DOM. Coercing digits back keeps the saved value parseable.
                const raw = event.target.value;
                onChange(/^\d+$/.test(raw) ? Number(raw) : raw);
              }}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      );

    case "image":
      return <ImageInput value={value} onChange={onChange} label={field.label} help={field.help} />;

    case "cta":
      return <CtaInput value={value} onChange={onChange} label={field.label} />;

    case "stringList":
      return (
        <StringListInput
          value={value}
          onChange={onChange}
          label={field.label}
          itemLabel={field.itemLabel}
        />
      );

    case "tourId":
      return (
        <TourSelect
          value={value}
          onChange={onChange}
          label={field.label}
          help={field.help}
          tours={tours}
          idPrefix={idPrefix}
        />
      );

    case "tourIds":
      return (
        <TourMultiSelect
          value={value}
          onChange={onChange}
          label={field.label}
          help={field.help}
          tours={tours}
        />
      );

    case "breakpoints":
      return <BreakpointsInput value={value} onChange={onChange} label={field.label} help={field.help} />;

    case "repeater":
      return (
        <RepeaterInput
          field={field}
          value={value}
          onChange={onChange}
          tours={tours}
          idPrefix={idPrefix}
        />
      );
  }
}

const BREAKPOINTS = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
  { value: "mobile", label: "Mobile" },
] as const;

function BreakpointsInput({
  value,
  onChange,
  label,
  help,
}: {
  value: FieldValue;
  onChange: Setter;
  label: string;
  help?: string;
}) {
  const selected = new Set(asArray(value).map(String));
  return (
    <fieldset className="rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {BREAKPOINTS.map((breakpoint) => {
          const checked = selected.has(breakpoint.value);
          // The schema requires at least one breakpoint. Disabling the last
          // remaining checkbox is clearer than accepting the change and having
          // the save fail with a validation error the operator cannot place.
          const isLast = checked && selected.size === 1;
          return (
            <label
              key={breakpoint.value}
              className={cn("flex items-center gap-1.5 text-sm", isLast && "opacity-60")}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isLast}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(breakpoint.value);
                  else next.delete(breakpoint.value);
                  onChange([...next]);
                }}
              />
              {breakpoint.label}
            </label>
          );
        })}
      </div>
      <Help text={help} />
    </fieldset>
  );
}
