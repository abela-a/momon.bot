# Panduan update ke Apps Script

Catatan sekali-jalan untuk memperbarui project Apps Script yang **sudah berjalan**.
Untuk pemasangan dari nol, pakai [README.md](README.md) saja — di sana sudah memakai
struktur berkas yang baru.

## Apa yang berubah

1. **Konfigurasi dipindah ke `Config.gs`.** Blok konstanta `MOMON_*` beserta
   `momonConfig()` / `momonUser()` / `momonSemuaUser()` keluar dari `Momon.gs` dan pindah
   ke berkas baru. Murni pemindahan — tidak ada logika yang berubah dan nama fungsinya
   tetap sama persis.
2. **Fitur baru dari rilis sebelumnya ikut terbawa**: notif progres (⏳ → 💾 → ✅) dan
   tombol ✏️ Edit / 🗑️ Hapus / 📊 Sheet di balasan. ✏️ Edit sekarang memakai callback
   biasa, jadi inline mode **tidak** perlu dinyalakan — lihat langkah 4.

```
app/
├── Config.gs        konstanta MOMON_*, momonConfig/momonUser   (~165 baris)
├── Momon.gs         lisensi + seluruh logika bot                (~2935 baris)
└── appsscript.json  manifest
```

> **Urutan berkas tidak berpengaruh.** Apps Script menaruh semua `.gs` di satu ruang
> global, dan tidak ada berkas yang membaca nilai dari berkas lain saat dimuat — semua
> konstanta di `Config.gs` diisi nilai literal.

---

## Yang penting dipahami sebelum mulai

**Bot yang live tidak langsung ikut berubah.** Web App menyajikan **versi yang
di-deploy**, bukan isi editor. Jadi selama kamu menyunting berkas, Momon di Telegram masih
menjalankan versi lama dengan normal — termasuk di saat project sempat setengah jadi.
Pergantian baru terjadi saat kamu menekan **Deploy → New version** di langkah 3.

Satu pengecualian: **Trigger terjadwal** (`momonSapaPagi` / `momonIngatkanMalam`) berjalan
dari isi editor, bukan dari versi yang di-deploy. Kalau salah satunya kebetulan berbunyi
di tengah proses, eksekusinya akan gagal. Tidak merusak data — tapi kalau mau aman,
kerjakan migrasinya di jam yang jauh dari jadwal sapaan.

**Kenapa urutannya penting (cara manual).** Kedua berkas berbagi satu ruang global. Kalau
`Momon.gs` yang lama (masih punya konstanta) dan `Config.gs` yang baru ada bersamaan,
konstanta yang sama terdeklarasi dua kali dan **setiap eksekusi** langsung gagal:

```
SyntaxError: Identifier 'MOMON_TIMEZONE' has already been declared
```

Makanya langkah 2B mengganti isi `Momon.gs` **lebih dulu**, baru membuat `Config.gs`.

---

## Langkah 1 — Backup

Lewati kalau repo lokalmu sudah bersih dan ter-commit; `git` sudah jadi backup-nya.

Kalau tidak: di Apps Script, **⋮ di samping nama project → Lihat riwayat versi**, atau
salin isi `Momon.gs` dari editor ke berkas lokal. Rollback dibahas di bagian akhir.

## Langkah 2 — Pindahkan kodenya

Pilih **salah satu**: 2A (clasp) jauh lebih gampang.

### 2A. Dengan clasp — disarankan

```bash
clasp push
```

`clasp push` mengirim **seluruh isi `app/`** sebagai isi project, jadi `Momon.gs` tertimpa
dan `Config.gs` ikut terbuat sekaligus — tidak ada jendela di mana konstantanya dobel.
Buka editornya dan pastikan daftar berkasnya persis `Config.gs` + `Momon.gs` +
`appsscript.json`.

Kalau clasp menolak karena manifest:

```bash
clasp push -f
```

### 2B. Manual lewat editor Apps Script

