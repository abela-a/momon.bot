# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Momon is a personal finance Telegram bot that runs entirely on **Google Apps Script** and stores
data in **Google Sheets** — no server, no database, no hosting cost. The whole bot is one
self-contained file, `Momon.gs` (~1600 lines). There is no build step and no dependency manager.

Users write free-form Indonesian text ("kopi 25k pakai GoPay") and Momon records transactions,
transfers between "kantong" (wallets/accounts), and answers free-form report questions
("berapa jajanku minggu lalu?"). Gemini is used only to *interpret* intent/extract filters —
it never computes numbers. All sums/averages/percentages are computed by plain JavaScript
(`momonHitungRingkasan()` / `momonKelompokkan()`) directly from spreadsheet rows, and AI output is
re-validated against closed whitelists before being accepted.

## Commands

There is no local build/test/lint tooling — this is Apps Script code edited and run inside the
Apps Script editor (or synced with `clasp`).

```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json   # fill in scriptId from Project Settings, this file is gitignored
clasp push                            # push local Momon.gs -> Apps Script
clasp pull                            # pull Apps Script -> local
```

Manual verification happens by running specific functions from the Apps Script editor and reading
the Execution log:

- `momonCekKonfigurasi()` — checks that all required Script Properties are set and valid.
- `momonSiapkanSheet()` — creates the transaction + report sheet tabs/headers for every configured user.
- `momonPasangWebhook()` — (re)registers the Telegram webhook against `MOMON_WEBHOOK_URL`; log must show `{"ok":true}`.

After any code change, redeploy via **Deploy → Manage deployments → ✏️ → New version → Deploy** —
the webhook URL doesn't change, but the Web App keeps serving the old version until a new version
is deployed.

## Configuration

All secrets live in **Apps Script → Project Settings → Script Properties**, never in `Momon.gs`:

- `MOMON_BOT_TOKEN` — Telegram bot token from @BotFather
- `MOMON_GEMINI_API_KEY` — Gemini API key from https://aistudio.google.com/apikey
- `MOMON_USERS` — JSON map of allowed Telegram chat ids → `{nama, sheet, sheetLaporan, kantong}`
- `MOMON_WEBHOOK_URL` — the deployed Web App `/exec` URL

The `*_FALLBACK` constants at the top of `Momon.gs` are intentionally left empty since this file is
committed to Git; Script Properties always take precedence when set. `secrets.local.md` (gitignored)
holds this project's actual local values for pasting into Script Properties — never copy its
contents into `Momon.gs` or any committed file.

Tunable behavior constants also live at the top of `Momon.gs`: `MOMON_TIMEZONE` (must match
`timeZone` in `appsscript.json`), `MOMON_MODEL`, `MOMON_KOMENTAR_AI`, `MOMON_MAKS_RINCIAN_CHAT`,
`MOMON_KATEGORI_PENGELUARAN`/`MOMON_KATEGORI_PEMASUKAN` (closed category whitelists — the AI prompt
is built from these arrays at runtime, so adding a category is just adding a string), and
`MOMON_KANTONG_DEFAULT`.

## Architecture

`Momon.gs` is organized into clearly marked sections (search for `====` banners). Request flow:

1. **Entry point** — Telegram calls the deployed Web App's `doPost(e)`, which calls
   `momonTerimaUpdate(e)`. This rejects any chat id not present in `MOMON_USERS` before doing
   anything else (this is the only access control — the Web App itself must be deployed as
   "Anyone" so Telegram can reach it).
2. **Routing** — `momonRoute(user, teks)` dispatches slash commands (`/saldo`, `/hari`, `/laporan`,
   `/transfer`, etc.) to their handlers; anything else goes to free-text handling.
3. **Free text / AI** — `momonProsesTeksBebas` → `momonOtak(user, teks, paksaIntent)` makes a
   single Gemini call (`momonPanggilGemini`) that both classifies intent and extracts structured
   data (transactions, a transfer, or a report filter spec) in one shot.
4. **Recording** — `momonCatatTransaksi` / `momonTransfer` validate the AI's output against the
   closed whitelists (categories, kantong, nominal) before appending rows. If a kantong/nominal
   doesn't resolve, the transaction is **rejected** and the user is asked to clarify — it is never
   recorded on a guess. An unrecognized category is coerced to `Lainnya` with a warning instead of
   being rejected outright. `momonLengkapiTransaksi` / `momonResolveTanggalWaktu` handle backdating
   ("kemarin", "Senin lalu", "3 hari lalu", explicit dates).
5. **Reporting** — `momonSajikanLaporan` → `momonNormalisasiSpec` turns the AI's filter spec into a
   concrete query, `momonBacaTransaksi` + `momonSaring` read and filter sheet rows,
   `momonHitungRingkasan`/`momonKelompokkan`/`momonUrutkan` do all arithmetic/grouping/sorting in
   plain JS, and `momonRenderLaporan` formats the Telegram reply (truncated to
   `MOMON_MAKS_RINCIAN_CHAT` rows) while `momonTulisLaporanKeSheet` writes the untruncated version
   to that user's report tab with a deep link back (`momonUrlSheet`).
6. **Scheduled** — `momonSapaPagi` / `momonIngatkanMalam` are meant to be wired up as time-driven
   Triggers in the Apps Script UI (not callable from Telegram).

### Multi-account model

Each Telegram chat id in `MOMON_USERS` maps to its own pair of sheet tabs (`sheet` for raw
transactions, `sheetLaporan` for the last-generated report) and its own `kantong` (wallet) list —
accounts' data never mixes. Adding a third account is just adding another entry to `MOMON_USERS`;
nothing in the code assumes exactly two.

### Transaction sheet schema

Each user's transaction sheet has 7 columns (`MOMON_HEADER`):

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Tanggal Transaksi | Tipe | Kategori | Kantong | Nominal | Deskripsi | Dicatat Pada |

- `Tanggal Transaksi` is the effective/backdated transaction time; `Dicatat Pada` is always the
  real time the message arrived (used for audit, never backdated).
- `Tipe` is one of Pemasukan / Pengeluaran / Transfer — transfers are recorded as their own `Tipe`
  (via `momonTransfer`) and are excluded from income/expense totals and active-day counts
  (`momonBukanArusKas`, `momonTransferMasuk`) so a transfer never gets double-counted as both
  spending and income.
- Rows with a non-Date tanggal or nominal ≤ 0 are silently skipped, so manual notes added below the
  data are safe.

### Safety invariant to preserve

Gemini output is advisory only. Any change to `momonOtak`/`momonPanggilGemini`/`momonCatatTransaksi`
must preserve the property that AI never writes a number or wallet directly to the sheet without
passing through the whitelist validation in `momonCatatTransaksi`/`momonTransfer`/
`momonNormalisasiSpec` — this is why the ledger's numbers can be trusted.
