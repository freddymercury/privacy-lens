# PrivacyLens Policy Fetcher & Historical Versions API (JavaScript/Node.js)

---

## 1. Overview
This document contains:
1. **`policy-fetcher` microservice** ‑ a Node.js service that crawls a privacy‑policy URL, normalises the text, hashes it, compares to the last stored version and writes a new version + diff when required.
2. **First‑cut REST API specification** that exposes historical versions to downstream applications such as the PrivacyLens Chrome extension, agent SDKs or enterprise dashboards.

The code is written in **plain JavaScript (ES modules) running on Node 18+** and only uses the libraries already present in your `package.json` excerpt.

> **Env assumptions**: PostgreSQL (Supabase) for relational storage, Redis for transient locking/queuing, S3‑compatible object store for raw snapshots (can be Supabase Storage).

---

## 2. Directory Structure
```
policy‑lenses‑services/
├─ src/
│  ├─ fetcher/
│  │  ├─ index.js          # entrypoint for scheduled fetches
│  │  ├─ crawler.js        # downloads raw HTML
│  │  ├─ normaliser.js     # strips + cleans text
│  │  ├─ versioner.js      # hash, compare, store, diff
│  │  └─ utils.js          # helpers (hashing, DB, S3)
│  ├─ api/
│  │  └─ server.js         # Express REST gateway
│  └─ tests/               # Jest unit + integration tests
├─ .env
└─ package.json            # uses your deps list
```

---

## 3. Key Environment Variables ( `.env` )
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
S3_BUCKET=privacylens‑archive
S3_ENDPOINT=https://<region>.digitaloceanspaces.com
S3_ACCESS_KEY=
S3_SECRET_KEY=
REDIS_URL=redis://localhost:6379
FETCH_CONCURRENCY=5
```

---

## 4. `src/fetcher` Core Code

### 4.1 `crawler.js`
```js
import axios from "axios";

export async function fetchHTML(url) {
  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": "PrivacyLensBot/1.0 (+https://privacylens.dev)"
    },
    timeout: 15000
  });
  return data;
}
```

### 4.2 `normaliser.js`
```js
import { JSDOM } from "jsdom";

// Remove scripts, styles, and trim whitespace
export function htmlToCleanText(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  document.querySelectorAll("script,style,noscript").forEach(el => el.remove());
  const text = document.body.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}
