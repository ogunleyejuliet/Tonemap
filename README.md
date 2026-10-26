# Tonemap

**A Figma plugin that generates a complete Material 3 color system as Figma variables, and updates it in place when your brand color changes.**

Pick your brand colors once. Tonemap builds the tonal palettes, resolves every Material 3 color role for Light and Dark, and writes it all into Figma variables you can bind to your designs. Later, change a color and click **Update**: no deleting, no recreating, no broken bindings.

---

## Table of contents

1. [Why Tonemap exists](#why-tonemap-exists)
2. [Key concepts](#key-concepts)
3. [What you can do](#what-you-can-do)
4. [User journeys](#user-journeys)
5. [Plugin states at a glance](#plugin-states-at-a-glance)
6. [Safety guarantees](#safety-guarantees)
7. [What Tonemap does not do](#what-tonemap-does-not-do)
8. [Getting started](#getting-started)
9. [Project structure and architecture](#project-structure-and-architecture)
10. [Testing](#testing)
11. [Decisions](#decisions)
12. [Status and roadmap](#status-and-roadmap)
13. [FAQ](#faq)

---

## Why Tonemap exists

Setting up Material 3 color in Figma by hand means creating dozens of variables, picking the right tone for each role in Light and Dark, and keeping them in sync. When a brand color changes, the usual fix is to delete everything and rebuild, which breaks every design that was bound to those variables.

Tonemap removes that work:

- **Generate** the whole system in one click.
- **Update** it later without touching anything you did not ask it to change.

---

## Key concepts

| Term | Meaning |
| --- | --- |
| **Palette** | A tonal scale (tones from dark to light) generated from one input color. |
| **Role** | A named Material 3 color with a job, such as `primary`, `on-primary`, `primary-container` or `error`. Each role points to a tone in a palette. |
| **Fixed roles** | 12 roles (four each for primary, secondary, tertiary) that use the **same tone in Light and Dark**. |
| **Primitives collection** | The Figma variable collection holding `Key Colors` and `Color Palettes` with mode `Value`. Tonemap also stores your inputs on it (`m3gen_inputs`) so they can be restored. |
| **Color Roles collection** | The Figma variable collection holding the 57 Material 3 roles grouped under `Color Light` and `Color Dark` with mode `Value`. Every role value is an alias to a variable in `Primitives`. |
| **`m3gen_id`** | A hidden ID Tonemap stamps on every variable it creates. It lets Update find a variable even after you rename it. |

### The role set (57 roles)

Roles include `primary`, `secondary`, `tertiary`, `error`, `warning` and `success`, their `on-*` and container pairs, and the 12 fixed roles.

| Fixed role | Tone (Light and Dark) |
| --- | --- |
| `color/<name>-fixed` | 90 |
| `color/<name>-fixed-dim` | 80 |
| `color/on-<name>-fixed` | 10 |
| `color/on-<name>-fixed-variant` | 30 |

`<name>` is `primary`, `secondary` or `tertiary`. Fixed roles took the total from 45 to 57 roles and match Material Theme Builder and the Material color library.

---

## What you can do

**Create**
- Generate tonal palettes from your input colors.
- Build the full 57-role Material 3 system for Light and Dark as Figma variables.
- Get a consistent naming scheme, for example `color/primary`, `color/on-primary-container`, `color/primary-fixed-dim`.
- Have text contrast checked on the on-color pairs, with an auto-fix rule applied where a pair falls short.

**Come back later**
- Reopen the plugin and find your previous inputs restored.
- See immediately whether a system already exists (Create is disabled, Update is enabled).

**Update**
- Change a brand color and preview exactly what will change before anything is written.
- Apply the change in one click, with automatic rollback if something fails.
- Rename variables freely; Tonemap still recognizes them.
- Pick up newly added roles (for example the fixed roles) on an existing system without touching other variables.
- Work with either supported collection layout.

---

## User journeys

### Journey 1: First-time setup

*"I need a Material 3 color system for my new product."*

1. Open the plugin in a Figma file with no Tonemap system.
2. Enter your brand colors.
3. Review the generated palettes and role mapping.
4. Click **Create**. Tonemap writes the Palette collection and the Color variables.
5. Bind the variables to your designs.

**Result:** a complete Light and Dark system, with your inputs saved on the Palette collection.

### Journey 2: Reopening the plugin later

*"I closed the plugin yesterday. Where did I leave off?"*

1. Open the plugin in the same file.
2. Your saved inputs are restored automatically.
3. Create is disabled because a system made by Tonemap already exists, and Update is enabled.

**Result:** no re-entering colors, and no risk of creating a duplicate system.

### Journey 3: The brand color changes

*"The brand blue just got updated. Everything bound to the old blue needs to follow."*

1. Open the plugin and change the brand color.
2. Click **Update**. Tonemap compares the new plan with what is in the file.
3. Review the list of changes (added, changed, unchanged, no longer in the plan).
4. Click **Apply changes** to write them, or leave without applying to write nothing.

**Result:** variable values change in place, so every design bound to them updates automatically.

### Journey 4: Renaming variables to fit your team's conventions

*"We prefer our own variable names."*

1. Rename variables in Figma however you like.
2. Later, change a color and run Update.
3. Tonemap matches variables by `m3gen_id`, not by name, so it finds the renamed variables and updates their values.

**Result:** your names are kept and the values still stay in sync.

### Journey 5: An existing system gets new roles

*"I made my system before fixed roles existed."*

1. Open the plugin and click **Update**.
2. The changes list shows the missing roles (for example the 12 fixed roles) as **added**.
3. Click **Apply changes**.

**Result:** only the new roles are added. Nothing else is modified.

### Journey 6: Something goes wrong mid-update

*"The write failed partway."*

1. Tonemap detects the failure.
2. Every value it already changed is restored.

**Result:** your file ends up exactly as it was before you clicked Apply.

### Journey 7: Cleaning up variables you no longer need

*"I removed a role from my plan."*

1. Run Update. Variables no longer in the plan are **left unchanged** and listed for you.
2. Delete them manually in Figma if you want them gone.

**Result:** Tonemap never deletes anything on your behalf.

### Journey map

```mermaid
flowchart TD
    A[Open plugin] --> B{System made by<br/>Tonemap exists?}
    B -- No --> C[Enter brand colors]
    C --> D[Click Create]
    D --> E[Palettes + 57 roles<br/>written as variables]
    B -- Yes --> F[Saved inputs restored<br/>Create disabled]
    F --> G[Change a color<br/>or add new roles]
    G --> H[Click Update]
    H --> I[Compare: list of changes shown]
    I --> J{Apply changes?}
    J -- No --> K[Nothing written]
    J -- Yes --> L[Apply to Figma variables]
    L --> M{Write succeeded?}
    M -- Yes --> N[Done: values updated in place]
    M -- No --> O[Every changed value restored]
```

---

## Plugin states at a glance

| Situation | Create | Update | What happens |
| --- | --- | --- | --- |
| No Tonemap system in the file | Enabled | Disabled | You can generate a new system |
| System made by Tonemap exists | Disabled | Enabled | You can compare and apply changes |
| Update compared, nothing applied yet | Disabled | Enabled | Changes shown; the file is untouched until **Apply changes** |
| Update write fails | Disabled | Enabled | All changed values are restored |

### Supported layout (Layout version 3)

- Two collections: **Primitives** and **Color Roles**, each with a single mode named **Value**.
- If collections from older layouts exist without `m3gen_layout="3"` (layout 2 or older `Palette`, `Color`, `Color Light`, `Color Dark`), Create, Update, and Export are disabled with instructions to delete the older collections first.

---

## Safety guarantees

- **Preview before write.** Update never changes anything until you click **Apply changes**.
- **Match by ID, not name.** Renamed variables are still found and keep their new names.
- **Never deletes.** Variables no longer in the plan are left unchanged and listed.
- **Rollback.** If a write fails partway, every changed value is restored.
- **Minimal changes.** Only variables that actually differ are touched.
- **No duplicates.** Create is disabled once a Tonemap system exists.

---

## What Tonemap does not do

- It does not delete variables, collections or modes.
- It does not touch variables it did not create or cannot match.
- It does not edit your designs or rebind anything; it only manages variable values.
- It does not run Create on top of an existing Tonemap system. Use Update instead.

---

## Getting started

### Requirements

- Figma desktop app (needed to run a plugin from a local manifest)
- Node.js and npm

### Install and build

```bash
npm install
npm run build
```

### Load into Figma

1. In Figma desktop, open **Plugins > Development > Import plugin from manifest...**
2. Select this project's `manifest.json`.
3. Run it from **Plugins > Development > Tonemap**.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the plugin |
| `npm run lint` | Lint the source |
| `npm run typecheck` | Type check `src/` and `code.ts` with `tsc --noEmit` |
| `npm test` | Run the tests (also runs the type check, so type errors fail the run) |

> If any script name differs in your `package.json`, adjust this table to match.

---

## Project structure and architecture

```
Tonemap/
├── code.ts                  # Plugin main thread: reads and writes Figma variables
├── src/
│   ├── ui/
│   │   └── main.ts          # Plugin UI: collects inputs, builds the create payload, sends it to code.ts
│   └── variables/
│       ├── plan.ts          # Builds the plan and the pure compare function used by Update
│       └── plan.test.ts     # Unit tests for the plan and comparison
└── manifest.json            # Figma plugin manifest
```

Add any other folders (color math, palette building, role definitions) as they exist in your repo.

### How the pieces fit together

1. **UI** (`src/ui/main.ts`) collects your colors and builds a **create payload** made of `palettes`, `roles` and `roleRefs`.
2. **Main thread** (`code.ts`) receives the payload and reads or writes Figma variables.
3. **Planner** (`src/variables/plan.ts`) compares the desired system with what exists and produces the list of changes. The comparison is a **pure function**, which makes it easy to test.
4. On **Apply changes**, the plan is written to Figma, with rollback if anything fails.

The UI and the tests build the payload with **one shared function**, so the tests exercise exactly what the UI sends.

---

## Testing

Tests run with **Vitest**. Notable coverage:

- The Update comparison, as a pure function.
- Fixed roles, compared against the Material library's tonal spot scheme.
- Type checking is part of `npm test`, because Vitest alone does not check types.

---

## Decisions

The `src/colors/` system targets `@material/material-color-utilities` pinned at `0.3.0`, with these key architectural decisions:

1. **Primary and secondary are locked at tone 40; tertiary follows Material.** Primary locks tone 40 to the typed hex so the seed brand color survives untouched. Secondary locks tone 40 to the hex in the secondary field across Material default, harmony presets, and custom hex alike. Tertiary palette follows Material (built from its key color's hue and chroma, nothing replaced). Error, warning, and success are never locked.
2. **Primary keeps the seed's chroma.** Primary builds from its own HCT hue and chroma rather than muting to the library's fixed chroma 36.
3. **Container text uses tone 30.** `on-*-container` uses tone 30 in Light mode (90 in Dark), matching current dynamic Material Theme Builder specifications.
4. **Surface uses the newer N98/N6 values.** Background and surface use neutral tones 98 in Light and 6 in Dark.
5. **Layout version 4 (all lowercase collections, groups, and variables):** Organizes variables into two collections: `primitives` (containing `key colors` and `color palettes`) and `color roles` (containing `color light` and `color dark` role variables directly, without an extra `color` subgroup), each with a single mode named `Value`. Every role value is an alias to a `primitives` variable.
6. **All names lowercase and why:**
   - **Why all names lowercase:** All collection, group, and variable names created in Figma are completely lowercase to ensure absolute consistency across Figma variable hierarchies, design token specifications (W3C Design Tokens Community Group format), style dictionary pipelines, and multi-platform consumption (CSS custom properties, Android Compose, iOS). Lowercase naming eliminates casing mismatches, casing collisions across case-insensitive filesystems, and the need for ad-hoc case conversions during token handoff, creating seamless 1:1 parity between Figma variable paths and exported token keys.
   - **Collections:** `primitives` and `color roles`.
   - **Groups:** `key colors`, `color palettes` (with subgroups `primary`, `secondary`, `tertiary`, `neutral`, `neutral variant`, `error`, `warning`, `success`), `color light`, and `color dark`.
   - **Variables:** Key colors (`key colors/primary`, `key colors/neutral variant`, etc.), palette tones (`color palettes/primary/primary40`, `color palettes/neutral variant/neutral-variant40`, `color palettes/neutral/neutral4`, etc.), and roles (`color light/primary`, `color dark/on-primary`, etc.). All separators, spacing, and hyphens are preserved, only casing is made lowercase.
   - **Single source of truth:** All name building is centralized in helper functions within `src/variables/plan.ts` (`COLLECTION_NAMES`, `keyColorVariableName`, `paletteVariableName`, `roleVariableName`), ensuring that write planning, Figma variable creation, diff/update matching, JSON export, and unit tests strictly reuse the same definitions.
7. **Export format and token references:** Top-level keys and nested groups directly mirror the lowercase Figma layout:
   - Palette tokens nest under `primitives > color palettes > <palette> > <prefix><tone>` (e.g. `primitives > color palettes > primary > primary40`, `primitives > color palettes > neutral variant > neutral-variant40`).
   - Roles nest directly under mode keys: `color roles > color light > <role>` and `color roles > color dark > <role>`.
   - Role references use `{primitives.color palettes.<palette>.<prefix><tone>}` (e.g. `{primitives.color palettes.primary.primary40}`, `{primitives.color palettes.neutral variant.neutral-variant40}`).
8. **Layout versioning and older layouts:** `m3gen_layout` is set to `"4"`. Any file with an older layout number (tagged `m3gen="1"` with layout `"3"`, `"2"`, `"1"`, or untagged) is detected by its `m3gen` tag (not by collection name). Create, Update, and Export are disabled, and the plugin displays:
   `"This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create."`
   Nothing is deleted automatically, preserving user data and designs.

---

## Status and roadmap

| Phase | Status |
| --- | --- |
| Create a Material 3 variable system | Done |
| Fixed roles (12 added, 57 total) | Done |
| Update an existing system in place (Phase 4) | Done |

---

## FAQ

**Can I rename variables?**
Yes. Update matches by `m3gen_id`, so renamed variables are still found and keep your names.

**Will Update break my designs?**
It changes variable values in place, so bound designs follow the new colors. Nothing is deleted or unbound.

**Why is Create greyed out?**
A system made by Tonemap already exists in the file. Use Update to change it.

**What if I removed a role from my plan?**
Its variable is left as is and listed in the changes so you can delete it yourself.

**What if Update fails halfway?**
All values it already changed are restored.

**Why are fixed roles the same in Light and Dark?**
That is how Material 3 defines them: the same tone in both modes.