Urutannya mengikat — jangan ditukar.

1. Buka berkas **`Momon`**, blok semua isinya (<kbd>Ctrl</kbd>+<kbd>A</kbd>), lalu tempel
   isi `Momon.gs` yang baru sebagai gantinya. Simpan.
   Sekarang konstantanya sudah tidak ada di berkas itu — project memang sementara belum
   jalan, dan itu wajar.
2. **+ → Script**, beri nama **`Config`** (tanpa `.gs` — Apps Script menambahkan
   ekstensinya sendiri). Hapus `function myFunction() {}` bawaannya, tempel seluruh isi
   `Config.gs`. Simpan.
3. Pastikan tidak ada berkas sisa bernama `Code`.

## Langkah 3 — Deploy versi baru

Ini langkah yang benar-benar mengganti bot yang live:

**Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy**

URL webhook-nya tidak berubah, jadi **tidak perlu** menjalankan `momonPasangWebhook()`
lagi.

## Langkah 4 — Inline mode: tidak perlu lagi

Tidak ada yang harus dikerjakan di sini.

Versi sebelumnya mewajibkan `/setinline` karena tombol **✏️ Edit** mengisi kotak ketik
lewat `switch_inline_query_current_chat`, dan Telegram selalu menempelkan `@namabot ` di
depan teks yang diketik user. Sekarang tombol itu memakai callback biasa: Momon balik
bertanya "mau diubah apanya?", dan kamu menjawab dengan **pesan biasa**.

Kalau inline mode sudah telanjur dinyalakan, biarkan saja atau matikan lewat
`/setinline` → pilih bot → `Disable`. Dua-duanya aman.

## Langkah 5 — Verifikasi

Jalankan dari editor Apps Script (pilih fungsinya di dropdown → **Run**, lihat
**Execution log**):

```
momonCekKonfigurasi()
```

Yang harus terlihat:

- `✅ Bot: @NamaBotmu`
- `ℹ️ Inline mode: ...` — apa pun isinya, tidak masalah
- `🎉 Konfigurasi lengkap!`

Lalu dari Telegram:

| Uji | Yang diharapkan |
|---|---|
| `kopi 25k pakai GoPay` | Satu pesan berubah ⏳ → 💾 → ✅, lalu muncul tombol ✏️ / 🗑️ / 📊 |
| Tekan ✏️ Edit | Momon bertanya "mau diubah apanya?"; balas pesan biasa, baris ikut berubah |
| Tekan 🗑️ Hapus | Muncul konfirmasi ✅/❌ dulu, bukan langsung terhapus |
| `/bulan` | Laporan tampil seperti biasa |
| `/debug` | Status tampil tanpa error |

Kalau ada yang error, `/debug` menampilkan error terakhir (tersimpan di Script Property
`MOMON_ERROR_TERAKHIR`, jadi tetap terbaca setelah request-nya lewat).

---

## Rollback

Versi `Momon.gs` sebelum migrasi masih utuh di riwayat git:

```bash
git log --oneline -- app/Momon.gs Momon.gs
git show <commit>:Momon.gs > app/Momon.gs
rm app/Config.gs
clasp push
```

Lalu deploy versi baru lagi. Tanpa git juga bisa lewat editor Apps Script:
**⋮ → Lihat riwayat versi**, pilih versi sebelum migrasi, lalu pulihkan.

## Pertanyaan yang mungkin muncul

**Perlu jalankan ulang `momonSiapkanSheet()` atau `momonIsiIdTransaksiLama()`?**
Tidak. Tidak ada perubahan skema sheet pada rilis ini.

**Trigger terjadwalnya ikut terhapus?**
Tidak. Trigger terikat ke nama fungsi (`momonSapaPagi`, `momonIngatkanMalam`), dan nama
fungsinya tidak berubah — cuma pindah berkas.

**Script Properties-nya aman?**
Aman. Property tersimpan di level project, bukan di dalam berkas kode.
