# Running this with Claude in Chrome

Claude in Chrome can take over most of the tedious work: reading comments off
posts, researching buyers, drafting posts, and typing each message into the right
conversation.

**The one rule: Claude prepares, you send.**

Claude types the message and stops. You read it and press send. This costs a
couple of seconds per lead and removes the risk that actually matters — automated
messages going out to strangers is what gets Facebook accounts restricted, and
this account is the family business's main source of leads.

---

## Setup

1. Start the app (`npm start`) and leave it running.
2. Open the dashboard → **Automation** tab.
3. Click **📋 Copy starter prompt**.
4. Open Claude in Chrome and paste it.

The starter prompt contains your agent token, which is how Claude reaches the
app. Every request needs it as an `X-Agent-Token` header. Without it the API
refuses — that's deliberate, since any page you have open could otherwise read
your lead list.

Don't paste the token into a public chat, a shared doc, or a screenshot. If it
leaks, hit **Regenerate token** and re-copy the starter prompt.

---

## The four jobs

### 1. Collect comments (do this daily — highest value)

Every comment on a post is someone who raised their hand. This is the single
best use of Claude's time.

> Open my post at [URL], expand every comment, and add everyone who shows
> buying interest to the app. Don't message anyone.

Claude reads the thread, pulls out names, phone numbers, ITIN mentions and
urgency signals, and POSTs them to `/api/agent/comments`. They arrive scored and
de-duplicated against everyone already in the system.

Comments with no buying signal ("nice house", "🔥") are filtered out
automatically and reported back to you, so junk doesn't end up in your outreach
queue.

### 2. Prepare messages

> Check the queue and prepare the messages.

Claude fetches `/api/agent/queue`, which returns leads whose follow-up is due —
highest score first — each with the exact message already written in that
person's language with their name and city filled in. Claude opens the
conversation, types it, and stops.

Then you go to the **Automation** tab, read each one, press send in Facebook, and
click **✓ I sent it**. Only then does it count as a contact and advance the lead.

### 3. Research buyers

> Work through the prospecting searches and add anyone who's actually looking.

Claude opens the searches from `/api/agent/searches` — buyer-intent queries
across Facebook, Marketplace, Craigslist, Reddit and Nextdoor — reads the
results, and adds real prospects as leads. Read-only; it won't message anyone.

### 4. Draft the day's post

> Get today's post and put it in the composer.

Claude fetches `/api/agent/post-today`, which returns the post type scheduled for
today plus copy in Spanish and English with a tracked link. Claude pastes it into
the composer and stops. You add photos and press Post.

---

## A normal session

```
You:    Check the queue and prepare today's messages.
Claude: 5 prepared. Stopped at 5 — the hourly limit is 8 and 3 went out already.
You:    [read each one in the Automation tab, send the good ones]
You:    Now collect the comments from yesterday's ITIN post: [URL]
Claude: Found 14 commenters. Added 9; skipped 5 with no buying signal.
        2 were already in your system.
You:    Refresh the queue and prepare messages for the new ones.
```

---

## Limits

Set under **Automation → Safety limits**:

| | Default |
|---|---|
| Messages per day | 25 |
| Messages per hour | 8 |
| Seconds between actions | 45 |
| Quiet hours | 9pm – 8am (Settings → outreach) |

These are enforced by the queue, not by Claude's judgement — it can't hand out
more than this no matter how it's asked. When blocked, Claude is told why and
should tell you rather than working around it.

The defaults are set where normal activity sits. Twenty-five thoughtful messages
a day to people who commented on your posts looks like a busy agent. Two hundred
identical ones looks like a bot, and gets treated as one.

---

## If Claude misbehaves

It should never press send, publish a post, or contact someone who didn't come
from the app's queue. If it does any of those, stop it and say so — the ground
rules are served fresh on every `/api/agent/manifest` call, so re-pasting the
starter prompt resets its instructions.

Claude should also report honestly. If it says an action is done, the Automation
tab's history should show it. Cross-check occasionally.

---

## A note on the account

You're working your brother's account with his permission, which is a normal
family-business arrangement. Two things worth knowing:

**Facebook's terms don't distinguish family.** Sharing a personal login is
against them regardless of the relationship, and an unfamiliar device or an
unusual activity pattern can trigger a checkpoint or lock. That's a risk to his
business, not just an abstract rule.

**There's a cleaner path if you want it.** Daniel can add you as **Admin** or
**Editor** on the Business Page (Page Settings → Page Access → Add New). You'd
then log in as yourself and act as the Page, with full Page inbox access, no
shared password, and no unusual-login flags. Everything in this system works the
same either way — the landing pages, tracked links, Lead Ads sync and the whole
agent API are indifferent to which login you use.

Worth doing before you scale up the volume.

---

## Rules that still apply

- **Get consent before messaging.** The landing page captures it. Honor opt-outs
  immediately — "Mark do-not-contact" in the lead drawer, and the queue will skip
  them permanently.
- **Fair Housing.** Advertise the *program* (ITIN loans), never a demographic.
- **Don't message people who didn't engage.** Replying to someone who commented
  on your post is normal. Cold-messaging strangers you found in a search is spam,
  and it's what gets accounts reported.
