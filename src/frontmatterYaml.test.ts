import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => {
  const yaml = await import("yaml");
  return {
    stringifyYaml: (obj: unknown) => yaml.stringify(obj),
    parseYaml: (str: string) => yaml.parse(str),
  };
});

import { serializeFrontmatter, parseFrontmatter, mergeRelationNoteContent } from "./frontmatterYaml";
import { parseYaml } from "obsidian";

describe("serializeFrontmatter & parseFrontmatter (Issue #247)", () => {
  it("wraps serialized fields in a standard frontmatter block", () => {
    const raw = {
      type: "relation",
      title: "Simple Title",
    };
    const serialized = serializeFrontmatter(raw);
    expect(serialized.startsWith("---\n")).toBe(true);
    expect(serialized.endsWith("\n---\n")).toBe(true);

    const parsed = parseFrontmatter(serialized);
    expect(parsed).toEqual(raw);
  });

  it("round-trips titles with \", :, # and line breaks through parseYaml", () => {
    const trickyTitle = 'Satz: "Fundamentalsatz der Algebra" #1: Existenz & Eindeutigkeit\n(zweite Zeile)';
    const trickyDesc = 'Definition mit "Anführungszeichen", Doppelpunkt: hier und #Hashtags\nsowie Zeilenumbruch.';
    const fields = {
      type: "relation",
      title: trickyTitle,
      description: trickyDesc,
      status: "draft",
      sources: ["wiki/Algebra.md", 'wiki/Satz "A".md'],
      generated: {
        by: "MemVector Co-Pilot",
        at: "2026-10-15T12:00:00.000Z",
      },
      verified: null,
      relation_type: "PROVES",
      original_term: 'beweist: "direkt"',
      bidirectional: false,
      source_note: '[[wiki/Algebra|Algebra: "Grundlagen"]]',
      target_note: '[[wiki/Fundamentalsatz|Fundamentalsatz #1]]',
    };

    const serialized = serializeFrontmatter(fields);

    // Ensure the raw YAML block itself can be parsed with parseYaml
    const yamlBody = serialized.replace(/^---\r?\n/, "").replace(/\r?\n---\n?$/, "");
    const parsedDirect = parseYaml(yamlBody);
    expect(parsedDirect).toEqual(fields);

    // And verify through parseFrontmatter
    const parsedFromNote = parseFrontmatter(serialized);
    expect(parsedFromNote).toEqual(fields);
    expect(parsedFromNote?.title).toBe(trickyTitle);
    expect(parsedFromNote?.description).toBe(trickyDesc);
  });

  it("returns null when no frontmatter block is found", () => {
    expect(parseFrontmatter("Nur Notiztext ohne Frontmatter")).toBeNull();
    expect(parseFrontmatter("")).toBeNull();
  });
});