```

### 4.3 `utils.js`
```js
import crypto from "node:crypto";
export function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
```

### 4.4 `versioner.js`
```js
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./utils.js";
import diff from "diff"; // lightweight text diff algorithm

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function upsertVersion({ domainId, policyType, url, rawHtml, cleanText }) {
  const textHash = sha256(cleanText);

  // 1. Fetch latest version for this policy
  const { data: latest, error } = await supabase
    .from("policy_versions")
    .select("id,text_hash")
    .eq("policy_id", domainId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;

  // 2. If hash unchanged → only log scan event
  if (latest && latest.text_hash === textHash) {
    await supabase.from("scan_events").insert({ domain_id: domainId, outcome: "no_change" });
    return { changed: false };
  }

  // 3. Store raw & clean snapshots (S3 or Supabase Storage)
  // (pseudo‑code) await uploadToS3(`${domainId}/${Date.now()}.html`, rawHtml);

  // 4. Insert new version row
  const { data: newVersion } = await supabase.from("policy_versions").insert({
    policy_id: domainId,
    version_number: latest ? latest.version_number + 1 : 1,
    normalized_text_snapshot: cleanText,
    text_hash: textHash
  }).select().single();

  // 5. Generate diff summary if previous exists
  let diffSummary = null;
  if (latest) {
    const changes = diff.diffWords(latest.normalized_text_snapshot, cleanText);
    diffSummary = changes.map(c => (c.added ? "[+" + c.value + "]" : c.removed ? "[-" + c.value + "]" : "")).join(" ");
    await supabase.from("policy_diffs").insert({
      policy_version_id_old: latest.id,
      policy_version_id_new: newVersion.id,
      diff_summary_text: diffSummary
    });
  }

  await supabase.from("scan_events").insert({ domain_id: domainId, outcome: "changed" });
  return { changed: true, version: newVersion.id, diffSummary };
}
```

### 4.5 `index.js` (Scheduled Runner)
```js
import schedule from "node-schedule";
import { fetchHTML } from "./crawler.js";
import { htmlToCleanText } from "./normaliser.js";
import { upsertVersion } from "./versioner.js";

// Example: every hour fetch policies for registered domains
schedule.scheduleJob("0 * * * *", async () => {
  const targets = await getDomainsToScan(); // SELECT from DB
  for (const t of targets) {
    try {
      const raw = await fetchHTML(t.url);
      const clean = htmlToCleanText(raw);
      await upsertVersion({ domainId: t.id, policyType: t.policy_type, url: t.url, rawHtml: raw, cleanText: clean });
      console.log(`Scanned ${t.domain_name}`);
    } catch (err) {
      console.error(`Failed to scan ${t.domain_name}`, err);
    }
  }
});
```

---

## 5. Express REST Gateway (Historical Versions API)

### 5.1 `src/api/server.js`
```js
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// GET latest policy text
app.get("/api/v1/policies/:domain", async (req, res) => {
  const { domain } = req.params;
  const { data, error } = await supabase.rpc("get_latest_policy", { p_domain: domain });
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Domain not found" });
  res.json(data);
});

// GET list of versions (metadata)
app.get("/api/v1/policies/:domain/versions", async (req, res) => {
  const { domain } = req.params;
  const { data, error } = await supabase.rpc("list_policy_versions", { p_domain: domain });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET specific version + diff to previous
app.get("/api/v1/policies/:domain/versions/:verId", async (req, res) => {
  const { verId } = req.params;
  const { data, error } = await supabase.rpc("get_version_with_diff", { p_version_id: verId });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`PrivacyLens API listening on ${PORT}`));
```

> **Note:** the `rpc()` calls reference Postgres functions that wrap the raw SQL joins — cleaner and permission‑controlled.

---

## 6. OpenAPI (YAML excerpt)
```yaml
openapi: 3.1.0
info:
  title: PrivacyLens Historical Policy API
  version: 0.1.0
paths:
  /api/v1/policies/{domain}:
    get:
      summary: Get latest policy snapshot & metadata for a domain
      parameters:
        - in: path
          name: domain
          required: true
          schema:
            type: string
      responses:
        200:
          description: Policy found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PolicySnapshot'
  /api/v1/policies/{domain}/versions:
    get:
      summary: List policy versions for domain
      parameters:
        - in: path
          name: domain
          required: true
          schema:
            type: string
      responses:
        200:
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/PolicyVersion'
components:
  schemas:
    PolicySnapshot:
      type: object
      properties:
        domain:
          type: string
        policy_type:
          type: string
        version_number:
          type: integer
        fetched_at:
          type: string
          format: date-time
        normalized_text:
          type: string
    PolicyVersion:
      allOf:
        - $ref: '#/components/schemas/PolicySnapshot'
        - type: object
          properties:
            diff_summary:
              type: string
```

---

## 7. Comprehensive Jest Test Suite

> **Goal** – Every pure function and main side‑effect is covered with deterministic tests. External calls (Supabase, S3, Axios) are stubbed with Jest mocks so tests run offline.

### 7.1 Test Utilities (`src/tests/helpers.js`)
```js
import crypto from "node:crypto";
export const SAMPLE_HTML = (
  `<html><head><title>TOS</title></head>` +
  `<body><script>bad()</script><p>Hello  <b>world</b></p></body></html>`
);
export const CLEAN_TEXT = "Hello world";
export const SHA256_CLEAN = crypto.createHash("sha256").update(CLEAN_TEXT).digest("hex");
```

### 7.2 `crawler.test.js`
```js
import axios from "axios";
import { fetchHTML } from "../../fetcher/crawler.js";
import { SAMPLE_HTML } from "./helpers.js";

jest.mock("axios");

describe("crawler.fetchHTML", () => {
  it("returns HTML body for valid URL", async () => {
    axios.get.mockResolvedValue({ data: SAMPLE_HTML });
    const html = await fetchHTML("https://example.com");
    expect(html).toBe(SAMPLE_HTML);
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("example.com"), expect.any(Object));
  });

  it("throws on network failure", async () => {
    axios.get.mockRejectedValue(new Error("timeout"));
    await expect(fetchHTML("https://bad.com")).rejects.toThrow("timeout");
  });
});
```

### 7.3 `normaliser.test.js`
```js
import { htmlToCleanText } from "../../fetcher/normaliser.js";
import { SAMPLE_HTML, CLEAN_TEXT } from "./helpers.js";

describe("normaliser.htmlToCleanText", () => {
  it("strips scripts/styles and reduces whitespace", () => {
    const txt = htmlToCleanText(SAMPLE_HTML);
    expect(txt).toBe(CLEAN_TEXT);
  });
});
```

### 7.4 `utils.test.js`
```js
import { sha256 } from "../../fetcher/utils.js";
import { CLEAN_TEXT, SHA256_CLEAN } from "./helpers.js";

describe("utils.sha256", () => {
  it("computes correct SHA‑256", () => {
    expect(sha256(CLEAN_TEXT)).toBe(SHA256_CLEAN);
  });
});
```

### 7.5 `versioner.test.js`
```js
// Uses jest mocks for @supabase/supabase-js
import { upsertVersion } from "../../fetcher/versioner.js";
import { createClient } from "@supabase/supabase-js";
import { CLEAN_TEXT, SAMPLE_HTML } from "./helpers.js";

jest.mock("@supabase/supabase-js", () => {
  const mClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    rpc: jest.fn(),
  };
  return { createClient: jest.fn(() => mClient) };
});

describe("versioner.upsertVersion", () => {
  const client = createClient();
  const mockLatest = { id: 1, version_number: 1, text_hash: "oldhash", normalized_text_snapshot: "old" };

  beforeEach(() => jest.clearAllMocks());

  it("creates new version when hash differs", async () => {
    client.select.mockReturnValueOnce({ data: mockLatest });
    client.single.mockResolvedValueOnce({ data: mockLatest });
    client.insert.mockResolvedValueOnce({ data: { id: 2, version_number: 2 } });
    const res = await upsertVersion({
      domainId: 42,
      policyType: "privacy",
      url: "https://example.com/privacy",
      rawHtml: SAMPLE_HTML,
      cleanText: CLEAN_TEXT
    });
    expect(res.changed).toBe(true);
    // verify insert diff called
    expect(client.insert).toHaveBeenCalledTimes(2);
  });

  it("returns unchanged when hash identical", async () => {
    client.select.mockReturnValueOnce({ data: { ...mockLatest, text_hash: sha256(CLEAN_TEXT) } });
    const res = await upsertVersion({ domainId: 42, policyType: "privacy", url: "", rawHtml: SAMPLE_HTML, cleanText: CLEAN_TEXT });
    expect(res.changed).toBe(false);
  });
});
```

### 7.6 API Route Tests (`api.test.js`)
```js
import request from "supertest";
import express from "express";
import apiServer from "../../api/server.js"; // assuming server exports app

const app = express();
app.use(apiServer);

describe("API routes", () => {
  it("404s unknown domain", async () => {
    const res = await request(app).get("/api/v1/policies/unknown.com");
    expect(res.status).toBe(404);
  });
});
```
---

## 8. At‑Rest Storage Layout (S3 / Supabase Storage)

*(unchanged‑see above)*

---

## 10. End‑to‑End Data Flow

```
 [ Scheduler ]
       |
       v
[Policy Fetcher Service]
  ├─ crawler.js   (HTTP GET -> raw HTML)
  ├─ normaliser.js (HTML -> clean text)
  ├─ utils.sha256 (clean text -> hash)
  └─ versioner.js
        ├─ compare hash with latest (Supabase)
        ├─ if new →
        │     ├─ INSERT policy_versions (Postgres)
        │     ├─ UPLOAD raw HTML  -> S3  /{domain}/{type}/{ts}_{ver}.html
        │     ├─ UPLOAD clean txt -> S3  /{domain}/{type}/{ts}_{ver}.txt
        │     └─ INSERT policy_diffs + scan_events (Postgres)
        └─ else → INSERT scan_events(outcome = "no_change")
```

1. **Scheduler** triggers `fetcher/index.js` hourly (or via BullMQ queue).
2. **crawler.js** downloads the target URL respecting robots/polite headers.
3. **normaliser.js** removes noise, yields deterministic clean text.
4. **utils.sha256** computes a hash for fast equality checks.
5. **versioner.js** performs one of two branches:
   - **No change**: only a lightweight row in `scan_events` (audit) → finish.
   - **Change detected**:
     1. Raw & clean artefacts are written to **S3** using the **object path convention** (bucket versioning also keeps previous overwrites).
     2. A new row in **`policy_versions`** captures metadata & snapshot.
     3. **`diffWords`** computes `diff_summary_text`; result stored in **`policy_diffs`**.
     4. A `scan_events` row marked `changed` finalises the audit trail.
6. **API layer** can now serve:
   - **Latest policy** (join `policy_versions` + S3 presigned URL for artefact)
   - **Historical list** (`policy_versions` for that domain)
   - **Specific version with diff** (`policy_versions` + `policy_diffs`)
7. **Downstream consumers** (plugin, enterprise dashboards, agent SDKs) pull via REST or Supabase RPC; signed URLs stream artefacts directly from S3 without load on the API server.

> **Every artefact is durable (S3, replicated), queryable (Postgres metadata), and auditable (scan_events trail).**

---

## 11. Next Steps At‑Rest Storage Layout (S3 / Supabase Storage)

**Bucket Choice**
- Use a single logically‑named bucket (e.g. `privacylens-archive`) in your preferred region.
- Enable **bucket‑level versioning** so every overwrite keeps historical copies automatically (defense‑in‑depth).

**Object Path Convention**
```
/{domain}/{policy_type}/
    ├─ {yyyy}/{mm}/
    │   └─ {timestamp}_{version}.{ext}
    └─ latest.{ext}          # convenience pointer (HTML or TXT)
```
- **`domain`** – canonicalised hostname (e.g. `example.com`).
- **`policy_type`** – `privacy`, `tos`, or `api_terms`.
- **`{timestamp}`** – Unix epoch in ms or ISO date (`20250505T120102Z`).
- **`{version}`** – monotonically increasing integer matching `policy_versions.version_number`.
- **`{ext}`** – `html` for raw snapshot, `txt` for normalised text.

**Example**
```
/example.com/privacy/2025/05/05/1714941662_3.html
/example.com/privacy/2025/05/05/1714941662_3.txt
/example.com/privacy/latest.html
```

**Metadata Tags (object‑level)**
- `x-amz-meta-domain` = `example.com`
- `x-amz-meta-policy-type` = `privacy`
- `x-amz-meta-version` = `3`
- `x-amz-meta-hash` = `<sha256>`

These mirror DB columns for redundancy and enable quick retrieval directly from the bucket if needed.

**Security Controls**
- **Encryption at rest**: SSE‑KMS (customer‑managed key) or SSE‑S3.
- **Block Public Access**: bucket policy denies `Principal: *`.
- **Least‑privilege IAM**: fetcher service has `PutObject`, API service has `GetObject`; no list access exposed publicly.

**Lifecycle Rules**
| Age | Action |
| --- | ------ |
| 0–12 months | Keep in **STANDARD** class (frequent access). |
| 12–36 months | Transition to **INTELLIGENT_TIERING**. |
| >36 months | Transition to **GLACIER_FLEXIBLE_RETRIEVAL** but retain indefinitely. |

This balances cost with compliance retention.

---

## 9. Next Steps
1. **Create the Postgres functions** (`get_latest_policy`, `list_policy_versions`, etc.) for efficient RPC access.
2. **Deploy the microservice** (Render, Fly.io, Supabase Edge Functions, etc.).
3. **Wire the scheduler** (node‑schedule or a job‑runner like BullMQ + Redis for concurrency).
4. **Extend diff generator** for HTML highlights (rendered view).
5. **Add semantic risk detection** with LlamaIndex and your private tune once data volume grows.

---

> Shipping this microservice & API gives you the **minimal vertical slice**: ↴
> *Data acquisition → version control → diff generation → external API consumption.*

You can now iterate quickly (add caching, queueing, semantic models) while **compounding historical coverage from day one**.

---

**End of spec.**

---

## 12. Integration Notes (for existing PrivacyLens Backend)

These notes clarify how the above specification should be integrated into the current `privacy-lens/backend` project structure.

1.  **Code Location:**
    *   The core fetching, normalizing, and versioning logic (`crawler.js`, `normaliser.js`, `versioner.js`, `utils.js`) should reside within the existing backend, likely under `backend/src/services/archiver/` or similar.
    *   The scheduled runner (`index.js` in the spec) should be implemented as a job, potentially in `backend/src/jobs/archiverJob.js`.
    *   The API endpoints should be added to the existing Express application (`backend/src/index.js`, `backend/src/api/index.js`).

2.  **Database Schema:**
    *   **Required Tables:** The following tables need to be created or adapted if equivalents exist:
        *   `policies` (or use existing `domains` table): Needs columns for `domain_id` (FK to `domains`), `policy_type` (e.g., 'privacy', 'tos'), `url` (the specific policy URL being tracked).
        *   `policy_versions`: Columns like `id`, `policy_id` (FK to `policies`), `version_number`, `fetched_at`, `normalized_text_snapshot` (or reference to storage), `text_hash`, `raw_snapshot_path` (storage path), `clean_snapshot_path` (storage path).
        *   `policy_diffs`: Columns like `id`, `policy_version_id_old` (FK to `policy_versions`), `policy_version_id_new` (FK to `policy_versions`), `diff_summary_text`.
        *   `scan_events`: Columns like `id`, `policy_id` (FK to `policies`), `scanned_at`, `outcome` ('changed', 'no_change', 'error'), `error_message` (nullable).
    *   **Relationships:** Ensure foreign keys are correctly defined. Clarify if `domainId` in the spec maps directly to the existing `domains` table's primary key.
    *   **RPC Functions:** The Postgres functions (`get_latest_policy`, `list_policy_versions`, `get_version_with_diff`) need to be created via SQL scripts (e.g., in `backend/scripts/`).

3.  **Storage:**
    *   Use **Supabase Storage** instead of generic S3.
    *   Utilize the existing Supabase client (`backend/src/utils/supabaseClient.js`) configured with the Service Role Key for uploads.
    *   Implement the `uploadToStorage` function (replacing pseudo `uploadToS3`) using the Supabase Storage API (`supabase.storage.from(bucket).upload(path, data)`).
    *   Adhere to the specified object path convention within the designated Supabase Storage bucket (defined by `S3_BUCKET` env var, e.g., `privacylens-archive`).

4.  **Scheduler:**
    *   Integrate `node-schedule` into the main backend process (`backend/src/index.js`) or create a separate entry point for running jobs.
    *   The job should query the `policies` (or equivalent) table to get the list of URLs to scan periodically (e.g., daily or weekly, configurable via env var).
    *   Initial implementation can use a simple loop; concurrency/locking (Redis) can be added later if needed.

5.  **Dependencies:**
    *   Add the `diff` package to `backend/package.json` (`npm install diff`).
    *   Add `node-schedule` if not already present (`npm install node-schedule`).
    *   **Link to Assessment Service:** The `assessmentTriggerService` (specifically `processUnassessedUrl`) should be responsible for adding entries to the `policies` table after a new policy URL is successfully found and assessed (and saved to the `websites` table). This ensures newly discovered policies are picked up by the `archiverJob`.

6.  **Environment Variables:**
    *   Ensure all required env vars (Supabase, Storage bucket, etc.) are added to `.env` and `.env.example`. The spec uses `S3_*` vars; these should be adapted for Supabase Storage if names differ (though Supabase client uses `SUPABASE_URL`/`KEY`). `S3_BUCKET` is still relevant.

7.  **API Implementation:**
    *   Add the specified API routes (`/api/v1/policies/...`) to the existing Express router setup in `backend/src/api/index.js`.
    *   Ensure appropriate authentication/authorization is applied if needed (the spec uses the Anon key, implying public access, but this might need review).
