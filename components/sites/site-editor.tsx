"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldInput, type TourOption } from "@/components/sites/field-inputs";
import {
  LAYOUT_FIELDS,
  SECTION_DEFINITIONS,
  SECTION_GROUPS,
  createSection,
  sectionDefinition,
  sectionLabel,
} from "@/lib/sites/section-registry";
import type { PageContent, SiteSection, SiteSectionType } from "@/lib/sites/schema";
import { cn } from "@/lib/utils";

/**
 * The visual editor.
 *
 * Three panes: the section list, a live preview, and the properties of
 * whatever is selected. A few decisions are load-bearing enough to write down.
 *
 * **The preview is server-rendered by the real renderer.** It is not a React
 * approximation of the published page — it is `lib/sites/render.ts`, the exact
 * function the publish pipeline calls, returned as HTML and framed. That costs
 * a round trip per change (debounced) and buys the only property that matters
 * in a site builder: what you see cannot diverge from what deploys.
 *
 * **History is a stack of whole documents, not a diff.** A page is at most 60
 * sections of bounded JSON, so snapshotting is cheap, and undo across a
 * reorder-then-edit sequence is exactly right by construction. Command-pattern
 * diffs would be smaller and would have inverse-operation bugs.
 *
 * **Autosave never publishes.** Saving writes the draft; the live site changes
 * only when someone presses Publish. That separation is what makes the editor
 * safe to leave open.
 */

const AUTOSAVE_DELAY_MS = 1_500;
const PREVIEW_DEBOUNCE_MS = 600;
const HISTORY_LIMIT = 50;

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<Device, number> = { desktop: 1440, tablet: 768, mobile: 375 };

type SaveState = "idle" | "saving" | "saved" | "error";

export type EditorPage = { id: string; path: string; title: string; content: PageContent };

