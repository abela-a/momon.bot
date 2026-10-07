# TODO

See [README.md](README.md) for setup, usage, and configuration details.

## ✅ SUDAH DIKERJAKAN — notif progres + tombol aksi di balasan

Disepakati & diimplementasikan 2026-10-08.

> ⚠️ Sekali jalan setelah deploy: nyalakan inline mode lewat `/setinline` di
> [@BotFather](https://t.me/BotFather). Tanpa ini tombol **✏️ Edit** tidak mengisi kotak
> ketik. Verifikasi dengan `momonCekKonfigurasi()` — barisnya harus `✅ Inline mode: aktif`.
>
> Langkah update lengkapnya ada di [MIGRASI.md](MIGRASI.md).

### Pemisahan berkas

- Konfigurasi dipindah ke **`Config.gs`** (konstanta `MOMON_*` + `momonConfig`/`momonUser`),
  sisanya tetap di `Momon.gs`. Tujuannya supaya yang perlu disetel tidak perlu dicari di
  tengah ~3000 baris logika.
- Sempat dipecah jadi 15 berkas per-bagian, lalu digabung lagi — terlalu terpencar untuk
  kode yang semuanya berbagi satu ruang global dan tidak punya batas modul sungguhan.
  Yang betul-betul untung dipisah cuma konfigurasinya.
- Pemisahan ini **murni pemindahan**: tidak ada nama fungsi atau logika yang berubah, jadi
  trigger terjadwal yang sudah terpasang tetap jalan tanpa disentuh.

- **Notif progres bertahap**, bukan konfirmasi baru. Setiap aksi yang menyentuh sheet
  menulis ulang **satu pesan yang sama**: ⏳ sebelum panggilan Gemini (di situ tunggunya
  terasa) → 💾 sebelum baris ditulis → hasil akhir. Pola ini sudah dipakai jalur foto/suara
  sejak awal; sekarang jalur teks ikut memakainya.
- **Keputusan poin 3 di bawah TETAP BERLAKU**: teks ketik biasa **tidak** dapat
  preview/konfirmasi, tetap langsung tercatat. Yang ditambahkan cuma penanda progres —
  pertimbangannya sama seperti dulu, pencatatan harian adalah aksi yang paling sering
  dilakukan dan tidak layak kena satu tap ekstra.
- **Tiga tombol di balasan**: ✏️ Edit, 🗑️ Hapus, 📊 Lihat di Google Sheet.
  - ✏️ Edit memakai `switch_inline_query_current_chat` karena itu **satu-satunya** mekanisme
    Telegram yang betul-betul *mengisi* kotak ketik (`copy_text` cuma menyalin ke clipboard,
    tombol callback tidak menyentuh kotak ketik sama sekali). Harganya: inline mode wajib
    aktif, dan Telegram menempelkan `@username ` di depan teksnya — ditanggalkan lagi oleh
    `momonLepasMentionBot`.
  - 🗑️ Hapus **tidak** menghapus langsung; ia cuma pintu masuk ke konfirmasi `/hapus` yang
    sudah ada. Konfirmasi tetap jadi milik hapus saja, sesuai poin 4 di bawah.
  - Tombol ✏️/🗑️ disembunyikan kalau tidak ada satu baris yang bisa ditunjuk (hasil
    multi-transaksi), dan ✏️ juga disembunyikan untuk transfer (konsisten dengan `/edit`
    yang memang menolak baris transfer).
- Tombol aksi sengaja **tidak diberi masa berlaku** — beda dari draft preview yang hangus 15
  menit. Draft itu berisi data yang belum tersimpan sehingga berbahaya kalau basi; tombol
  ini cuma menunjuk id yang sudah ada di sheet, dan kalau barisnya telanjur hilang Momon
  menjawab "transaksi tidak ketemu".

## ✅ SUDAH DIKERJAKAN — input gambar & suara, preview-konfirmasi, ID transaksi

Disepakati lewat sesi grilling (2026-10-07), diimplementasikan di hari yang sama.
Catatan keputusan di bawah sengaja disimpan sebagai rekaman *kenapa*-nya — cara
kerjanya sendiri sudah terdokumentasi di [README.md](README.md) dan
[CLAUDE.md](CLAUDE.md).

> ⚠️ Sekali jalan setelah deploy: jalankan `momonIsiIdTransaksiLama()` dari editor
> Apps Script untuk mengisi kolom ID baris-baris lama.

### 1. Input gambar (foto struk)

- Foto diperlakukan sebagai struk/receipt: Gemini mengekstrak nominal/kategori/deskripsi
  langsung dari isi gambar.
- Kalau foto dikirim dengan caption, teks caption digabung sebagai konteks tambahan
  (mis. caption "pakai BCA" dipakai untuk menentukan kantong yang tidak terlihat di struk).
- Scope intent gambar **dibatasi ke transaksi/transfer saja** — tidak dipakai untuk
  pertanyaan laporan (foto struk tidak masuk akal untuk "berapa jajanku minggu ini?").
- Satu foto boleh menghasilkan **banyak transaksi sekaligus** (struk belanja dengan
  beberapa item → preview itemized, semua disimpan bareng saat dikonfirmasi).
- Hanya tipe pesan Telegram `photo` yang didukung dulu. `document` (file gambar/PDF
  mentah) belum — tambahkan nanti kalau benar-benar dibutuhkan.

### 2. Input suara

- Voice note = "ngomong, bukan ngetik" — ditranskrip lalu lewat pipeline yang **sama
  persis** dengan teks bebas (`momonOtak`), jadi bisa menghasilkan transaksi, transfer,
  **atau** laporan (mis. voice note "berapa jajanku minggu ini?"). Tidak dibatasi seperti
  gambar.
- Hanya tipe pesan Telegram `voice` (voice note tombol mic) yang didukung dulu, bukan
  `audio` (file audio upload/forward).

### 3. Preview & konfirmasi (khusus gambar & suara)

- Teks bebas (ketik biasa) **tidak berubah** — tetap langsung tercatat seperti sekarang,
  tanpa preview/konfirmasi. Preview/konfirmasi hanya untuk hasil ekstraksi dari
  gambar/suara.
- Konfirmasi pakai **inline keyboard button** (✅ Simpan / ✏️ Edit / ❌ Batal), bukan
  balasan teks "ya"/"batal" — supaya tidak ambigu.
- **✏️ Edit**: user kirim pesan teks koreksi (mis. "nominalnya 30rb, kategorinya
  Transportasi"), preview yang masih pending di-*patch* lalu ditampilkan ulang untuk
  dikonfirmasi lagi — bukan dianggap batal/harus kirim ulang dari nol.
- Setelah user tekan ✅ Simpan, bot **mengedit pesan preview yang sama** (jadi "✅
  Tersimpan" + ringkasan), bukan kirim pesan baru — ini yang dimaksud "mekanisme edit
  pesan" di requirement awal.
- Hanya **satu preview pending per chat** dalam satu waktu — kirim gambar/suara baru
  sebelum preview lama dikonfirmasi akan otomatis membatalkan yang lama.
- Preview pending **kedaluwarsa setelah 15 menit** — tombol yang ditekan setelah expired
  menunjukkan pesan bahwa draft sudah kedaluwarsa, bukan diam-diam tetap tersimpan.

### 4. ID transaksi + edit/hapus

- Tambah kolom baru **"ID"** di `MOMON_HEADER` — **sequential integer per user**, mulai
  dari 1 (bukan UUID/kode acak/tanggal). Paling gampang dibaca & diketik user ke
  `/hapus 42`.
- Baris historis yang sudah ada (belum punya ID) **dibackfill sekali jalan**: diberi ID
  urut sesuai urutan baris yang sudah ada di sheet (baris pertama setelah header = ID 1,
  dst.) — supaya seluruh riwayat bisa diakses lewat ID, bukan cuma transaksi baru.
  Mirip pola migrasi satu-kali `momonPerbaikiTipeTransferLama` yang sudah ada.
- **`/edit <id> ...`** — bentuk bebas lewat Gemini (bukan `/edit <id> <field> <value>`
  satu-field), konsisten dengan filosofi free-form bot ini. Hasil ekstraksi tetap wajib
  lewat validasi whitelist yang sama seperti `momonCatatTransaksi`/`momonTransfer`
  (invariant keamanan di CLAUDE.md harus tetap berlaku untuk jalur edit ini juga).
- **`/hapus <id>`** — **wajib konfirmasi** (inline button ✅/❌, pola sama seperti preview
  gambar/suara) sebelum baris benar-benar dihapus, karena ini satu-satunya operasi yang
  genuinely destruktif & tidak bisa di-undo.
- Baris **Transfer** boleh dihapus, tapi **tidak boleh diedit field-nya langsung** (karena
  menyentuh 2 kantong sekaligus — risiko saldo jadi inkonsisten). Untuk transfer yang
  salah: hapus lalu catat ulang.
- Tidak ada batasan umur transaksi — transaksi bulan lalu sama bisa diedit/dihapus
  seperti transaksi hari ini.

### Catatan implementasi (hasil riset kode sebelum grilling, 2026-10-07)

Semua ini **belum ada sama sekali** di `Momon.gs` saat ini, jadi perlu dibangun dari nol:

- `momonPanggilGemini` cuma kirim `{parts:[{text: prompt}]}` — perlu payload multimodal
  (`inlineData`/`mimeType`) untuk gambar & suara.
- Perlu fungsi baru untuk `getFile` + download file dari Telegram (foto/voice) sebelum
  dikirim ke Gemini.
- `momonTerimaUpdate` cuma baca `message.text` — perlu baca `message.photo`,
  `message.voice`, `message.caption`, dan `update.callback_query` (belum ada sama sekali,
  zero handling untuk tombol inline selain link-button biasa).
- Perlu fungsi baru untuk `editMessageText` dan `answerCallbackQuery` — `momonKirim`
  sekarang cuma bisa `sendMessage`.
- Belum ada state pending antar-pesan sama sekali (`CacheService` tidak dipakai di mana
  pun) — perlu disiapkan untuk nyimpen preview yang menunggu konfirmasi (per chat, dengan
  expiry 15 menit sesuai keputusan di atas).
- `MOMON_HEADER` perlu kolom ID baru + migrasi backfill untuk baris lama.
- Command baru di `momonRoute`: `/edit <id> ...` dan `/hapus <id>`.
