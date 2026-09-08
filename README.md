# Maricopa Buyer Engine

A local-first system for finding home buyers in the Maricopa, Arizona area, handing
them to **Daniel Oceguera AZ Real Estate** (602-625-5625), and tracking the referral
commission you earn on every closing.

Everything runs on your own PC. No accounts, no subscriptions, no cloud, no data
leaving your machine.

```
  ┌─────────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────────┐
  │ FIND BUYERS │ ──▶ │   PIPELINE   │ ──▶ │   AGENT    │ ──▶ │   REVENUE    │
  │  5 channels │     │ score + work │     │  referral  │     │ your commission │
  └─────────────┘     └──────────────┘     └────────────┘     └──────────────┘
```

---

## Start here (5 minutes)

**1. Install Node.js** — [nodejs.org](https://nodejs.org), pick the **LTS** button.
Nothing else to install; this project has zero npm dependencies.

**2. Start it**

| Windows | Mac / Linux |
|---|---|
| Double-click **`start.bat`** | Run **`./start.sh`** in Terminal |

Or from a terminal in this folder:

```bash
npm start
```

**3. Open the dashboard** → <http://127.0.0.1:4317/app/>

**4. Load demo data** so you can see how it all fits together:

```bash
npm run seed     # 15 sample leads, 4 deals, ~$6,200 in demo revenue
npm run reset    # wipe it when you are ready for real leads
```

**5. Set your commission split** — Settings tab. This drives every dollar figure
in the app. Default is 2.5% agent commission × 25% referral share.

---

## What it does

### 💵 Revenue — your money, tracked

The reason this exists. Shows what you have earned, what is under contract, and
what your open pipeline is worth.

- **Earned** — referral fees actually paid to you
- **Pending** — deals under contract, fee not yet received
- **Pipeline value** — every open lead's potential fee, weighted by how likely it
  is to close (stage probability × lead score), so the number is honest
- **Monthly chart** — 12 months of earned / pending / projected
- **Source ROI** — which channels actually produce money, with cost per lead
- **Best opportunities** — your open leads ranked by expected dollar value

**The math:**

```
agent commission = sale price × 2.5%
your fee         = agent commission × 25%   (+ any flat bonus)
```

A $400,000 home → $10,000 agent commission → **$2,500 to you**.
Both percentages are editable per deal and globally in Settings.

### 🎯 Find Buyers — five ways to get leads

| Channel | What it is | Best for |
|---|---|---|
| **Prospecting worklist** | Auto-generated buyer-intent searches across Facebook, Marketplace, Craigslist, Reddit, Nextdoor and Google — in Spanish and English, targeted at your cities | Daily grind, highest volume |
| **Paste FB comments** | Paste comments straight off a post; names, phones, ITIN mentions and "quiero comprar ahora" signals are extracted automatically | **Fastest wins** — these people already raised their hand |
| **Scan public sources** | Automated scan of Craigslist "housing wanted" and Reddit for people asking about buying in Phoenix | Passive discovery |
| **CSV import** | Old spreadsheets, open-house sign-in sheets, Lead Ads exports. English or Spanish column names | Bulk backfill |
| **Facebook Lead Ads** | Official Graph API sync from the agent's Page | When you run paid ads |

### 📄 Landing page — where the leads actually convert

A fast, mobile-first, **bilingual** capture page at `/l/itin`:

- Spanish by default (with a one-tap English toggle) — that is who is answering these posts
- Leads with ITIN, down payment, budget and timeline questions built in, so leads arrive pre-qualified
- Self-contained: no external fonts or scripts, loads instantly on cell data
- Every submission is scored and lands in your pipeline immediately

Preview: <http://127.0.0.1:4317/l/itin>

### ✍️ Content studio

Generates ready-to-post Facebook copy in **both languages**, written in the style
that already works on the agent's Page — emoji header, the beds/baths/sqft line,
the phone number, bilingual duplication.

Nine post types: listings, ITIN program, buyer tips, rent-vs-buy math, open houses,
testimonials, market updates, engagement questions, down-payment help.

Each post can carry a **tracked link** (`/t/abc123`), so when a lead closes six weeks
later, you know exactly which post earned you that commission.

There is also a weekly posting plan and the best posting times for Phoenix-area
Spanish-language audiences.

### 🤖 Automation — Claude in Chrome does the tedious part

Pair [Claude in Chrome](docs/CLAUDE-IN-CHROME.md) with this system and it will
collect comments off your posts, research buyers, draft your posts, and type each
follow-up message into the right conversation.

**Claude prepares, you send.** It types the message and stops; you read it and
press send. That keeps every message human-approved — which is what keeps the
account out of trouble, since automated outreach to strangers is what gets
Facebook accounts restricted.

The queue enforces the limits itself (25 messages/day, 8/hour, quiet hours), so
they hold regardless of how Claude is prompted. Setup is one copied prompt from
the **Automation** tab.

### 👥 Pipeline

- **Lead scoring, 0-100** — timeline, pre-approval, down payment, budget, reachability,
  whether they are in your market, engagement. Every score is explained in the lead
  drawer, so you know what is missing.
- **Seven stages** — New → Contacted → Qualified → Touring → Offer → Under Contract → Closed
- **Follow-up sequences** — three cadences (standard, ITIN buyer, ready-now) that
  schedule the whole touch plan in one click
- **Ready-to-send scripts** — eight message templates, auto-written in the lead's own
  language with their name and city filled in
- **Automatic de-duplication** — the same person from a comment, a form and a CSV
  becomes one lead, not three

---

## Daily routine (about 30 minutes)

```
 1. Revenue tab      → work "Today's follow-ups" from the top
 2. Content tab      → generate one post, copy it, post it to Facebook
 3. Find Buyers      → open 3-5 prospecting searches, comment genuinely
 4. Paste comments   → grab yesterday's comments off your post, import the leads
 5. Call the hot ones (score 70+) the same day — speed is the whole game
```

The single highest-value habit: **paste your Facebook comments in every day.**
Those people already asked. Nothing else converts close to it.

---

## Making the landing page public

By default everything is bound to `127.0.0.1`, so only your PC can reach it — the
right default for a system holding client phone numbers.

To use tracked links in real Facebook posts, expose the landing page:

```bash
# Free, no signup:
cloudflared tunnel --url http://localhost:4317

# Or:
ngrok http 4317
```

Copy the `https://…` URL it prints into **Settings → Public base URL**. Tracked
links will then use it automatically.

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the app |
| `npm run seed` | Load demo data |
| `npm run reset` | Wipe all data (backs up first) |
| `npm run backup` | Manual backup to `backups/` |
| `npm run scan` | Run a prospecting scan from the terminal |
| `PORT=5000 npm start` | Use a different port |
| `HOST=0.0.0.0 npm start` | Let other devices on your wifi reach it |

## Your data

Plain JSON in `data/`, readable in any text editor:

```
data/leads.json  activities.json  tasks.json  deals.json
     payouts.json  campaigns.json  posts.json  prospects.json
     clicks.json   settings.json
```

Backed up to `backups/` automatically every time you stop the server (Ctrl+C),
and on demand from Settings. To move computers, copy the whole folder.

Export any time: **Settings → Export everything (JSON)** or **Export leads (CSV)**.

---

## About Facebook scraping

This system **does not scrape Facebook**, deliberately.

Automated collection violates Meta's terms and gets accounts disabled. Losing the
agent's Page — 1,800 followers and every lead it produces — would cost far more than
scraping could ever earn. So instead it uses the three durable routes: targeted
searches you work by hand, a comment importer that makes the manual channel fast,
and the official Lead Ads API.

Craigslist and Reddit scanning uses their genuinely public feeds.

---

## Troubleshooting

**"Port 4317 is already in use"** → `PORT=4318 npm start`

**"Node.js is not installed"** → [nodejs.org](https://nodejs.org), LTS version, then restart your terminal.

**Dashboard says it cannot reach the server** → make sure the terminal window running `npm start` is still open.

**Facebook sync fails** → Page tokens expire after ~60 days. Generate a new long-lived token and paste it into Settings.

---

*Not affiliated with Meta. Equal Housing Opportunity. Follow Arizona Department of
Real Estate advertising rules and TCPA consent requirements when contacting leads.*
