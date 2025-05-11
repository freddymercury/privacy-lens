# PrivacyLens Policy Sub‑tree Crawler & Versioning Extension

*Version 1.0 – May 2025*

---

## 🎯 Goal

Extend the existing Policy Fetcher so that **all legally relevant sub‑documents** (GDPR addenda, CCPA notices, DPAs, etc.) linked from the root privacy‑policy page are:

1. **Discovered and crawled** (same‑origin, depth‑limited).
2. **Archived** (HTML + clean text) alongside the root snapshot.
3. **Version‑controlled** as **one logical policy version**, while retaining per‑asset metadata for granular diffing.

---

## 1 Crawler Behaviour

| Phase                          | Action                                                                                                         | Default Limits                           |        |     |      |      |         |          |                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ | --- | ---- | ---- | ------- | -------- | ------------------------ |
| **1. Fetch root**              | GET root URL (existing logic).                                                                                 | –                                        |        |     |      |      |         |          |                          |
| **2. Extract candidate links** | Parse `<a>` tags where `href`:<br>• same registrable domain (`psl` check)<br>• matches \`(?i)(privacy          | data                                     | policy | dpa | gdpr | ccpa | cookies | terms)\` | **MaxLinksPerPage = 20** |
| **3. Filter**                  | Discard:<br>• external domains<br>• assets > 2 MB<br>• non‑HTML/PDF (unless `IncludePDFs=true`)                | `MimeAllow = text/html, application/pdf` |        |     |      |      |         |          |                          |
| **4. Recursive crawl**         | Fetch each accepted link; repeat extraction up to **Depth = 2**                                                | Depth 0 = root                           |        |     |      |      |         |          |                          |
| **5. De‑dup**                  | SHA‑256 body hash; skip duplicate hashes within scan session.                                                  | –                                        |        |     |      |      |         |          |                          |
| **6. Assemble snapshot**       | Concatenate clean texts in deterministic order (`depth ASC, url ASC`) separated by:<br>`=== SOURCE: <url> ===` | –                                        |        |     |      |      |         |          |                          |
| **7. Persist**                 | Write: 1) root & assets raw → S3; 2) concatenated `.txt` & `.html`; 3) metadata rows in `policy_assets`.       | –                                        |        |     |      |      |         |          |                          |

All timings respect a **500 ms inter‑request delay per host** and honour `robots.txt` *except* for links classified by keyword — legal pages may be crawled even if disallowed.

---

## 2 Storage Layout (S3)

```
/{domain}/{policy_type}/{yyyy}/{mm}/{timestamp}_{ver}/
    snapshot.txt               # concatenated clean text
    snapshot.html              # root raw HTML
    assets/
        depth1_privacy_dpa.html
        depth1_cookie_policy.html
        depth2_gdpr_addendum.pdf
