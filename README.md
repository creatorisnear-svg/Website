# Go Roofline Lights website

Static website for Go Roofline Lights, a permanent LED roofline lighting installer for homes in Avondale, Arizona (residential only). No build step, no framework.

## What's in here

| File | Purpose |
| --- | --- |
| `index.html` | The whole home page: HTML, CSS, and JavaScript in one file |
| `agreement.html` | Installation Agreement. Public URL is `/agreement` (use this as the Terms of Service link in Stripe) |
| `404.html` | Friendly "page not found" page |
| `img/` | Photos. See `img/README.md` for which file goes where |
| `favicon.svg`, `apple-touch-icon.png` | Browser tab and home-screen icons |
| `_headers` | Security and caching headers (for Cloudflare Pages / Netlify; the current server sets the same headers itself) |
| `.nojekyll` | Only matters for GitHub Pages; harmless elsewhere |

## Updating the live site

The live site follows this branch. Push a change here and it shows up on the site within a couple of minutes. Nothing else to do.

## Before going live (checklist)

- [ ] **Connect the estimate form.** Create a free form at [formspree.io](https://formspree.io), copy the form's endpoint, and replace `YOUR_FORM_ID` in `index.html` with the ID from that endpoint. Submissions are emailed to the address on your Formspree account. Until this is done, the form shows a polite "not connected yet, please call or text" message instead of sending.
- [ ] **Photo upload on the form.** Formspree's free plan does not deliver file attachments. Either upgrade the plan or delete the "Photo of the front of your house" field in `index.html` (the `<div class="field span-2">` block that contains `id="photo"`).
- [ ] **Business email.** `hello@gorooflinelights.com` is a placeholder. Replace it in `index.html` (two places) and `agreement.html` (one place) with your real email.
- [ ] **Photos.** Most photos in `img/` are small (about 640 px wide). Replace them with full-size originals when you can. See `img/README.md`.
- [ ] **Agreement.** Fill in everything in `[brackets]` in `agreement.html` (effective date, deposit rules, warranty length, fees) and have the terms reviewed before using them with customers.
- [ ] **Stripe.** In Stripe, set the Terms of Service URL to `https://YOUR-DOMAIN/agreement`.

## Editing content

Everything is plain HTML, so you can edit text directly:

- **Prices:** the site deliberately shows no prices. The "Pricing" section says prices are significantly lower than other installers, and the FAQ says the exact price comes after the free measurement.
- **Phone number:** search for `623` to find every place it appears (display text and `tel:` / `sms:` links).
- **FAQ:** each question is a `<details>` block near the bottom of `index.html`.
- **Service areas:** appear in the hero, footer, FAQ, form dropdown, and the structured data near the top of `index.html`.
- **Glow color:** change `--glow` and `--glow-rgb` at the top of the `<style>` block in `index.html` (and in `agreement.html`).

## Preview locally

Any static server works. For example, from this folder:

```
python3 -m http.server 8080
```

Then open <http://localhost:8080>. (Opening `index.html` directly from the file system also works, except the form and the clean `/agreement` URL.)

## Payments

There is no checkout on the site on purpose. Deposits and balances are sent to customers as Stripe Payment Links by text after the estimate. No Stripe keys are in this code.
