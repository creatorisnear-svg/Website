# Architecture

## Why it is built this way

**Zero npm dependencies.** The whole app is Node's standard library plus vanilla
browser JavaScript. `npm install` is not needed — clone and run. Nothing breaks in
six months because a transitive dependency was yanked, and there is no supply-chain
surface on a machine holding client phone numbers.

**JSON files, not SQLite.** A single-agent CRM handles a few thousand leads at most.
Plain JSON is fast enough, readable in any text editor, trivially backed up by copying
a folder, and avoids a native module that needs a compiler on Windows. Writes go
through a temp-file + atomic rename, so a crash or power cut cannot truncate a file.

**Local-only by default.** Bound to `127.0.0.1`. The dashboard holds names, phone
numbers and financial details of real families; it should not be reachable from the
network unless the operator deliberately opts in with `HOST=0.0.0.0`.

**No Facebook scraping.** See README. The Page is the business asset; an automation
ban would destroy more value than scraping could create.

## Layout

```
src/
  server.js              HTTP server, routing, static files, shutdown backup
  lib/
    http.js              router, body parsing, static serving, responses
    store.js             JSON datastore: atomic writes, cache, backups
    util.js              ids, dates, money, phones, templating
  domain/
    settings.js          config with deep-merge defaults + secret redaction
    market.js            Maricopa County + City of Maricopa cities, ZIPs, programs
    leads.js             lead model, scoring, dedupe, stages, tasks, activity
    commissions.js       referral math, pipeline valuation, all revenue reporting
    campaigns.js         campaigns, tracked short links, posts, calendar
    content.js           bilingual post/script generation, follow-up sequences
    prospecting.js       worklist builder, public-feed scanner, comment/CSV parsers
  integrations/
    facebook.js          Graph API Lead Ads sync (official API only)
  routes/
    api.js               JSON API for the dashboard
    public.js            bilingual landing pages, capture endpoint, /t/ redirects

public/
  app/                   dashboard SPA (ES modules, no framework)
    app.js               shell, nav, view dispatch, shared context
    lib.js               DOM helpers, API client, SVG charts, modals
    view-revenue.js      revenue dashboard + deals
    view-leads.js        lead list, pipeline board, lead drawer
    view-find.js         the five lead-acquisition channels
    view-content.js      content studio + campaigns
    view-settings.js     settings

scripts/                 seed, reset, backup, scan
```

## Data model

```
lead ──┬── activities   (append-only log)
       ├── tasks        (scheduled follow-ups)
       └── deal ─── payouts

campaign ── posts ── clicks
prospect                       (prospecting worklist item)
```

A lead carries `campaignId` and `utm`, so a closing traces back to the exact post
that produced it. That chain is what makes the source-ROI table meaningful.

## The two numbers that matter

**Lead score (0-100)** — `src/domain/leads.js`, `scoreLead()`. Weighted sum of
timeline, pre-approval, down payment, budget, reachability, in-market geography,
financing clarity and engagement; penalties for do-not-contact and unresponsiveness.
Returns a breakdown, not just a number, so the UI can show what is missing.

**Weighted pipeline value** — `src/domain/commissions.js`, `projectLeadValue()`.

```
fee        = price × agentCommissionPct × referralPct
weighted   = fee × stageProbability × (0.5 + score/200)
```

Blending stage probability with lead score stops a hot new lead and a cold new lead
from being valued identically.

## Extending it

**Add a post type** — add templates to `TEMPLATES` in `content.js` and an entry to
`POST_TYPES`. It appears in the studio automatically.

**Add a prospecting platform** — add an entry to `PLATFORMS` in `prospecting.js` with
a `build(query)` function. Optional `rss()` or `json()` makes it scannable too.

**Add a city** — add to `CITIES` in `market.js`. It flows into the landing page
dropdown, lead forms, campaign targeting and content generation.

**Change the commission model** — `computeDeal()` in `commissions.js` is the single
place money is calculated.

**Add an integration** — drop a module in `src/integrations/`, expose routes in
`routes/api.js`. Follow `facebook.js`: official APIs, tokens in settings, never scrape.

## Security notes

- Tokens live in `data/settings.json` on the local disk, never sent to the browser
  (`publicSettings()` redacts them, and a redacted placeholder cannot overwrite a
  real secret).
- The public capture endpoint accepts an optional shared secret (`X-Webhook-Secret`)
  for when the form is embedded on an external site.
- Static file serving resolves and range-checks paths, so `../` cannot escape `public/`.
- Request bodies are capped at 5 MB.
- `data/`, `backups/` and `config/config.json` are gitignored — real client data
  never gets committed.