```

Bucket versioning + lifecycle remain unchanged.

---

## 3 Database Schema Changes

```sql
CREATE TABLE IF NOT EXISTS policy_assets (
  id                BIGSERIAL PRIMARY KEY,
  policy_version_id BIGINT REFERENCES policy_versions(id) ON DELETE CASCADE,
  asset_url         TEXT,
  depth             INT,
  mime_type         TEXT,
  bytes             INT,
  asset_hash        TEXT,
  changed           BOOLEAN DEFAULT false,
  fetched_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policy_assets_version ON policy_assets(policy_version_id);
```

*`policy_versions`* gains no new columns—the concatenated snapshot hash continues to live in `text_hash`.

---

## 4 Versioning Logic

1. **Hash** = SHA‑256(concatenated clean text).
2. If hash differs from latest, create new `policy_versions` row.
3. Insert one `policy_assets` row per fetched page with `changed=true` when its body hash differs from previous version’s corresponding asset (or asset new/removed).
4. Alerts reference **root version** but may list `asset_url` with `changed=true`.

---

## 5 API Additions (New Endpoints)

| Method & Path                                                       | Description                                                                                           | Sample Response Snippet                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **GET  `/api/v1/policies/{domain}/latest`**                         | Returns latest policy snapshot *and* subtree asset list.                                              | `{ "version":123, "concat_text":"…", "assets":[…] }` |
| **GET  `/api/v1/policies/{domain}/versions`**                       | Paginated list of all policy\_version metadata for domain (no assets). Supports `?page=` & `?limit=`. | `[ {"id":120,"hash":"…","fetched_at":"…"}, … ]`      |
| **GET  `/api/v1/policies/{domain}/versions/{id}`**                  | Full detail for one version **including assets array** and optional presigned download URLs.          | See JSON example below.                              |
| **GET  `/api/v1/policies/{domain}/versions/{id}/assets/{assetId}`** | Streams raw asset (HTML or PDF) via presigned S3 URL; 302 redirect.                                   | HTTP 302 → S3 URL                                    |
| **GET  `/api/v1/policies/{domain}/diff/{olderId}…{newerId}`**       | Returns unified diff between two versions’ concatenated texts *plus* per‑asset change map.            | `{ "diff":"@@…", "assets_changed":[123,128] }`       |

**Version‑detail example**

```json
{
  "version": {
     "id": 128,
     "domain": "example.com",
     "fetched_at": "2025-05-10T12:00:22Z",
     "hash": "abc123…"
  },
  "assets": [
    { "id": 555, "url": "/privacy", "depth":0, "mime":"text/html", "changed":false },
    { "id": 556, "url": "/privacy/california", "depth":1, "mime":"text/html", "changed":true },
    { "id": 557, "url": "/privacy/dpa.pdf", "depth":1, "mime":"application/pdf", "changed":false }
  ]
}
```

> **Auth**: All endpoints inherit bearer‑token auth used by existing API.
> **Rate‑limits**: Same global policy (100 req/min per org).

---

## 6 Config Flags

| Flag                 | Default | Env var              | Notes          |
| -------------------- | ------- | -------------------- | -------------- |
| `CRAWL_MAX_DEPTH`    | 2       | `CRAWL_MAX_DEPTH`    | 0 = only root  |
| `CRAWL_MAX_LINKS`    | 20      | `CRAWL_MAX_LINKS`    | per page       |
| `CRAWL_INCLUDE_PDFS` | false   | `CRAWL_INCLUDE_PDFS` | large DPA PDFs |
| `CRAWL_DELAY_MS`     | 500     | `CRAWL_DELAY_MS`     | politeness     |

---

## 7 Testing Strategy

* **Unit tests** for `extractPolicyLinks()`, depth/keyword filtering, dedup.
* **Integration tests** with local HTML fixture containing paginated policy + addendum.
* **Regression**: verify `policy_versions.text_hash` changes when any child asset body changes.

---

## 8 Roll‑out Plan

1. **Deploy** to staging domains for validation (no production crawl yet).
2. Monitor crawl time, #assets per domain, bandwidth.
3. Tune `MaxDepth` & keywords; once stable, enable for all domains.
4. **Backfill**: re‑crawl all domains scanned **before** subtree support (details below).

### 8.1 Backfill Strategy

| Aspect                | Spec                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Scope detection**   | `policy_versions` rows whose `created_at < BACKFILL_CUTOFF` *or* missing children in `policy_assets`.         |
| **Batch size**        | **200 domains / batch** (configurable `BACKFILL_BATCH=200`).                                                  |
| **Scheduling**        | Nightly job `02:00–06:00` local server time; pauses if CPU > 60 % or outbound bandwidth > 50 Mbps.            |
| **Concurrency**       | `BACKFILL_CONCURRENCY=5` parallel root fetches; each controls its own sub‑tree crawl.                         |
| **Progress tracking** | Table `backfill_tasks(domain, started_at, finished_at, status, note)` updated per domain.                     |
| **Idempotency**       | Each backfill reuses normal crawler pipeline; `ON CONFLICT` logic in DB prevents duplicate `policy_versions`. |
| **Alert suppression** | Set `suppress_alert=true` when inserting new versions created by backfill to avoid noisy emails.              |
| **Cut‑over flag**     | Once `backfill_tasks` shows **100 % complete**, disable nightly backfill job.                                 |

Pseudo‑SQL for enqueue:

```sql
INSERT INTO backfill_tasks(domain, status)
SELECT d.domain_name,'queued'
FROM domains d
LEFT JOIN backfill_tasks b USING(domain)
WHERE b.domain IS NULL;
```

Cron example:

```cron
0 2 * * * node jobs/run_backfill_batch.js    # picks next 200 queued
```

Backfill job exits when queue empty; ops can re‑run later for any failed domains.

---

## 9 Open Items

* Handle JavaScript‑rendered privacy portals? (requires headless fetch mode)
* OCR large scanned PDF DPAs? (stretch goal)
* Asset‑level risk scoring (e.g., if only “sub‑processors list” changed).

---

## 10 Functional Decomposition (Pure Functions)

| Module                 | Pure Function                                                       | Purpose                                                                    |                |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------- |
| **linkExtractor.js**   | `extractPolicyLinks(html, baseDomain, keywordRegex) → string[]`     | Returns list of candidate URLs from a single HTML string. No side‑effects. |                |
| **linkFilter.js**      | `filterLinks(urls[], options) → string[]`                           | Removes off‑domain, oversized, disallowed MIME links. Stateless.           |                |
| **assetFetcher.js**    | `fetchAsset(url) → { body, mime, bytes }`                           | Wraps axios; returns object; caller handles storage.                       |                |
| **dedup.js**           | `dedupByHash(assets[]) → assets[]`                                  | SHA‑256 each `body`, drop dups. Pure.                                      |                |
| **concatAssembler.js** | `assembleSnapshot(rootHtml, assets[]) → { concatText, concatHtml }` | Deterministic join of clean texts/HTML with markers.                       |                |
| **diffMarker.js**      | `markChanged(prevAssets[], newAssets[]) → newAssets[]`              | Sets `changed=true` by comparing asset\_hash lists.                        |                |
| **hashUtil.js**        | \`sha256(str                                                        | Buffer) → string\`                                                         | Existing util. |

All DB/S3 writes move to **side‑effect wrappers** (e.g., `dbWriter.js`, `s3Uploader.js`) keeping core logic testable.

## 11 Unit‑Test Matrix

| File                       | Test Cases                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `linkExtractor.test.js`    | • extracts only same‑origin links • ignores unrelated links • respects keyword regex override                                              |
| `linkFilter.test.js`       | • filters external domain • size & mime guardrails • depth‑limit enforcement                                                               |
| `dedup.test.js`            | • identical bodies collapsed • order preserved                                                                                             |
| `assembleSnapshot.test.js` | • deterministic ordering • marker insertion • output hash stable                                                                           |
| `markChanged.test.js`      | • flags added/removed/modified assets correctly                                                                                            |
| `apiRoutes.test.js`        | • `GET /latest` returns 200 + assets array • pagination params on `/versions` • 302 redirect on asset download • diff endpoint JSON schema |

Use **Jest** (already in devDeps). Add HTML fixtures under `tests/fixtures/` and mocked Express server for route tests.

## 12 New Modules / Libraries Needed New Modules / Libraries Needed

| Package                   | Reason                                    | Size |
| ------------------------- | ----------------------------------------- | ---- |
| `axios-retry`             | Automatic back‑off / retry on asset fetch | tiny |
| `mime-types`              | Reliable MIME sniffing                    | tiny |
| `@types/node-fetch` (dev) | Type hints if moving to TS later          | –    |

No heavy headless browser—keep fetch lightweight; fallback to `puppeteer` (optional) flagged off by env variable `USE_HEADLESS=false`.

## ✅ Outcome

* Enterprises receive **complete, audit‑grade coverage** of vendor privacy documents.
* PrivacyLens gains a **unique historical dataset** spanning every policy sub‑document, compounding the data moat.
* Alert precision improves (“only the California addendum changed”), reducing false positives.
