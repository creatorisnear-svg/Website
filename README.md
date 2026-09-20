# Oce Lights website

Static website for Oce Lights, a permanent LED roofline lighting installer in Avondale, Arizona. No build step, no framework. Upload the files as-is to Cloudflare Pages, Netlify, or GitHub Pages.

## What's in here

| File | Purpose |
| --- | --- |
| `index.html` | The whole home page: HTML, CSS, and JavaScript in one file |
| `agreement.html` | Installation Agreement. Public URL will be `/agreement` (use this as the Terms of Service link in Stripe) |
| `404.html` | Friendly "page not found" page (Cloudflare Pages serves it automatically) |
| `img/` | Put your photos here. See `img/README.md` for the exact file names |
| `favicon.svg`, `apple-touch-icon.png` | Browser tab and home-screen icons |
| `_headers` | Security and caching headers for Cloudflare Pages / Netlify |
| `.nojekyll` | Only matters for GitHub Pages; harmless elsewhere |

## Deploy on Cloudflare Pages (about 5 minutes)

1. In the Cloudflare dashboard, open **Workers & Pages**, then **Create**, then the **Pages** tab, then **Connect to Git**.
2. Pick this GitHub repository and click **Begin setup**.
3. Use these settings:
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `/` (the repo root)
4. Click **Save and Deploy**. You'll get a `*.pages.dev` address right away.
5. To use your own domain, open the Pages project, go to **Custom domains**, and add it. If the domain is already on Cloudflare, DNS is set up for you.

From then on, every push to `main` redeploys the site automatically.

## Before going live (checklist)

- [ ] **Connect the quote form.** Create a free form at [formspree.io](https://formspree.io), copy the form's endpoint, and replace `YOUR_FORM_ID` in `index.html` with the ID from that endpoint (find-and-replace all occurrences is fine). Submissions are emailed to the address on your Formspree account. Until this is done, the form shows a polite "not connected yet, please call or text" message instead of sending.
- [ ] **Photo upload on the form.** Formspree's free plan does not deliver file attachments. Either upgrade the plan or delete the "Photo of the front of your house" field in `index.html` (the `<div class="field span-2">` block that contains `id="photo"`). Everything else on the form works on the free plan.
- [ ] **Business email.** Replace `hello@ocelights.com` in `index.html` (two places) and `agreement.html` (one place) with your real email.
- [ ] **Photos.** Five photos are already in `img/`. To swap one, overwrite the file and keep the same name. The current files are small (about 640 px wide), so replace them with full-size originals when you can. See `img/README.md`.
- [ ] **Agreement.** Fill in everything in `[brackets]` in `agreement.html` (effective date, deposit rules, warranty length, fees) and have the terms reviewed before using them with customers.
- [ ] **Stripe.** In Stripe, set the Terms of Service URL to `https://YOUR-DOMAIN/agreement`.

## Editing content

Everything is plain HTML, so you can edit text directly:

- **Prices:** search `index.html` for `$699`, `$849`, `$975`, `$995`.
- **Phone number:** search for `623` to find every place it appears (display text and `tel:` / `sms:` links).
- **FAQ:** each question is a `<details>` block near the bottom of `index.html`.
- **Service areas:** appear in the hero, footer, FAQ, form dropdown, and the page's structured data near the top of `index.html`.

## Preview locally

Any static server works. For example, from this folder:

```
python3 -m http.server 8080
```

Then open <http://localhost:8080>. (Opening `index.html` directly from the file system also works, except the form and clean `/agreement` URL.)

## Payments

There is no checkout on the site on purpose. Deposits and balances are sent to customers as Stripe Payment Links by text after the quote. No Stripe keys are in this code.
