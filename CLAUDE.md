# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Momon is a personal finance Telegram bot that runs entirely on **Google Apps Script** and stores
data in **Google Sheets** — no server, no database, no hosting cost. The whole bot is one
self-contained file, `Momon.gs` (~2700 lines). There is no build step and no dependency manager.

Users write free-form Indonesian text ("kopi 25k pakai GoPay"), send a receipt photo, or send a
voice note, and Momon records transactions,
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
- `momonIsiIdTransaksiLama()` — one-off (idempotent) backfill of the `ID` column for rows recorded
  before that column existed.

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
`timeZone` in `appsscript.json`), `MOMON_MODEL` (text) and `MOMON_MODEL_MEDIA` (photo/voice),
`MOMON_PREVIEW_TTL_DETIK`, `MOMON_MAKS_UKURAN_FILE`, `MOMON_KOMENTAR_AI`, `MOMON_MAKS_RINCIAN_CHAT`,
`MOMON_KATEGORI_PENGELUARAN`/`MOMON_KATEGORI_PEMASUKAN` (closed category whitelists — the AI prompt
is built from these arrays at runtime, so adding a category is just adding a string), and
`MOMON_KANTONG_DEFAULT`.

## Architecture

`Momon.gs` is organized into clearly marked sections (search for `====` banners). Request flow:

1. **Entry point** — Telegram calls the deployed Web App's `doPost(e)`, which calls
   `momonTerimaUpdate(e)`. Inline-button presses (`update.callback_query`) are split off first and
   gated by their own `momonUser` check inside `momonTanganiCallback`; every other update is
   classified as text, photo, or voice and gated by the `momonUser` check in `momonTerimaUpdate`.
   Those two checks are the *only* access control, so a new entry point must gate itself the same
   way — the Web App itself must be deployed as "Anyone" so Telegram can reach it.
2. **Routing** — `momonRoute(user, teks)` dispatches slash commands (`/saldo`, `/hari`, `/laporan`,
   `/transfer`, `/edit`, `/hapus`, etc.) to their handlers; anything else goes to free-text handling.
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
6. **Photo / voice** — `momonProsesFoto` and `momonProsesSuara` download the Telegram file
   (`momonUnduhFileTelegram`) and send it to Gemini as `inlineData` using `MOMON_MODEL_MEDIA`.
   Photos go through a receipt-specific prompt (`momonOtakGambar`, restricted to transaction/transfer
   intent); voice reuses `momonOtak` with an audio part, so it covers the full intent space
   including reports. Neither writes directly — anything that would write goes to a preview.
7. **Preview & confirmation** — `momonTampilkanPreview` renders the extracted draft with inline
   buttons and stashes it in `CacheService` (one pending draft per chat, TTL
   `MOMON_PREVIEW_TTL_DETIK`). `momonTanganiCallback` handles the button presses, rejecting any
   press whose `message_id` doesn't match the stored draft (stale/expired). Confirming calls
   `momonSimpanTransaksi`/`momonSimpanTransfer` — the same validated write path as typed text — then
   rewrites the preview message in place via `momonEditPesan`.
8. **Edit & delete** — rows carry a per-user sequential `ID`. `/edit <id> <free text>` reinterprets
   the row through Gemini and rewrites it (Transfer rows are refused — they touch two kantong);
   `/hapus <id>` always confirms first, and deleting one leg of a transfer deletes both
   (`momonCariPasanganTransfer`, matched on identical `Dicatat Pada` + nominal).
9. **Scheduled** — `momonSapaPagi` / `momonIngatkanMalam` are meant to be wired up as time-driven
   Triggers in the Apps Script UI (not callable from Telegram).

### Multi-account model

Each Telegram chat id in `MOMON_USERS` maps to its own pair of sheet tabs (`sheet` for raw
transactions, `sheetLaporan` for the last-generated report) and its own `kantong` (wallet) list —
accounts' data never mixes. Adding a third account is just adding another entry to `MOMON_USERS`;
nothing in the code assumes exactly two.

### Transaction sheet schema

Each user's transaction sheet has 8 columns (`MOMON_HEADER`):

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Tanggal Transaksi | Tipe | Kategori | Kantong | Nominal | Deskripsi | Dicatat Pada | ID |

- `Tanggal Transaksi` is the effective/backdated transaction time; `Dicatat Pada` is always the
  real time the message arrived (used for audit, never backdated).
- `ID` is a per-user sequential integer, appended as the **last** column so existing sheets never
  have to be shifted. Every write goes through `momonTambahBaris`, which allocates IDs under a
  `LockService` lock so concurrent webhooks can't collide. `momonIdBerikutnya` deliberately returns
  `max(highestId, rowCount) + 1` so that a later `momonIsiIdTransaksiLama()` backfill still has
  room to number old rows 1..N without clashing.
- `Tipe` is one of Pemasukan / Pengeluaran / Transfer — transfers are recorded as their own `Tipe`
  (via `momonTransfer`) and are excluded from income/expense totals and active-day counts
  (`momonBukanArusKas`, `momonTransferMasuk`) so a transfer never gets double-counted as both
  spending and income.
- Rows with a non-Date tanggal or nominal ≤ 0 are silently skipped, so manual notes added below the
  data are safe.

### Safety invariant to preserve

Gemini output is advisory only, and `momonValidasiTransaksi` is the single chokepoint that decides
whether AI-derived values are allowed onto a transaction row: it rejects any kantong outside the
user's list and any nominal ≤ 0, and coerces an unknown kategori to `Lainnya` with a warning. Every
path that writes a transaction goes through it — free text and photo/voice confirmation via
`momonSimpanTransaksi`, and `/edit` directly — so adding a new input path means calling it, never
re-implementing the checks inline. Transfers have their own equivalent chokepoint in
`momonSimpanTransfer` (both kantong whitelisted, must differ, nominal > 0), and report filters in
`momonNormalisasiSpec`. This is why the ledger's numbers can be trusted.
