# Qist — إدارة الأقساط والتحصيل

Next.js 16 (App Router) full-stack app: RTL Arabic UI, PostgreSQL via Drizzle ORM.

## Setup

Requires Node ≥ 20.9 (`.nvmrc` pins 24) and Docker.

```bash
nvm use                       # Node 24
npm install
cp .env.example .env.local    # then set SEED_ADMIN_PASSWORD (≥ 10 chars)
npm run db:up                 # Postgres 16 on localhost:5434
npm run db:migrate
npm run db:seed               # admin user only; add installment plans from Settings
npm run dev
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. To reset the admin password from `.env.local`:
`npm run db:seed -- --reset-admin-password`.

| Script | |
|---|---|
| `db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `db:migrate` | Apply migrations |
| `db:studio` | Drizzle Studio |
| `test` | Unit tests (schedule, settlement, period, payment allocation and account statement) |

## Deploy (Vercel)

1. Create a hosted PostgreSQL 16 database (Neon, Supabase, …) in a region close to `fra1`, the function region set in `vercel.json`.
2. Import the GitHub repository in Vercel and set these environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Connection string (the pooled one, if the provider offers it) |
   | `DATABASE_URL_UNPOOLED` | Direct connection string for migrations (optional; Neon's integration sets it) |
   | `STORAGE_DRIVER` | `database` — Vercel has no persistent disk |
   | `NEXT_PUBLIC_MAX_DOCUMENT_MB` | `4` — Vercel rejects request bodies over 4.5 MB |

3. Deploy. The `vercel-build` script applies pending migrations, then builds. Preview deployments run it too, so give them their own database (or scope the variables to Production only).
4. Create the first user once, from your machine, against the hosted database:

   ```bash
   # .env.production.local (git-ignored): DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
   npx tsx --env-file=.env.production.local scripts/seed.ts
   ```

Dates and "today" are always evaluated in Africa/Cairo, whatever the server's time zone.

## Architecture

```
src/app/(app)/…        pages (Server Components) — read through services
src/app/(auth)/login   login page + server action
src/app/api/v1/…       REST API (same services)
src/proxy.ts           optimistic redirect to /login when there is no session cookie
src/server/
  auth/                sessions, Argon2id passwords, DAL (getCurrentUser / requirePermission), roles
  customers/ contracts/ finance-rules/ audit-log/   domain services
  installments/ dashboard/ reports/                 read models over contracts and installments
  payments/            receive and reverse installment payments (the payments ledger)
  statements/          customer account statement (loads rows, delegates to finance/statement.ts)
  finance/period.ts    reporting periods (pure, unit-tested)
  finance/schedule.ts  flat-rate schedule (pure, unit-tested)
  finance/installments.ts  installment status and oldest-first payment allocation (pure, unit-tested)
  finance/statement.ts     account statement ledger, balances and CSV (pure, unit-tested)
  db/schema.ts         tables, constraints, enums
```

Every service call checks the session and permission itself (the proxy is only a
convenience redirect). Rules the code enforces:

- **Money** is integer piastres (`bigint`), rates are basis points. Totals are guarded by CHECK constraints.
- **Nothing financial is deleted.** Customers can be blocked, drafts cancelled; confirmed contracts can't be edited.
- **Audit log** records every sensitive action with actor, old/new values, IP and device. National IDs are masked in it.
- **Finance rules are versioned.** Editing a rule creates version N+1; contracts keep the version they were created with.
- **Documents** are served only through the API. They are stored on disk under `STORAGE_DIR` (default `./storage`, git-ignored; back it up with the database), or in the `stored_files` table when `STORAGE_DRIVER=database`.
- **Early settlement** (`finance/settlement.ts`, unit-tested): amount = remaining principal + profit of installments already due + outstanding fees. Profit of future installments is waived (`installments.waived_amount`), never recorded as paid. The acting user re-enters their password, and the quote is re-checked against the amount they reviewed.
- **Contract groups** are a follow-up label only: grouped contracts stay active with their own schedules. The `consolidated` list tab filters on group membership; a group dissolves itself when fewer than two active contracts remain.
- **Payments** (`payments`, `payment_allocations`): money received on an active contract is applied to its installments oldest first and summed into `installments.paid_amount`. An amount above what is still owed is refused, so nothing is left unapplied. A payment is never edited or deleted: it is cancelled by a reversal row (at most one per payment), which takes the money back off the same installments. Paying a contract off closes it as `completed`; reversing that payment reopens it. Payments on a contract closed by early settlement can't be reversed. The form sends an idempotency key, so a resubmission returns the first payment.
- **Account statement** (`finance/statement.ts`): debit = what the customer owes (sale, fees, reversed payment), credit = what reduces it (down payment, payments, settlement amount, profit waived by a settlement); the running balance is what is still owed. Each amount comes from one record only: the down payment from the contract (dated on its confirmation), installment money from `payments`, settlement money and the waiver from `contract_settlements`. Scheduled installments are never counted as received. Drafts and cancelled drafts have no entries. The statement is customer-facing: the purchase cost (original price) is never part of it, on screen, in print, in the CSV or in the API response. A period shows the opening balance carried from before it; the current balance is always shown separately. The page warns when the ledger and `installments.paid_amount` disagree. Print and "PDF" use the browser's print dialog with a print layout; the transactions export as CSV.
- **Collection is measured against due dates.** The dashboard and reports still count "collected in a month" as what has been paid on the installments falling due in that month. Paid money covers fees, then profit, then principal.
- **Reports** compare each period with the one before it (whole months step back by months, other ranges by their length) and export as CSV with amounts in pounds.
- **Two prices per contract:** `original_price` is what the goods cost the shop; it is internal (contract pages, sales report) and never appears on the account statement. `purchase_cost` is the selling price charged to the customer, and the down payment, profit and installments are calculated on it. `originalPrice` is optional in the API and defaults to the selling price.
- **Schedule:** profit = profit base × annual rate × months ÷ 12, where the base is chosen per contract in the wizard (`contracts.profit_base`): the principal (price − down payment) or the full purchase cost. Installments are rounded to the piastre, rounding difference in the last one.
- **Manual installments:** a contract may fix the amount of any installment (`contracts.custom_installments`, `customInstallments: [{ seq, amount }]` in the API); the others share what is left of the total equally. Profit and fees are then spread in proportion to each installment's amount.

### Roles

| Permission | owner | manager | collector | viewer |
|---|:-:|:-:|:-:|:-:|
| customers / contracts: read | ✓ | ✓ | ✓ | ✓ |
| customers / contracts: write, confirm, block | ✓ | ✓ | | |
| customer documents: upload, open | ✓ | ✓ | | |
| contracts: early settlement | ✓ | ✓ | | |
| finance rules: write | ✓ | | | |
| audit log: read | ✓ | ✓ | | |
| reports: read, export | ✓ | ✓ | | ✓ |
| account statement: view, print, export | ✓ | ✓ | ✓ | ✓ |
| payments: record | ✓ | ✓ | ✓ | |
| payments: reverse | ✓ | ✓ | | |

## API (`/api/v1`)

Authenticate with the session cookie (browser) or `Authorization: Bearer <token>` from `POST /auth/login`.
Amounts are **piastres**, dates `YYYY-MM-DD`. Errors: `{ error: { code, message, details? } }`
(`401` unauthenticated, `403` forbidden, `404`, `409` conflict / invalid state, `422` validation with `details.fieldErrors`, `423` locked).

| Method | Path | |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → `{ token, expiresAt, user }`. 5 failures lock the account for 15 min |
| POST | `/auth/logout` | Revokes the current session |
| GET | `/auth/me` | Current user and granted permissions |
| POST | `/auth/password` | `{ currentPassword, newPassword }`; signs out other sessions |
| GET | `/customers?tab=&q=&page=` | tab: `all` `active` `noBalance` `overdue` `multi` `new` |
| POST | `/customers` | Create; `409` with `details.existing` if phone / national ID already exists |
| GET, PATCH | `/customers/:id` | `id` = UUID or code (`C-1042`) |
| POST | `/customers/:id/block` | `{ blocked, reason }` |
| GET | `/customers/:id/statement?period=&from=&to=&type=&contract=&installments=&format=` | Account statement; period: `all` `month` `lastMonth` `custom`; type: `sale` `fee` `down_payment` `payment` `reversal` `settlement` `discount`; installments: `paid` `partial` `unpaid` `overdue`; `format=csv` downloads the transactions |
| GET | `/customers/:id/activity` | Latest audit entries about the customer and their contracts |
| GET | `/customers/:id/documents` | Document list (names, types, dates) |
| POST | `/customers/:id/documents` | `multipart/form-data` `{ kind, file }` — PDF / JPG / PNG ≤ 10 MB (`NEXT_PUBLIC_MAX_DOCUMENT_MB`); kind: `national_id` `income_proof` `contract` `guarantor_id` `other` |
| GET | `/customers/:id/documents/:docId` | The file itself (owner, manager); every open is audited |
| GET | `/contracts?tab=&q=&customerId=&page=` | tab: `active` `draft` `completed` `overdue` `settled` `consolidated` |
| POST | `/contracts/preview` | Plan + full schedule, nothing saved |
| POST | `/contracts` | Contract input + `confirm` (`false` = draft) |
| GET, PUT | `/contracts/:id` | Detail with installments; PUT replaces a draft |
| POST | `/contracts/:id/confirm` | Draft → active, generates installments |
| POST | `/contracts/:id/cancel` | `{ reason }` — drafts only |
| GET | `/contracts/:id/activity` | Audit entries about the contract |
| GET | `/contracts/:id/settlement` | Early-settlement quote for today (active contracts) |
| POST | `/contracts/:id/settlement` | `{ expectedAmount, reason, paymentMethod, paymentReference?, password }` — receives the amount, closes the contract as settled |
| POST | `/contract-groups` | `{ customerId, contractIds[], name, note? }` — follow-up group of ≥ 2 active contracts of one customer |
| GET, DELETE | `/contract-groups/:id` | Group with its contracts; DELETE ungroups (contracts unchanged) |
| GET | `/finance-rules?usable=true` | Latest versions, or rules usable for new contracts today |
| POST | `/finance-rules` | New rule version (owner) |
| GET | `/finance-rules/:key/versions` | Version history |
| GET | `/dashboard?period=&from=&to=` | KPIs, overdue aging, monthly expected vs collected, due today, follow-ups; period: `month` `today` `week` `custom` |
| GET | `/payments?q=&page=` | Recorded payments and reversals |
| POST | `/payments` | `{ contract, amount, method, reference?, paidOn?, note?, idempotencyKey? }` — active contracts; `422` above the outstanding balance |
| POST | `/payments/:id/reverse` | `{ reason }` — reversing entry (`id` = UUID or `PAY-1001`); `409` if already reversed |
| GET | `/installments?tab=&q=&page=` | One row per installment plus `summary`; tab: `all` (unpaid) `today` `overdue` `upcoming` `partial` `paid` |
| GET | `/reports` | Report catalogue |
| GET | `/reports/:slug?period=&from=&to=&format=` | KPIs, columns and rows; period: `year` `quarter` `month` `custom`; `format=csv` downloads the table |
| GET | `/audit?q=&page=` | Audit trail (owner, manager) |

Contract input:

```json
{
  "customerId": "uuid", "productDescription": "هاتف Samsung Galaxy", "quantity": 1, "supplier": "متجر المورد",
  "originalPrice": 5500000, "purchaseCost": 6000000, "downPayment": 1000000, "financeRuleId": "uuid",
  "termMonths": 12, "fees": 0, "firstDueDate": "2027-01-01", "confirm": false
}
```
