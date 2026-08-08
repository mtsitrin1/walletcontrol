# walletcontrol v1 — Design

## Purpose

A self-hosted personal finance app for Israeli banks/cards, in the spirit of
RiseUp (riseup.co.il): aggregate transactions, categorize them, and give a
basic view of where money goes. v1 is deliberately narrow — single user,
no budgeting logic, no forecasting.

Three reference repos were reviewed as prior art: `Spent` (Next.js/SQLite,
AI categorization, budget pacing, 3 banks only), `caspion` (Electron,
mature `israeli-bank-scrapers` wrapper, no persistence), `clarify-expences`
(Next.js/Postgres, broad bank coverage, manual recurring/savings tracking).
None is used as-is; this design ports specific pieces from each (see
Non-Goals and per-section notes) into a fresh scaffold.

## v1 Scope

**In scope:**
- Bank/card aggregation (scraper) for all major Israeli banks/cards, plus
  manual transaction entry as a fallback/supplement.
- AI-assisted transaction categorization, user-correctable.
- Basic dashboard: transaction list + category breakdown.
- Single user, self-hosted via Docker.

**Out of scope for v1 (tracked as GitHub issues in chich12/walletcontrol):**
- #1 Recurring/subscription detection
- #2 Cash-flow forecasting
- #3 Budgeting / safe-to-spend
- #4 Savings goals
- #5 Alerts/notifications
- #6 Multi-user support (per-user encrypted credentials/transactions,
  shared `merchant_memory` with per-user override on conflict)

## Architecture

Single Next.js app + Postgres, one Docker Compose stack (two containers:
app, db). Scraping runs as a cron job inside the app process (plus a
manual "sync now" action) and writes directly to Postgres — no separate
worker service or queue. A second service would be pure overhead for a
single-user app; easy to split out later if that ever changes.

TLS/reverse proxy is the deployer's responsibility, not the app's.

## Data Model (Postgres)

- `accounts` — id, scraper_type, display_name, credentials_encrypted,
  last_scraped_at
- `transactions` — id, account_id (nullable for manual entries), date,
  amount, currency, merchant/description, category_id, source
  (`scraped`|`manual`), dedup_hash (bank external_id when available, else
  hash(merchant+date+amount) — see Scraping Flow), created_at
- `categories` — id, name, parent_id (nullable, for hierarchy)
- `merchant_memory` — merchant_pattern → category_id
- `scrape_runs` — id, account_id, started_at, finished_at, status,
  error_message

No user/household tables in v1 — a single shared password gates the app.

## Scraping Flow

1. Cron job (every few hours) iterates accounts with stored encrypted
   credentials; a manual "sync now" button triggers the same path on
   demand.
2. Decrypt credentials in memory, run `israeli-bank-scrapers` per account.
   Ported from caspion: per-account error isolation (one failing bank
   doesn't block the others), proxy support carried over if needed.
3. Dedupe incoming transactions before insert. Prefer the bank/scraper's
   own transaction identifier (`external_id`) as the dedup key when the
   scraper provides one; fall back to a content-hash (merchant+date+amount)
   only when no external_id is available. A pure merchant+date+amount hash
   collides on legitimate same-day duplicates (e.g. two identical coffee
   purchases), so external_id is preferred whenever exposed.
4. Record outcome in `scrape_runs` for visibility on the dashboard.

## Categorization Flow

1. On insert, check `merchant_memory` for a match first — instant,
   no API call. Lookup normalizes the raw merchant string before matching
   (case-insensitive, trimmed, whitespace-collapsed) so near-duplicate
   merchant strings from different banks/scrapers still hit. Exact
   normalized-string match for v1; fuzzy matching is a future enhancement.
2. On miss, call a pluggable AI provider (Claude primary, interface
   modeled on Spent's provider abstraction) with the transaction
   description/amount and existing category list.
3. If the AI provider call fails (timeout, error, rate limit), the
   transaction is still inserted as `Uncategorized` rather than blocking
   the scrape — a categorization failure must never block data ingestion.
4. User can override any transaction's category in the UI; the override
   updates `merchant_memory` so that merchant never needs an AI call
   again.
5. Manually-entered transactions go through the same pipeline.

## Dashboard

- Transaction list: filter by account/date range/category, inline
  category edit.
- Category breakdown for the selected month.
- Account list showing last-sync status and any scrape errors.
- Manual transaction entry form.
- Settings: manage accounts (add/remove bank credentials), manage
  categories.

## Security

- Single bcrypt password + signed session cookie (`iron-session`) gating
  all routes. No hand-rolled crypto for auth.
- Bank credentials encrypted at rest with AES-256-GCM; encryption key
  comes from an env var, not stored in the app volume.
- TLS terminated by a reverse proxy in front of the Compose stack —
  out of scope for the app itself.

## Testing

No test framework dependency. Node's built-in `node:test` covers the
handful of things with real logic to break:
- dedup-hash computation
- merchant-memory lookup/override
- credential encrypt/decrypt round-trip

## Deployment

Docker Compose: `app` (Next.js) + `db` (Postgres) containers. Env vars:
DB connection string, `ENCRYPTION_KEY`, `APP_PASSWORD_HASH`, AI provider
API key.

## Explicitly Skipped (YAGNI)

- A categorization rules-engine table — merchant_memory + AI covers
  "editable categorization" without it.
- Any multi-user schema (tracked as issue #6, not built now).
- Any queue/worker service for scraping.

Add these if v1 usage shows a concrete need (AI cost/latency becomes a
problem, or a second real user shows up).
