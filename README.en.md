# Manuscript Guard · Text-Only Manuscript Audit

[![CI](https://github.com/czjlc3c3c3/dsh-manuscript-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/czjlc3c3c3/dsh-manuscript-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **This repository is a self-maintained trimmed fork (F1) of [`xmutfyh/dsh-plugin-writing-guard`](https://github.com/xmutfyh/dsh-plugin-writing-guard), not upstream.**
> The Chinese README is the primary one: [`README.md`](README.md). This file is its English mirror.

**Less explanation. More argument. Preserve the science.** The plugin turns writing discipline into behaviour
constraints for the host model, then audits the result with a deterministic local rule engine — it does not write
your paper, and it does not ask another model to grade it.

---

## 1. What this fork changes

| Item | Detail |
|---|---|
| **Scope** | Plain-text manuscript audit only, for a personal research workflow (DSH profile `web`) |
| **Kept** | 5 text-side tools, plus the complete deterministic rule engine `src/rules.ts` (**rule logic untouched**) |
| **Removed** | The whole Word/Python surface: 8 `writing_word_*` tools, `src/word_guard/` (12 Python modules), the `.docx` extraction branch, and the `venv` / `DSH_PYTHON` dependency |
| **Removed** | The `autoAuditOnWrite` / `autoBrief` auto-injection machinery, which pushed a control block with a v3-era `source` into the agent inbox and tripped DSH session-format-v4 persistence admission, wedging the session's write channel. This fork **deletes the code path** rather than disabling it by config — the plugin now subscribes to **no** DSH events and uses only `ctx.tools` |
| **Version** | `2.1.0` (leaves the upstream 2.0.1 line) |
| **Compatibility** | Peer widened to `@deepseek-ai/dsh-tools: ^0.1.0-rc.6 \|\| ^0.2.0-rc.1`, covering both the npm stable line and the 0.2.x prerelease line; **no** `compatibility.json` exemption needed |
| **Not published to npm** | Install straight from git |
| **License** | MIT, upstream copyright notice retained |

---

## 2. Quick start

### Prerequisites

- DSH 0.1.x or 0.2.x (including `0.2.0-rc.*` / `0.2.1-alpha.*`)
- Node.js ≥ 18
- **No Python** (this fork has no Python dependency)

### Install

```sh
# Option 1 (recommended): pin a semver tag for reproducible dependencies
cd /root/.dsh/profiles/web
pnpm add "dsh-manuscript-guard@github:czjlc3c3c3/dsh-manuscript-guard#semver:^2.1.0"

# Option 2: via the dsh CLI
dsh plugin --profile web add github:czjlc3c3c3/dsh-manuscript-guard#semver:^2.1.0
```

Two manual steps remain after installing:

1. **Register the bundle in the profile**: add `"dsh-manuscript-guard"` to `dsh.profile.bundles` in the profile's
   `package.json`, and add `- id: dsh-manuscript-guard` / `name: dsh-manuscript-guard` to `cordis.patch.yml`
   (`id` is the row a profile-level config override targets; `name` decides which package is loaded — both are required).
2. **Allow build scripts**: a git install runs `postinstall`, which pnpm blocks by default. On
   `ERR_PNPM_IGNORED_BUILDS`:

   ```sh
   cd /root/.dsh/profiles/web && pnpm approve-builds --all && pnpm install
   ```

   > ⚠️ The allow-list key pnpm wants is the **resolved codeload URL plus the commit hash**, not just the package
   > name. **Re-installing a new tag or commit trips this again** — rerun the command above when it does.

### Restart

DSH must be restarted before the tools appear (restart is performed by the operator, not by any automation).
The plugin needs no configuration.

---

## 3. The five tools

| Tool | Purpose |
|---|---|
| **`writing_audit`** | The main tool. Scans manuscript text for writing-discipline issues; pass `filePath` or `text`, and use `profile` to declare the document type |
| **`writing_rules`** | Returns the writing-discipline cheat sheet (control-context isolation, argument economy, over-explanation, claim calibration, scientific integrity). Load it before drafting |
| **`writing_style_profile`** | Derives a **style rhythm fingerprint** from the author's past papers (sentence/paragraph length median, SD, CV; short/long sentence ratio; dash, hedge and connective densities) as JSON |
| **`writing_journal_profile`** | Distils a **journal writing profile** from representative target-journal papers (per-section syntax, citation, epistemic fingerprint and rhetorical-move distributions). Stores abstract statistics only, never source sentences |
| **`writing_delivery_audit`** | Delivery-surface leakage detection (CAL): whether rejected alternatives, revision-process residue or provenance leakage reach the final artifact (title, caption, filename, commit, PR, submission note, …) |

### `writing_audit` parameters

| Parameter | Meaning |
|---|---|
| `text` / `filePath` | One of the two. Plain text only: `.txt` / `.md` / `.markdown` / `.tex` (**no `.docx` / `.pdf`** — convert to Markdown first) |
| `profile` | `manuscript` / `rebuttal` / `cover_letter` / `review` / `notes` / `unknown`. Inferred from the path when omitted |
| `verbose` | `true` emits the hint and suggested fix for every finding |
| `projectResidueTerms` | Extra project-internal term list for this call only |
| `original` | **The pre-edit text.** Enables Scholarship Lock (numbers, percentages, p-values, CIs, citations, figure/table numbers, DOIs) and Epistemic Lock (claim-strength drift, negation/null-result flipping, vanished scope boundaries) |
| `styleProfile` | JSON produced by `writing_style_profile`. Enables sentence-length distribution drift detection |
| `journalProfile` | JSON produced by `writing_journal_profile`. Enables section-level Journal Fit auditing |

### How to read the output

Every finding carries a **severity** (HIGH / MEDIUM / LOW), a **confidence**, and a **kind** label:

| Label | Meaning | Suggested action |
|---|---|---|
| `INVARIANT` | A **scientific invariant was altered** (number, unit, negation, scope, …) | Always revert; this is not a style matter |
| `VIOLATION` | A clear rule violation (e.g. revision-process residue) | Remove it with the minimum necessary edit |
| `CANDIDATE` | A candidate: possibly defensive prose, **but it may carry a legitimate boundary** | Judge by hand; **do not delete mechanically** |
| `ADVISORY` | Advisory (mostly density/style statistics) | Weigh against the surrounding text |

> **"0 findings" is not a pass.** The rule engine is deterministic text heuristics with limited coverage;
> scientific correctness, logic and argument quality remain the author's responsibility.

---

## 4. The four protective layers

| Layer | Guards against | Representative rules |
|---|---|---|
| **STYLE** | Defensive prose, over-explanation, semantic restatement, template clichés | Revision-process residue (`revised`, `as requested`, 本轮, 审稿人要求), qualifier stacking, strong claims lacking evidence, self-deprecating disclaimers, `不是X而是Y`, restatement loops, triple parallelism, LLM high-frequency words (`delve` / `tapestry`, density-gated), over-long sentences and mean sentence length, dash density, Unicode math symbols |
| **EVIDENCE** | Polishing that silently changes research facts | Scholarship Lock (numbers, percentages, p-values, CIs, units, citations, figure/table numbers, DOIs), Epistemic Lock (`associated` must not become `caused`, null-result markers must not vanish, scope boundaries must survive), evidence-status conservation (`reported`/`observed`/`measured`/`estimated`/`simulated` must not be swapped) |
| **JOURNAL** | Mismatch with target-journal conventions | Section-level syntax, citation density, epistemic fingerprint and rhetorical-move distributions, reported as a fit percentage plus the main differences |
| **DELIVERY** | Workflow context leaking into the artifact | `REJECTED_ALTERNATIVE_LEAKAGE`, `REVISION_PROCESS_LEAKAGE`, `PROVENANCE_LEAKAGE`, `UNJUSTIFIED_NEGATIVE_REFERENCE`, `DELIVERY_CANDIDATE` |

There is also a **discourse-statistics layer** (v1.3): paragraph rhythm (fragmented / congested / over-uniform),
sentence-length rhythm uniformity, repeated logical scaffolding ("first, second, finally" reused across paragraphs),
punctuation-scaffold overload, coined framework terms, generic-claim candidates (multiple weak signals), and
**local citation integrity** (when a `.bib` sits beside `filePath`: `\cite` ↔ `.bib`, `\ref` ↔ `\label`,
missing entry fields, duplicate DOIs).

---

## 5. Design principles

1. **Critique is not content.** Reviewer comments, user instructions, guard findings and rejected alternatives are
   **control context**, not manuscript evidence. Their wording must never enter the prose unless authoritative
   material independently supports the resulting statement.
   For example: `To prevent data leakage, ...` → `Normalization parameters were estimated from the training data.`
   (state the method fact without importing the defensive motive).
2. **Prefer CUT over REWRITE.** If deleting a sentence preserves the scientific content and the argument, delete it;
   do not polish a useless sentence into another useless sentence.
3. **Do not close every semantic loop.** Stop after evidence plus the necessary calibrated interpretation; assume a
   specialist reader can take one obvious inferential step unaided.
4. **Minimal edit order**: `CUT → PRUNE → RECAST → SPLIT`. Do not automatically turn one hard sentence into three
   explanatory ones.
5. **Style-only requests default to the same length or shorter.**
6. **Baseline first**: the manuscript itself > the journal/template > plugin defaults.

These principles land in two places: the `writing_rules` cheat sheet (loaded before drafting) and the
`Manuscript Writing Policy` skill text.

---

## 6. How it works / architecture

```
dsh-manuscript-guard
├── src/index.ts      (21 KB)  Plugin assembly: registers 5 tools, uses only ctx.tools
├── src/rules.ts      (249 KB) Deterministic rule engine (the core asset, 97 exports)
├── src/delivery.ts   (36 KB)  Delivery Integrity detection (CAL)
├── skills/writing-guard/      SKILL.md + manifest.yaml (the natural-language trigger surface)
└── lib/                       Compiled output (**committed on purpose**)
```

**Zero network, zero LLM, zero external processes**: every decision is local text rules. Nothing is uploaded, no
model or endpoint is called, and no file outside the manuscript is read — the single exception being a `.bib`
sitting next to `filePath`, used for local citation checks.

### Why `lib/` is committed

DSH installs plugins from GitHub tarballs **without running a build step**. After editing `src/`, run `pnpm build`
and commit `lib/` too, or DSH will keep loading the old logic.

---

## 7. Tests

```sh
pnpm install
pnpm build
pnpm test        # 370 passed / 0 failed
```

370 assertions cover: revision-residue TP/TN, document-profile inference, defensive writing and claim calibration,
rhetorical patterns, density-gated LLM vocabulary, Scholarship/Epistemic Lock (claim ladder, evidence-status
conservation, negation and null-result flipping), the discourse-statistics layer (paragraph/sentence rhythm,
scaffolding, punctuation overload), Journal Profile distillation and Journal Fit, and Delivery Integrity (CAL).

---

## 8. Differences from upstream (maintenance notes)

| Difference | Detail |
|---|---|
| Tool count | 13 → **5** (the 8 `writing_word_*` tools are gone) |
| Manifest | `manifest.yaml`'s tool list went from 10 to 5 entries (upstream already omitted 3 word tools) |
| `rules.ts` | Only 3 lines differ: the file header comment, `PLUGIN_VERSION`, and the `rulesBrief()` title. **This is the only conflict point when merging upstream by hand** |
| No config | The plugin accepts no config (`autoAuditOnWrite` and friends were deleted with the code) |
| Install channel | Git only, never npm; consequently `packageManager` was dropped (it force-downgraded local pnpm to 11.x), at the cost of pinning pnpm explicitly in CI |

Restoring the Word side would be a separate task (roughly upstream's F2/F3 route); do not scatter Word code back
into this fork.

---

## 9. Privacy & security

- All auditing is local. No manuscript content is uploaded or collected.
- The plugin reads only the paths you pass to a tool, and **writes no state file at all** (the upstream incremental
  state layer was removed with the auto-audit machinery).
- It subscribes to no DSH events and performs no background work.
- See [SECURITY.md](SECURITY.md).

---

## 10. License

MIT, with the upstream copyright notice retained
(`Copyright (c) 2026 dsh-plugin-writing-guard contributors`). The rule engine and the design come from the upstream
author's work; this fork only trims it and adapts it to DSH 0.2.x.
