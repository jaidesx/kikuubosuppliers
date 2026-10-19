# Direct mobile-money integration handoff

This branch provides supplier review and approval, customer payment authorization, and the direct-provider integration boundary. **Live MTN and Airtel collections remain disabled.** No aggregator is used. Mock verification tests are not evidence of a genuine payment.

## Local functionality

- `supplier.html`: password-based supplier login, order/item review, final whole-UGX approval, one-hour payment links, and revocation. The latest 100 orders are listed.
- `payment.html#<token>`: mobile-friendly confirmed quote, MTN/Airtel selection, phone entry, and backend payment status. Disabled providers cannot create payment attempts.
- Supplier accounts use PHP password hashing, strict cookie-only sessions, HttpOnly/SameSite=Strict cookies, Secure cookies on HTTPS, session rotation, 30-minute idle and eight-hour absolute expiry. Account activation is rechecked on each protected request. Login is limited by account and direct client address in 15-minute windows. No test authentication bypass exists.
- CSRF is required for all supplier POSTs, including login. Customer API POSTs require an unguessable 256-bit order capability and JSON; they do not use supplier cookies or permit approval/amount changes.
- Amount revisions revoke old links and are rejected when active or dispatched payments exist. Revocation does not cancel a request already sent to a provider.
- Order-first database locks serialize approval, token replacement/revocation, authorized creation, dispatch, and settlement. Authorization is checked again inside creation, including idempotent replays. Dispatch rechecks order amount/status and the original link's expiration/revocation. Existing internal `PaymentService::create` calls without a capability remain privileged backend-only operations; no public route exposes them.
- Unique active-payment and idempotency constraints remain in force. Provider UUID reservation precedes dispatch. HTTP 202 means pending. Timeouts and ambiguous responses require status reconciliation; no automatic resend occurs.
- Successful settlement requires matching amount, currency, external payment reference and a nonempty unique provider transaction ID from the authenticated status lookup. Failed responses close an attempt only through trusted status verification with the same identity checks; incomplete failures remain pending for review.
- Customer status can be read after payment using an unexpired, unrevoked link. No phone number or provider transaction identifier is returned. The UI requires verification metadata before displaying success/failure.
- Existing WhatsApp checkout files were not changed by this task. They already had uncommitted changes when work began; preserve and review those separately.

## Token and logging rules

Links use fragments, never query strings or path tokens. The payment page immediately removes the fragment and keeps it in memory, uses no third-party scripts/fonts/analytics, sends the token only in same-origin JSON POST bodies, and uses `no-referrer` and `no-store`. Reloading requires reopening the original supplier link. Share links privately. Configure hosting, WAF/APM, error tracking, and support tooling not to capture request bodies, cookies or payment-link fragments. Database rows store SHA-256 token hashes only. Do not enable request-body debug logs.

## Migration and local setup

Apply missing migrations in numeric order, **001 through 009**, using a schema migration account. Do not rerun previously applied SQL. MySQL DDL implicitly commits; back up before production migrations and track applied versions.

New migration: `backend/database/migrations/009_supplier_auth.sql` adds `supplier_users`, `supplier_login_limits`, and nullable `payment_transactions.payment_access_id` with its foreign key. The nullable column preserves existing internal payment records. Existing payment foundations require migrations 003–008, including the unique active-payment constraint. Migration 009 was applied to local `kikuubo_dev` during this task, not to production.

For local HTTP testing only:

```sh
KIKUUBO_APP_ENV=development php -S 127.0.0.1:18081 backend/dev/router.php
```

The HTTP exception is limited to an explicit development environment and loopback client; it does not bypass passwords or CSRF. Production must use HTTPS.

Create an account with the private CLI command, not a web endpoint:

```sh
php /absolute/private/backend/scripts/create_supplier.php supplier_name < /absolute/private/password-file
```

Use a randomly generated 14–72-byte password, a protected temporary file, and remove that file immediately after provisioning. The command refuses duplicate usernames. Deactivate a compromised account with `UPDATE supplier_users SET active = 0 WHERE username = ...` through an authenticated database administration process; existing sessions then lose access. Rotate passwords by updating a freshly generated `password_hash` and deactivate/reactivate as part of incident handling. There is no public registration or reset endpoint.