export function SiteEditor({
  workspaceId,
  siteId,
  pages,
  tours,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  pages: EditorPage[];
  tours: TourOption[];
  canManage: boolean;
}) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? "");
  const [sections, setSections] = useState<SiteSection[]>(pages[0]?.content.sections ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const past = useRef<SiteSection[][]>([]);
  const future = useRef<SiteSection[][]>([]);
  const dragIndex = useRef<number | null>(null);
  // Guards the first render: mounting must not immediately mark the page dirty
  // and fire a save of content identical to what is already stored.
  const dirty = useRef(false);

  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? pages[0],
    [pages, activePageId],
  );

  /** Records history, then applies the change. */
  const commit = useCallback((next: SiteSection[]) => {
    setSections((current) => {
      past.current = [...past.current.slice(-HISTORY_LIMIT + 1), current];
      future.current = [];
      dirty.current = true;
      return next;
    });
  }, []);

  function undo() {
    const previous = past.current.pop();
    if (!previous) return;
    setSections((current) => {
      future.current = [...future.current, current];
      dirty.current = true;
      return previous;
    });
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    setSections((current) => {
      past.current = [...past.current, current];
      dirty.current = true;
      return next;
    });
  }

  function switchPage(pageId: string) {
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    past.current = [];
    future.current = [];
    dirty.current = false;
    setActivePageId(pageId);
    setSections(page.content.sections);
    setSelectedId(null);
    setSaveState("idle");
  }

  /* Autosave ------------------------------------------------------------- */

  useEffect(() => {
    if (!dirty.current || !canManage || !activePage) return;
    const handle = setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/sites/${siteId}/pages/${activePage.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { version: 1, sections } }),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setSaveError(payload?.error ?? "Could not save.");
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      } catch {
        setSaveError("Could not reach the server.");
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [sections, activePage, canManage, siteId, workspaceId]);

  /* Live preview --------------------------------------------------------- */

  useEffect(() => {
    if (!activePage) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/sites/${siteId}/pages/${activePage.id}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { version: 1, sections } }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setPreviewError(payload?.error ?? "This page cannot be rendered yet.");
          return;
        }
        setPreviewError(null);
        setPreviewHtml(await response.text());
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setPreviewError("Preview could not be loaded.");
        }
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [sections, activePage, siteId, workspaceId]);

  /* Section operations --------------------------------------------------- */

  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const definition = selected ? sectionDefinition(selected.type) : undefined;

  function addSection(type: SiteSectionType) {
    const section = createSection(type);
    commit([...sections, section]);
    setSelectedId(section.id);
    setLibraryOpen(false);
  }

  function duplicateSection(id: string) {
    const index = sections.findIndex((section) => section.id === id);
    if (index === -1) return;
    const source = sections[index];
    // A fresh id, because `validatePageContent` rejects duplicates — and
    // because two sections sharing an id would collide in the tour-slot map the
    // Worker builds at publish.
    const copy = { ...structuredClone(source), id: createSection(source.type).id } as SiteSection;
    commit([...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)]);
    setSelectedId(copy.id);
  }

  function removeSection(id: string) {
    commit(sections.filter((section) => section.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function toggleHidden(id: string) {
    commit(
      sections.map((section) =>
        section.id === id ? ({ ...section, hidden: !section.hidden } as SiteSection) : section,
      ),
    );
  }

  function moveSection(from: number, to: number) {
    if (to < 0 || to >= sections.length || from === to) return;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  function patchSelected(path: "props" | "layout", key: string, value: unknown) {
    if (!selected) return;
    commit(
      sections.map((section) =>
        section.id === selected.id
          ? ({ ...section, [path]: { ...section[path], [key]: value } } as SiteSection)
          : section,
      ),
    );
  }

  if (!activePage) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        This website has no pages yet. Add one from the Pages tab.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="editor-page">
            Page
          </label>
          <select
            id="editor-page"
            value={activePage.id}
            onChange={(event) => switchPage(event.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title} · {page.path}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" onClick={undo} disabled={!canManage} aria-label="Undo">
              <Undo2 aria-hidden className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={!canManage} aria-label="Redo">
              <Redo2 aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div role="group" aria-label="Preview size" className="flex gap-0.5 rounded-md bg-muted p-0.5">
            {(
              [
                ["desktop", Monitor],
                ["tablet", Tablet],
                ["mobile", Smartphone],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={device === value}
                aria-label={`${value} preview`}
                onClick={() => setDevice(value)}
                className={cn(
                  "rounded p-1.5",
                  device === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
              </button>
            ))}
          </div>

          <p className="min-w-[7rem] text-right text-xs text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : saveState === "saved" ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check aria-hidden className="h-3 w-3" /> Draft saved
              </span>
            ) : saveState === "error" ? (
              <span className="text-red-600">{saveError}</span>
            ) : canManage ? (
              "Autosaves as you edit"
            ) : (
              "Read-only"
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[17rem_1fr_20rem]">
        {/* Sections --------------------------------------------------- */}
        <div className="flex max-h-[46rem] flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">Sections</h2>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canManage}
              onClick={() => setLibraryOpen((open) => !open)}
              aria-expanded={libraryOpen}
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {libraryOpen ? (
            <div className="max-h-72 overflow-y-auto border-b border-border p-2">
              {SECTION_GROUPS.map((group) => {
                const items = SECTION_DEFINITIONS.filter(
                  (candidate) => candidate.group === group.id,
                );
                if (items.length === 0) return null;
                return (
                  <div key={group.id} className="mb-2">
                    <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    {items.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => addSection(item.type)}
                        className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <span className="block text-sm text-foreground">{item.label}</span>
                        <span className="block text-[11px] leading-4 text-muted-foreground">
                          {item.description}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}

          <ol className="flex-1 overflow-y-auto p-2">
            {sections.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                No sections yet. Add one to get started.
              </li>
            ) : null}
            {sections.map((section, index) => {
              const hidden = Boolean(section.hidden);
              const structural = sectionDefinition(section.type)?.structural;
              return (
                <li
                  key={section.id}
                  draggable={canManage}
                  onDragStart={() => {
                    dragIndex.current = index;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex.current !== null) moveSection(dragIndex.current, index);
                    dragIndex.current = null;
                  }}
                  className={cn(
                    "group mb-1 flex items-center gap-1 rounded-md border px-2 py-1.5",
                    selectedId === section.id
                      ? "border-accent bg-accent/5"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <GripVertical
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedId(section.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                  >
                    {sectionLabel(section.type)}
                    {hidden ? <span className="ml-1 text-xs text-muted-foreground">(hidden)</span> : null}
                  </button>
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleHidden(section.id)}
                      aria-label={hidden ? "Show section" : "Hide section"}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {hidden ? (
                        <EyeOff aria-hidden className="h-3.5 w-3.5" />
                      ) : (
                        <Eye aria-hidden className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => duplicateSection(section.id)}
                      aria-label="Duplicate section"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Copy aria-hidden className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || structural}
                      onClick={() => removeSection(section.id)}
                      aria-label={
                        structural ? "This section is part of the page structure" : "Delete section"
                      }
                      title={
                        structural
                          ? "The header and footer are part of every page and cannot be deleted."
                          : undefined
                      }
                      className="rounded p-1 text-muted-foreground hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Preview ----------------------------------------------------- */}
        <div className="overflow-hidden rounded-lg border border-border bg-muted/40 p-3">
          {previewError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {previewError}
            </p>
          ) : null}
          <div className="mx-auto overflow-hidden rounded-md bg-white shadow-sm" style={{ maxWidth: DEVICE_WIDTHS[device] }}>
            <iframe
              title={`Preview of ${activePage.title}`}
              srcDoc={previewHtml}
              // Scripts are denied outright. The rendered page contains only
              // markup this codebase generated, but the frame is the last place
              // that assumption should be load-bearing — and denying scripts
              // costs a static preview nothing.
              sandbox=""
              className="h-[42rem] w-full border-0"
            />
          </div>
        </div>

        {/* Properties -------------------------------------------------- */}
        <div className="max-h-[46rem] overflow-y-auto rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">
              {selected ? sectionLabel(selected.type) : "Properties"}
            </h2>
            {definition ? (
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {definition.description}
              </p>
            ) : null}
          </div>

          {!selected || !definition ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Select a section to edit its content.
            </p>
          ) : (
            <div className="space-y-3 p-3">
              {definition.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  tours={tours}
                  value={(selected.props as Record<string, unknown>)[field.key]}
                  onChange={(value) => patchSelected("props", field.key, value)}
                />
              ))}

              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-2.5 py-2 text-xs font-medium text-muted-foreground">
                  Layout
                </summary>
                <div className="space-y-2.5 border-t border-border p-2.5">
                  {LAYOUT_FIELDS.map((field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      tours={tours}
                      value={(selected.layout as unknown as Record<string, unknown>)[field.key]}
                      onChange={(value) => patchSelected("layout", field.key, value)}
                    />
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
