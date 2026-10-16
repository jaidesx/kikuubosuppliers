# WhatsApp ordering and manual Mobile Money release

Local implementation branch: `fix/whatsapp-manual-momo`.
No deployment, push, live modification or real payment has been performed.

## Release blockers

- Confirm registered recipient names and merchant ownership of MTN 0770975409 and Airtel 0756158466. Both are explicitly unverified in the current interface. WhatsApp uses 256756158466.
- Confirm hosting provider, document root, deployment mechanism and the actual deployed revision. Local main is not proof of the deployed baseline.
- Obtain and verify a backup of the currently deployed files and hosting configuration; prove rollback in a separate preview environment.
- Complete real-browser mobile/desktop and installed-PWA testing. The local preview-server attempt was blocked by automatic approval review's usage limit; jsdom does not prove visual layout or WhatsApp app behavior.
- Approve production deployment separately. Do not enable any paid status based on website actions, messages, screenshots or customer references.

## Business review: prices are unchanged

`products_array.js` is unchanged. `ordering.js` applies quotation-only rules. These items do not contribute a numeric amount to the priced-items subtotal:

| ID | Reason |
| --- | --- |
| 3 | Homepage 25,000 vs catalogue 27,000 |
| 7 | Product card 38,000 vs catalogue 15,000 |
| 8 | Homepage / old test 160,000 vs catalogue 168,000 |
| 15 | Dettol size and price ranges conflict |
| 19 | Sunseed size / price range |
| 25 | Fortune Gold 149 requires approval |
| 67 | Card 4,500 vs catalogue 5,500 |
| 90 | `@25,000` notation / pack needs confirmation |
| 100 | `@9,000` notation / pack needs confirmation |
| 108 | Mentos 149 requires approval |
| 366 | Card 5,500 vs catalogue 4,500 |
| 394 | `32,000 dzn` unit needs confirmation |
| 429 | Previously reused for Ketchup but catalogue identifies Glass Cleaner |

The original homepage Ketchup is retained as `ketchup-unverified`, a quotation-only inquiry with no invented price or pack. The business must map it to an approved catalogue identity before enabling priced ordering. Legacy saved items with mismatched identity or price retain their description and require quotation, rather than silently turning into another product. Invalid saved quantities must be corrected. The 9,999 quantity ceiling is a technical guardrail, not a stock or wholesale limit.

To approve a product later: confirm identity, unit and price; reconcile HTML and catalogue data; remove only its resolved quotation rule; run tests. The sugar test now verifies the existing catalogue snapshot, not business approval of its price.

## Verification

Run from the project root using the existing installed dependencies:

```sh
npm test -- --runInBand --no-cache
node --check cart.js
node --check ordering.js
node --check checkout.js
node --check script.js
node --check service-worker.js
git diff --check
```

New regression coverage includes catalogue-sourced pricing, disputed products, quantity bounds, customer validation, URI encoding, subtotal overflow, retained baskets, stale draft invalidation, legacy identity collisions, unsafe stored text, unavailable storage, large-message fallback, copy fallback, dynamically added cards and direct product URLs.

Browser acceptance checklist (still required):

1. Serve the local/preview files over HTTP(S); do not use file URLs.
2. Test 320px, 360px, 390px and desktop widths. Check labels, radio buttons, readable instructions, cart horizontal scrolling and absence of page overflow.
3. Add ordinary and quotation items from homepage, catalogue and detail pages; test `sproduct.html?id=2` after viewing a different product.
4. Reload the cart; edit quantity; prepare a request; change details and verify the old link disappears.
5. Confirm both provider numbers and unverified wording. No payment animation or paid confirmation should appear.
6. Inspect/copy the WhatsApp request, including `&`, `#`, `%`, emoji and newlines. Do not send an order or initiate payment without explicit permission.
7. Test large baskets, copy fallback, cancelled handoff and reopening the cart. Confirm it remains intact.
8. Test an existing installed PWA and a fresh browser, including update and rollback. JavaScript URLs use `?v=manual-momo-v2`; service worker cache is `kikuubo-suppliers-static-v2-manual-momo`.

## Deployment procedure after hosting access and release approval

1. Record provider, document root, HTTPS domain, release mechanism, cache/CDN controls and current deployed revision. Download the actual live artifact through the host's backup/export facility. Keep it outside the web root; record checksums and confirm it can be restored.
2. Restore that backup to an isolated preview and verify baseline navigation/cart behavior. This is the rollback rehearsal; do not overwrite production to test it.
3. Resolve recipient names and update the pending-verification instructions/configuration deliberately. Staff must confirm availability, packs, delivery and final total before payment, then independently reconcile the provider transaction. Keep any unresolved product quotation-only.
4. Review the full branch diff and rerun all tests above. Do not package an earlier Git HEAD while these local edits remain uncommitted.
5. Prepare a static artifact from the reviewed working tree (no dependencies, tests, credentials or `.git`):

```sh
tar -czf /tmp/kikuubo-manual-momo-preview.tar.gz index.html shop.html product.html sproduct.html cart.html about.html contact.html 404.html offline.html style.css modern-header.css products_array.js script.js cart.js ordering.js checkout.js service-worker.js manifest.json robots.txt sitemap.xml image
sha256sum /tmp/kikuubo-manual-momo-preview.tar.gz
```

6. Publish that artifact only to the host's preview/staging target and complete the browser checklist. Use HTTPS for service-worker testing. Obtain approval of the concrete preview.
7. Use the confirmed host's atomic release mechanism to switch production to that same artifact. Exact CLI/API commands depend on the host and must not be guessed. If only file upload is available, establish an approved coordinated upload/maintenance procedure first; do not mix old HTML with new scripts. Confirm query parameters are included in CDN/cache keys.
8. Serve `service-worker.js` with revalidation, purge the host/CDN caches as appropriate, and verify the new cache version and versioned JavaScript assets. Smoke-test products, cart retention, both payment panels and message preparation without sending real orders or payments.

## Rollback

- Keep the last deployed artifact and its configuration/checksums available before release.
- Roll back via the host's release switch, or restore the saved artifact through the rehearsed mechanism.
- Publish a fresh service-worker cache identifier for the rollback and matching asset-version query strings; otherwise clients may keep the failed release's cache.
- Purge/revalidate CDN assets and check both existing PWA and clean-browser clients.
- Do not clear customer localStorage. Recheck legacy item handling and document any compatibility issue before switching.
- The old checkout clears carts on WhatsApp handoff. A full rollback restores that known defect; evaluate disabling checkout temporarily if rollback would expose customers to it.