## Namecheap deployment, before publishing

1. Obtain explicit permission to deploy. This task did not deploy, commit, push, or enable charging.
2. Select PHP 8.2+ and MySQL 8; enable `pdo_mysql`, cURL, JSON, sessions and OpenSSL. Verify outbound HTTPS, trusted CA certificates, private writable PHP session storage, and cron support. Validation here used PHP 8.3.6; run the suite on the host's exact PHP 8.2 build before release.
3. Put `backend/` outside `public_html`, for example `/home/ACCOUNT/kikuubo-private/backend`. Keep `.env`, SQL, scripts, tests, backups (`*.bak`), `.git`, `.agents`, `.codex`, `node_modules`, and local tooling outside the document root. Publish only reviewed static assets and `api/`. Do not upload the entire repository. `backend/.htaccess` is defense in depth, not the production placement strategy.
4. Set `KIKUUBO_BACKEND_PATH=/home/ACCOUNT/kikuubo-private/backend` in the PHP process/Apache environment, before bootstrap runs. Set `KIKUUBO_ENV_PATH=/home/ACCOUNT/kikuubo-private/.env` or inject DB variables directly. `KIKUUBO_BACKEND_PATH` cannot be discovered from a file that has not yet been loaded. If shared hosting restricts environment directives, arrange the values with the host; never move secrets into public JavaScript or a public config endpoint.
5. Set `KIKUUBO_DB_HOST`, `KIKUUBO_DB_PORT`, `KIKUUBO_DB_NAME`, `KIKUUBO_DB_USER`, `KIKUUBO_DB_PASSWORD`. Use a least-privilege application user and a separate migration user. Set `KIKUUBO_APP_ENV=production`. Restrict secret-file permissions to the PHP account. Set UTC database/session time consistently.
6. Back up the database, apply only missing migrations in order, and confirm all constraints exist. Provision a real supplier account privately. Test login, CSRF, disabled accounts, expiry, amount approval, rotation, revocation, cross-order denial and concurrent initiation on a staging copy.
7. Install a valid HTTPS certificate and redirect HTTP to HTTPS **before** serving either interface. Ensure PHP sees `HTTPS=on`; do not trust arbitrary forwarded headers. Use server response headers for `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff` on the new pages/API; enable HSTS after validating HTTPS. Do not permit cross-origin API access. Exclude API responses from CDN/cache rules. The existing service worker already bypasses `/api/` and non-GET requests.
8. Complete provider onboarding and implementation requirements below, then run controlled provider acceptance tests. Only after explicit permission and verified real settlement may live collection gates be changed. Keep the WhatsApp flow unchanged until acceptance testing passes.
9. Once a production verifier is approved, configure cron with private environment loading to run `php /absolute/private/backend/scripts/reconcile_payments.php`. This command only looks up status for dispatched/uncertain attempts, at most 100 per run; it never initiates or resends payments. Monitor nonzero exits and unresolved rows. Current sandbox verification refuses UGX, so do not expect this release to reconcile real Uganda transactions.
10. Schedule removal of old rate-limit buckets (older than their windows). Do not purge payment or access records that are referenced by payment history. Test backup/restore and retain an operational reconciliation process for provider outages and incomplete failure responses.

## Provider blockers and required next steps

### MTN

The existing `MtnCollectionsClient` remains sandbox-only and EUR-only. The shared adapter is hard-disabled for customer UGX orders; credentials or an environment variable alone cannot enable production. The verifier also checks transport currency compatibility before making a status request. Tests inject a mock transport only in test code, never through an HTTP request or environment toggle.