describe("mergeRelationNoteContent (Issue #246)", () => {
  it("preserves foreign frontmatter fields and updates MemVector-owned fields", () => {
    const existing = `---
type: relation
title: Old Title
description: Old Description
relation_type: REQUIRES
status: draft
id: 01JABCDEF1234567
thoughtmap:
  canvas: "Concepts.canvas"
tags:
  - math
  - prereq
---

# Relation: [[A]] -> [[B]]

- **Typ:** \`REQUIRES\`

## Grund
Old Description
`;

    const fresh = `---
type: relation
title: New Title
description: New Description
relation_type: PROVES
status: draft
sources:
  - wiki/A.md
  - wiki/B.md
---

# Relation: [[A]] -> [[B]]

- **Typ:** \`PROVES\`

## Grund
New Description
`;

    const merged = mergeRelationNoteContent(existing, fresh);
    const parsedFm = parseFrontmatter(merged);

    // Foreign fields preserved
    expect(parsedFm?.id).toBe("01JABCDEF1234567");
    expect(parsedFm?.thoughtmap).toEqual({ canvas: "Concepts.canvas" });
    expect(parsedFm?.tags).toEqual(["math", "prereq"]);

    // MemVector fields updated
    expect(parsedFm?.title).toBe("New Title");
    expect(parsedFm?.description).toBe("New Description");
    expect(parsedFm?.relation_type).toBe("PROVES");
    expect(parsedFm?.sources).toEqual(["wiki/A.md", "wiki/B.md"]);
  });

  it("preserves user notes before heading (prefix) and after reason (suffix)", () => {
    const existing = `---
type: relation
title: A -> B (REQUIRES)
description: Der Beweis basiert auf Lemma 1.
relation_type: REQUIRES
---

> [!NOTE] User commentary before heading

# Relation: [[A]] -> [[B]]

- **Typ:** \`REQUIRES\`

## Grund
Der Beweis basiert auf Lemma 1.

## Eigene Notizen
- Kevin: Überprüfen ob Lemma 2 auch benötigt wird.
`;

    const fresh = `---
type: relation
title: A -> B (PROVES)
description: Der Beweis beweist Satz B direkt.
relation_type: PROVES
---

# Relation: [[A]] -> [[B]]

- **Typ:** \`PROVES\`

## Grund
Der Beweis beweist Satz B direkt.
`;

    const merged = mergeRelationNoteContent(existing, fresh);

    expect(merged).toContain("> [!NOTE] User commentary before heading");
    expect(merged).toContain("## Grund\nDer Beweis beweist Satz B direkt.");
    expect(merged).toContain("## Eigene Notizen\n- Kevin: Überprüfen ob Lemma 2 auch benötigt wird.");
  });

  it("preserves user comments without heading appended after description", () => {
    const existing = `---
type: relation
title: A -> B
description: Original reason.
---

# Relation: [[A]] -> [[B]]

## Reason
Original reason.

Hier ist ein manueller Freitextkommentar ohne Überschrift.
`;

    const fresh = `---
type: relation
title: A -> B
description: Updated reason.
---

# Relation: [[A]] -> [[B]]

## Reason
Updated reason.
`;

    const merged = mergeRelationNoteContent(existing, fresh);
    expect(merged).toContain("## Reason\nUpdated reason.\n\nHier ist ein manueller Freitextkommentar ohne Überschrift.");
  });

  it("does not duplicate Markdown headings that belong to the description itself", () => {
    const descWithHeading = "First paragraph.\n\n### Evidence\nOld evidence.";
    const existing = `${serializeFrontmatter({
      type: "relation",
      title: "A -> B",
      description: descWithHeading,
    })}
# Relation: [[A]] -> [[B]]

## Didactic / Academic Reason
First paragraph.

### Evidence
Old evidence.
`;

    const fresh = `---
type: relation
title: A -> B
description: Replacement reason.
---

# Relation: [[A]] -> [[B]]

## Didactic / Academic Reason
Replacement reason.
`;

    const merged = mergeRelationNoteContent(existing, fresh);

    // Stale evidence must not be appended as user suffix
    expect(merged).not.toContain("Old evidence.");
    expect(merged).toContain("## Didactic / Academic Reason\nReplacement reason.");
  });

  it("preserves user custom introductory H1 section before generated relation heading", () => {
    const existing = `---
type: relation
title: A -> B
description: Old reason.
---

# My notes

## Reason
My own commentary

# Relation: A -> B

## Reason
Old reason.
`;

    const fresh = `---
type: relation
title: A -> B
description: New reason.
---

# Relation: A -> B

## Reason
New reason.
`;

    const merged = mergeRelationNoteContent(existing, fresh);

    expect(merged).toContain("# My notes\n\n## Reason\nMy own commentary");
    expect(merged).toContain("## Reason\nNew reason.");
    expect(merged).not.toContain("Old reason.");
  });

  it("does not alter plain text without frontmatter in legacy/unit tests", () => {
    expect(mergeRelationNoteContent("Original content", "New content")).toBe("New content");
  });
});
