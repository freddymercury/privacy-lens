# Assessment Rubric

The LLM privacy-assessment rubric is defined in `shared/assessment/rubric.json` — a versioned JSON file loaded at startup by `shared/assessment/core.js`. No rubric content is hardcoded in the prompts anymore; changing the rubric is a data change, not a code change.

## Fields

- `version` — semver string (e.g. `"2.0.0"`). Bump it on every rubric change. Exported as `RUBRIC_VERSION` from `shared/assessment/core.js`.
- `riskLevels` — the 4 risk levels (`High`, `Medium`, `Low`, `Unknown`), each with a `definition` string that is included verbatim in the LLM prompt.
- `categories` — array of assessment categories. Each has:
  - `name` — the category label used in prompts, parsed responses, and saved assessments. Renaming a category changes the keys stored in the `privacy_assessment` JSONB column, so treat renames as breaking.
  - `definition` — what the category covers; included in the prompt.
  - `anchors` — concrete criteria for `High`, `Medium`, and `Low` (2–3 indicators per level). These anchor the LLM's rating per category.
- `aggregation` — how chunk-level results are combined:
  - `categoryAcrossChunks`: `"max"` (highest risk seen in any chunk wins) or `"majority"` (most common non-Unknown risk across chunks; ties break toward higher risk).
  - `overall`: `"max"` (highest category risk) or `"majority"` (most common non-Unknown category risk; ties break toward higher risk).

The rubric is validated on load — a missing file, bad semver, wrong number of risk levels, or a category missing anchors throws immediately with a descriptive error.

## How to update the rubric

1. Edit `shared/assessment/rubric.json` (anchor texts, definitions, categories, or aggregation).
2. Bump `version` (patch for wording tweaks, minor for anchor/definition changes, major for category renames or structural changes).
3. Run `cd shared && npx jest` — `assessment/rubric.test.js` validates the file's structure.
4. Redeploy the backend (and any other process that loads `@privacy-lens/shared`). The rubric is read once at process start.

## Provenance

Every assessment produced by `backend/src/services/llmService.js#assessPrivacyPolicy` is stamped with:

- `rubricVersion` — the rubric version in effect, and
- `model` — the LLM model actually used (`LLM_MODEL` env var, default `gpt-4o-mini`).

These fields are saved alongside the scores in the `privacy_assessment` JSONB column, so assessments produced under different rubrics can be distinguished and old scores can be re-run or excluded when comparing. The LLM call uses `temperature: 0` so results are as reproducible as possible for a given rubric version.

Each category result may also include an `evidence` field — a verbatim quote from the policy that the LLM gave as the basis for its rating. When assessments are combined from chunks, the evidence of the winning chunk is kept.