Obtain Uganda merchant approval, the production Collections subscription key, API user/key, approved Uganda target environment, endpoint, UGX configuration, and the applicable provider response contract. Implement/review a production transport and readiness gate against that approved contract. Do not change UGX to EUR or simply remove sandbox checks. Sandbox credentials used by the private verifier are named `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, and `MTN_API_KEY`; do not install production credentials into the sandbox transport.

Validate accepted/pending/declined/timeout outcomes, exact amount formatting, reference matching, duplicate transaction protection, and real settlement using the approved production test process. No callback accepts settlement in this release; status polling is authoritative. Any future callback must trigger authenticated lookup or use provider-documented verification, never trust browser or callback JSON as proof of payment.

Official references checked: [MTN sandbox currency](https://momodeveloper.mtn.com/content/html_widgets/6kfu8.html), [MTN asynchronous HTTP 202 behavior](https://momodeveloper.mtn.com/content/html_widgets/nqxho.html).

### Airtel

`AirtelCollectionProvider` implements the shared interface but always reports unavailable and throws on collection/verification. No network request, request format, signature or callback validation was invented.

Obtain the approved **Uganda Collections API version and full application-specific specification** from the [Airtel developer portal](https://developers.airtel.africa/), approved merchant/application status, sandbox and production endpoint details, client credentials, country/currency values, any required encryption/signing key material, idempotency/reference rules, status verification and callback requirements. Record the approved version in deployment configuration and implement that exact adapter contract. Do not guess variable names or payload fields from third-party SDKs. Complete mock contract tests and authorized provider acceptance tests before changing availability. The official portal manages applications per country; publicly accessible material does not establish this merchant's approved API contract.

## Verification commands

Use a disposable development database named `kikuubo_dev` with migrations 001–009 and dedicated test credentials. New database tests generate unique fixtures and remove them in `finally`; the order API test now does too. Never run fixture suites against production.

```sh
php backend/tests/payment_workflow_test.php
php backend/tests/mtn_orchestration_test.php
php backend/tests/supplier_http_test.php
python3 backend/tests/run_mtn_tls_test.py
KIKUUBO_TEST_API_URL=http://127.0.0.1:18081/api/v1/orders/ php backend/tests/order_api_integration_test.php
php backend/tests/payment_service_test.php
php backend/tests/payment_access_test.php
php backend/tests/payment_dispatch_test.php
php backend/tests/mtn_reservation_test.php
php backend/tests/mtn_reconciliation_test.php
php backend/tests/mtn_verifier_guard_test.php
php backend/tests/catalogue_test.php
npm test -- --runInBand
find backend api -name '*.php' -print0 | xargs -0 -n1 php -l
git diff --check
```

The TLS mock runner creates a temporary self-signed CA certificate, explicitly trusts it for the test process, uses only loopback, and cleans up. It does not disable certificate verification. It requires Python 3, OpenSSL CLI and free port 18443. Concurrency tests require PHP `pcntl` on the development machine, not on shared hosting.

## Files changed by this task

Created:
- `api/v1/payment_bootstrap.php`, `api/v1/payments/index.php`, `api/v1/supplier/index.php`
- `backend/database/migrations/009_supplier_auth.sql`
- `backend/src/Services/SupplierAuth.php`, `SupplierService.php`
- `backend/src/Payments/CollectionProvider.php`, `AirtelCollectionProvider.php`, `MtnCollectionProvider.php`, `CustomerPaymentService.php`, `MtnCollectionsTransport.php`
- `backend/scripts/create_supplier.php`, `reconcile_payments.php`
- `backend/tests/payment_workflow_test.php`, `mtn_orchestration_test.php`, `supplier_http_test.php`, `run_mtn_tls_test.py`
- `payment.html`, `payment.css`, `payment.js`, `supplier.html`, `supplier.js`, `tests/payment.test.js`
- `docs/payments/DIRECT_COLLECTIONS.md`

Modified existing files (including files already untracked before this task):
- `backend/config/database.php`
- `backend/src/Services/PaymentService.php`, `PaymentAccessService.php`
- `backend/src/Payments/PaymentDispatchService.php`, `MtnCollectionsClient.php`, `MtnPaymentOrchestrator.php`, `MtnPaymentVerifier.php`, `MtnPaymentReconciliation.php`
- `backend/tests/order_api_integration_test.php`

Existing backup files and other preexisting work were preserved. Review/stage the complete existing foundation plus this feature together; `git diff --stat` alone does not include the many previously untracked foundation files.
