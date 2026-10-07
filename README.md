# 🌟 Momon — Asisten Keuangan Telegram yang Ceria

Bot Telegram pencatat keuangan pribadi yang berjalan sepenuhnya di **Google Apps Script**
dan menyimpan data di **Google Sheets**. Tanpa server, tanpa database, tanpa biaya hosting.

Catat pengeluaran dengan bahasa sehari-hari, tanya laporan dengan kalimat bebas,
lalu buka hasilnya langsung di spreadsheet lewat satu tombol.

```
kamu  : kopi 25k pakai GoPay
Momon : ✅ Sip, dicatat ya Abang! 🎉
        🔴 Pengeluaran Rp 25.000 — kopi
        📂 Kategori: Makanan & Minuman
        💼 Kantong: GoPay
        🗓️ 5 Oktober 2026, 09:14
        [ 📊 Lihat di Google Sheet ]

kamu  : berapa jajanku minggu lalu?
Momon : 📊 Pengeluaran Makanan Minggu Lalu
        28 Sep 2026 s/d 4 Okt 2026 • Pengeluaran • Kategori: Makanan & Minuman
        🔴 Pengeluaran: Rp 412.000
        🧾 11 transaksi dalam 6 hari aktif
        ...
        [ 📊 Buka laporan di Google Sheet ]
```

---

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 💬 **Catat pakai bahasa manusia** | `kemarin beli buku 120k`, `gajian 5jt`, `bensin 50rb jam 7 pagi` |
| 🧾 **Banyak transaksi sekaligus** | `kopi 25k, parkir 5k, gajian 5jt` — satu pesan, langsung tercatat semua |
| 🔄 **Transfer antar kantong** | `pindah 100k dari Cash ke GoPay` atau `/transfer 100k dari Cash ke GoPay` |
| 🧠 **Laporan cerdas** | Tanya bebas: `5 pengeluaran terbesar bulan ini`, `rekap transportasi 3 bulan terakhir` |
| 👥 **Multi-akun** | Dua (atau lebih) akun Telegram, **sheet-nya terpisah** — data tidak tercampur |
| 📊 **Buka di Google Sheet** | Tiap laporan ditulis ke sheet tersendiri + tombol langsung ke tab-nya |
| 💼 **Kantong per akun** | Tiap orang boleh punya daftar dompet/rekening sendiri |
| 🗓️ **Backdate** | Paham "kemarin", "Senin lalu", "3 hari lalu", "1 Oktober" |
| ☀️🌙 **Pengingat harian** | Sapaan pagi + rekap/pengingat malam kalau hari itu belum mencatat |
| 🔒 **Whitelist ketat** | AI hanya boleh memilih kategori & kantong dari daftar yang kamu tentukan |

### Kenapa angkanya bisa dipercaya

AI **tidak pernah menghitung apa pun**. Gemini hanya bertugas menerjemahkan kalimatmu
menjadi *filter* — rentang tanggal, tipe, kategori, kantong, kata kunci, pengelompokan.
Seluruh penjumlahan, rata-rata, dan persentase dikerjakan oleh JavaScript di
`momonHitungRingkasan()` / `momonKelompokkan()`, langsung dari isi spreadsheet.
Jadi laporan tidak mungkin berisi angka halusinasi.

Hasil AI juga selalu divalidasi ulang terhadap daftar tertutup
(`momonCatatTransaksi`, `momonTransfer`, `momonNormalisasiSpec`). Kantong & nominal
divalidasi ketat — kalau tidak cocok, transaksi **ditolak** dan kamu diminta
memperjelas, bukan dicatat asal-asalan. Kategori tetap dibantu AI: kalau AI mengarang
kategori, nilainya dipaksa ke `Lainnya` dan kamu diberi tahu lewat peringatan ⚠️.

---

## 📦 Isi repo

```
.
├── app/                  # isi project Apps Script — ini yang di-push clasp
│   ├── Config.gs         # konstanta MOMON_* + momonConfig/momonUser — yang perlu disetel
│   ├── Momon.gs          # seluruh logika bot
│   └── appsscript.json   # manifest Apps Script (timezone + konfigurasi Web App)
├── .clasp.json.example   # contoh config clasp — salin ke .clasp.json
├── .gitignore
├── LICENSE               # CC BY-NC-SA 4.0 (teks legal resmi)
├── NOTICE                # atribusi yang wajib ikut saat didistribusikan ulang
├── MIGRASI.md            # cara update project Apps Script yang sudah jalan
├── TODO.md               # catatan keputusan tiap rilis
└── README.md
```

Tidak ada dependency, tidak ada build step.

Semua yang masuk ke Apps Script ada di **`app/`**, terpisah dari dokumentasi di root —
makanya `.clasp.json` memakai `"rootDir": "app"`. Berkas di luar `app/` tidak ikut
ter-push, jadi README & catatan lain tidak nyasar jadi berkas `.gs` di project.

`Config.gs` dipisah supaya semua yang perlu disetel ada di satu tempat yang pendek.
Apps Script menaruh semua berkas `.gs` di **satu ruang global** — tidak ada import/export,
semua fungsi bisa saling panggil, dan satu nama cuma boleh dideklarasikan sekali di
seluruh project. Urutan berkas tidak berpengaruh.

---

## 🚀 Pemasangan

### 1. Buat spreadsheet & project Apps Script

1. Buat Google Spreadsheet baru → beri nama bebas, misal `Keuangan Momon`.
2. Menu **Extensions → Apps Script**.

> ⚠️ **Harus dibuat dari dalam spreadsheet** (container-bound). Momon memakai
> `SpreadsheetApp.getActiveSpreadsheet()`, jadi project Apps Script yang berdiri
> sendiri tidak akan jalan.

3. Salin berkas-berkas `.gs` dari repo ini ke project. Dua cara:

   **Dengan clasp** (lebih cepat, sekali jalan):

   ```bash
   npm install -g @google/clasp
   clasp login
   cp .clasp.json.example .clasp.json   # isi scriptId dari ⚙️ Project Settings
   clasp push
   ```

   **Manual lewat editor:** hapus isi `Code.gs` bawaan, ganti namanya jadi `Momon`, lalu
   tempel seluruh isi `Momon.gs`. Lalu **+ → Script**, beri nama `Config` (tanpa `.gs` —
   Apps Script menambahkannya sendiri), hapus `function myFunction() {}` bawaannya, dan
   tempel seluruh isi `Config.gs`.

4. Klik ⚙️ **Project Settings** → centang *Show "appsscript.json" manifest file*,
   lalu samakan isinya dengan `app/appsscript.json` di repo ini.

> Sudah punya Momon versi lama yang konstantanya masih di dalam `Momon.gs`? Jangan
> tambahkan `Config.gs` di sampingnya begitu saja — konstanta yang sama akan terdeklarasi
> dua kali dan semua eksekusi gagal. Ikuti [MIGRASI.md](MIGRASI.md).

### 2. Buat & siapkan bot Telegram

1. Chat [@BotFather](https://t.me/BotFather) → `/newbot` → ikuti instruksinya
   (nama bebas, username wajib berakhiran `bot`, misal `MomonKeuangan_bot`).
2. Simpan token yang diberikan (bentuknya `123456789:AA...`) — ini nilai untuk `MOMON_BOT_TOKEN`.

**Lengkapi profil bot lewat @BotFather (opsional, tapi disarankan):**

| Perintah BotFather | Fungsi | Contoh isi |
|---|---|---|
| `/setdescription` | Teks yang tampil di layar sebelum chat pertama dimulai | `Asisten keuangan pribadi yang ceria — catat transaksi, transfer antar kantong, dan tanya laporan cukup lewat chat.` |
| `/setabouttext` | Teks singkat di halaman profil bot | `Catat uang masuk/keluar & tanya laporan lewat chat biasa. Dibuat dengan Google Apps Script.` |
| `/setuserpic` | Foto profil bot | unggah gambar bebas |
| `/setcommands` | Daftar command yang muncul di menu "/" Telegram | lihat blok di bawah |
| `/setjoingroups` | **Disable** — Momon bot personal, tidak dirancang dipakai di grup | `Disable` |
| `/setprivacy` | Mode privasi di grup; tidak berpengaruh untuk chat pribadi | boleh dilewati |

**Satu langkah yang WAJIB, bukan opsional:**

| Perintah BotFather | Fungsi | Contoh isi |
|---|---|---|
| `/setinline` | Menyalakan inline mode | `koreksi transaksi…` |

Momon tidak menyediakan hasil inline apa pun — inline mode dipakai semata-mata supaya
tombol **✏️ Edit** di balasan bisa *mengisi* kotak ketik dengan `/edit <id> `. Kalau
langkah ini dilewati, tombol itu tidak berfungsi (tombol lain tetap normal).
`momonCekKonfigurasi()` akan memberi tanda ⚠️ selama inline mode masih mati.

Untuk `/setcommands`, pilih bot kamu lalu kirim blok berikut **persis seperti ini**
(format `nama - deskripsi`, nama harus huruf kecil tanpa `/`):

```
start - 👋 Panduan singkat
help - 📖 Panduan & daftar perintah
saldo - 💰 Saldo tiap kantong + total
hari - 📅 Rekap hari ini
minggu - 🗓 Rekap minggu ini
bulan - 📆 Rekap bulan ini
laporan - 🧠 Laporan cerdas, tambahkan pertanyaan bebas
transfer - 🔄 Transfer saldo antar kantong
edit - ✏️ Perbaiki transaksi: /edit <id> <koreksi>
hapus - 🗑 Hapus transaksi: /hapus <id>
debug - 🐞 Status Momon: model, config, error terakhir
sheet - 📂 Tombol ke Google Sheet
kategori - 🏷 Daftar kategori yang berlaku
kantong - 👛 Daftar kantong milikmu
id - 🆔 Tampilkan chat id
```

> Daftar `/setcommands` ini murni kosmetik (menu "/" di aplikasi Telegram) — perilaku
> command yang sebenarnya tetap ditentukan oleh `momonRoute()` di `Momon.gs`. Kalau nanti
> menambah command baru di kode, perbarui juga daftar ini lewat `/setcommands`.

### 3. Ambil Gemini API key

Buka <https://aistudio.google.com/apikey> → **Create API key** → salin.

### 4. Isi Script Properties

**Project Settings → Script Properties → Add script property.**
Ini satu-satunya tempat menyimpan rahasia — jangan pernah menulisnya di dalam kode.

| Property | Isi |
|---|---|
| `MOMON_BOT_TOKEN` | token dari BotFather |
| `MOMON_GEMINI_API_KEY` | key dari AI Studio |
| `MOMON_USERS` | JSON daftar user (lihat di bawah) |
| `MOMON_WEBHOOK_URL` | diisi nanti di langkah 6 |

Isi `MOMON_USERS` dengan JSON satu baris. Chat id didapat di langkah 7 —
untuk sekarang boleh diisi dulu dengan tebakan dan dibetulkan belakangan:

```json
{"111111111":{"nama":"Abang","sheet":"abang","sheetLaporan":"abang.report","kantong":["Cash","Bank Jago","BSI","GoPay","Investasi/Tabungan"]},"222222222":{"nama":"Sian","sheet":"hassian","sheetLaporan":"hassian.report","kantong":["Cash","Bank Jago","BSI","GoPay","Investasi/Tabungan","BCA"]}}
```

| Field | Wajib | Keterangan |
|---|---|---|
| *(key)* | ✅ | chat id Telegram, berupa angka dalam tanda kutip |
| `nama` | ✅ | sapaan yang dipakai Momon |
| `sheet` | ✅ | nama tab penyimpan transaksi akun ini |
| `sheetLaporan` | ✅ | nama tab tempat laporan ditulis ulang |
| `kantong` | — | daftar dompet/rekening akun ini; kalau kosong pakai `MOMON_KANTONG_DEFAULT` |

Mau menambah akun ketiga? Tinggal tambahkan entri baru — kodenya tidak dibatasi dua.

### 5. Verifikasi konfigurasi

Di editor, pilih fungsi `momonCekKonfigurasi` → **Run**. Setujui permission saat diminta
(Google akan menampilkan peringatan "app isn't verified" — pilih *Advanced → Go to ... (unsafe)*,
ini wajar untuk script milik sendiri).

Lihat hasilnya di **Execution log**:

```
✅ MOMON_BOT_TOKEN: terisi (46 karakter)
✅ MOMON_GEMINI_API_KEY: terisi (51 karakter)
⚠️ MOMON_WEBHOOK_URL: KOSONG
✅ MOMON_USERS: 2 akun terdaftar
   • Abang (111111111) -> sheet "abang"
   • Sian (222222222) -> sheet "hassian"
✅ Spreadsheet: Keuangan Momon
ℹ️ Zona waktu script: Asia/Makassar
```

### 6. Deploy sebagai Web App & pasang webhook

1. **Deploy → New deployment** → ⚙️ pilih tipe **Web app**.
2. *Execute as*: **Me** — *Who has access*: **Anyone**.
   (Wajib "Anyone" supaya server Telegram bisa memanggilnya. Yang bisa memakai bot
   tetap dibatasi oleh `MOMON_USERS`.)
3. **Deploy** → salin **Web app URL** (berakhiran `/exec`).
4. Tempel URL itu ke Script Property `MOMON_WEBHOOK_URL`.
5. Jalankan fungsi `momonPasangWebhook` → log harus berisi `{"ok":true,...}`.

> Tiap kali kode berubah, **Deploy → Manage deployments → ✏️ → New version → Deploy**.
> Selama URL deployment tidak berubah, webhook tidak perlu dipasang ulang.

### 7. Daftarkan chat id yang benar

Kirim `/id` ke bot dari **masing-masing** akun Telegram. Momon membalas chat id-nya —
perintah ini sengaja terbuka untuk siapa saja. Betulkan `MOMON_USERS` dengan id tersebut.

### 8. Siapkan sheet (opsional)

Jalankan `momonSiapkanSheet` untuk membuat tab + header semua akun sekaligus,
tanpa menunggu pesan pertama masuk.

### 9. Pengingat harian (opsional)

**Triggers (⏰) → Add Trigger:**

| Fungsi | Event | Waktu |
|---|---|---|
| `momonSapaPagi` | Time-driven → Day timer | 7–8 pagi |
| `momonIngatkanMalam` | Time-driven → Day timer | 9–10 malam |

Selesai. Kirim `/help` ke bot untuk mulai. 🎉

---

## 💬 Perintah

| Perintah | Fungsi |
|---|---|
| `/start`, `/help` | Panduan singkat |
| `/saldo` | Saldo tiap kantong + total |
| `/hari` | Rekap hari ini |
| `/minggu` | Rekap minggu ini |
| `/bulan` | Rekap bulan ini |
| `/laporan <pertanyaan>` | Laporan cerdas; tanpa argumen = bulan ini |
| `/transfer <nominal> dari <asal> ke <tujuan>` | Transfer saldo antar kantong; tanpa argumen = contoh cara pakai |
| `/edit <id> <koreksi>` | Perbaiki transaksi yang sudah tercatat, koreksinya bahasa bebas |
| `/hapus <id>` | Hapus transaksi (Momon minta konfirmasi dulu) |
| `/debug` | Status Momon: model, config, jumlah baris, draft pending, error terakhir |
| `/sheet` | Tombol ke Google Sheet |
| `/kategori` | Daftar kategori yang berlaku |
| `/kantong` | Daftar kantong milikmu |
| `/id` | Tampilkan chat id (terbuka untuk siapa saja) |

**Teks bebas** tidak perlu perintah. Momon sendiri yang menebak maksudnya:
mencatat transaksi, transfer antar kantong, menanyakan laporan, atau sekadar mengobrol.

**Foto struk** dan **voice note** juga bisa langsung dikirim — lihat di bawah.

### Contoh mencatat

```
kopi 25k pakai GoPay
gajian 5jt
kemarin beli buku 120k
bayar listrik 350rb dari Bank Jago
3 hari lalu grab ke kantor 28k
makan siang 45k jam 12:30
kopi 25k, parkir 5k, gajian 5jt
```

### Contoh transfer

```
pindah 100k dari Cash ke GoPay
/transfer 200k dari Bank Jago ke BSI buat bayar kosan
```

### Progres & tombol aksi

Setiap aksi yang menyentuh sheet menampilkan progresnya di **satu pesan yang sama**,
bukan menumpuk pesan baru:

```
⏳ Momon lagi baca pesanmu…      ->  💾 Momon lagi nyatet…      ->  ✅ Sip, dicatat ya!
```

Balasan akhirnya untuk satu transaksi membawa tiga tombol:

| Tombol | Fungsi |
|---|---|
| ✏️ Edit | **Mengisi kotak ketik** dengan `/edit <id> ` — tinggal lanjut mengetik koreksinya |
| 🗑️ Hapus | Masuk ke konfirmasi hapus (tetap ✅/❌ dulu, tidak langsung terhapus) |
| 📊 Lihat di Google Sheet | Buka tab transaksinya |

Catatan kecil: ✏️ Edit hanya muncul kalau pesannya menghasilkan **satu** transaksi —
kalau satu pesan mencatat beberapa sekaligus, tidak ada satu id yang bisa ditunjuk, jadi
hanya tombol 📊 yang tampil. Baris **transfer** tidak punya ✏️ Edit karena menyentuh dua
kantong sekaligus; untuk memperbaikinya, hapus lalu catat ulang.

Tombol-tombol ini tidak kedaluwarsa — menekan 🗑️ di balasan minggu lalu tetap jalan
(kalau barisnya sudah telanjur dihapus, Momon bilang transaksinya tidak ketemu).

### Foto struk 🧾

Kirim foto struknya, Momon yang membaca nominal, kategori, dan tanggalnya.
Caption dipakai sebagai konteks tambahan kalau ada yang tidak terbaca di struk —
misal `pakai BCA` untuk menentukan kantongnya.

Kalau item-item di struk jatuh ke kategori yang berbeda, Momon memecahnya jadi
beberapa transaksi sekaligus.

### Voice note 🎙️

Tinggal ngomong, tidak usah mengetik. Voice note diproses lewat jalur yang sama
dengan teks bebas, jadi bisa dipakai untuk mencatat **maupun** bertanya laporan.

### Preview & konfirmasi

Hasil dari foto dan voice note **tidak langsung tersimpan**. Momon menampilkan
hasil bacaannya dulu lengkap dengan tombol:

| Tombol | Fungsi |
|---|---|
| ✅ Simpan | Tulis ke sheet |
| ✏️ Edit | Kirim koreksi bahasa bebas, draft diperbaiki lalu ditampilkan ulang |
| ❌ Batal | Buang draft, tidak ada yang tersimpan |

Hanya ada satu draft menunggu per chat — mengirim foto/suara baru otomatis
membatalkan draft sebelumnya. Draft yang didiamkan lebih dari 15 menit hangus
sendiri. Teks bebas yang diketik biasa **tidak** lewat preview; tetap langsung
tercatat seperti sebelumnya.

### Contoh bertanya

```
berapa jajanku minggu lalu?
5 pengeluaran terbesar bulan ini
total transportasi bulan September
rekap per kantong 3 bulan terakhir
pengeluaran di atas 500rb tahun ini
pemasukan bulan ini berapa?
pengeluaran GoPay minggu ini dikelompokkan per hari
```

---

## 🗂️ Struktur data

Sheet transaksi tiap akun memakai 8 kolom:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Tanggal Transaksi | Tipe | Kategori | Kantong | Nominal | Deskripsi | Dicatat Pada | ID |

- **Tanggal Transaksi** — waktu efektif transaksi (boleh backdate).
- **Dicatat Pada** — waktu pesan masuk, tidak pernah backdate. Berguna untuk audit.
- **ID** — nomor urut per akun, dipakai `/edit` dan `/hapus`. Momon menampilkannya
  di balasan pencatatan dan di rincian laporan.

> Punya sheet dari versi sebelum kolom ID ada? Jalankan `momonIsiIdTransaksiLama`
> sekali dari editor Apps Script untuk mengisi ID baris-baris lama. Aman diulang.

Sheet laporan ditulis ulang setiap kali laporan dibuat, berisi: ringkasan,
tabel per-kelompok dengan persentase, lalu rincian transaksi **lengkap**
(di Telegram rincian dibatasi 20 baris, di sheet tidak dipotong).

> Baris yang tanggalnya bukan Date atau nominalnya ≤ 0 otomatis dilewati,
> jadi aman kalau kamu menambahkan catatan manual di bawah data.

---

## 🐞 Debug

Kalau ada yang aneh — struk salah dibaca, balasan error, atau lambat — nyalakan
mode debug lewat **Script Properties**:

| Property | Nilai |
|---|---|
| `MOMON_DEBUG` | `true` untuk menyalakan, `false` / hapus untuk mematikan |

Tidak perlu redeploy; Script Properties dibaca tiap pesan masuk.

Saat aktif, setiap balasan Momon diikuti satu pesan diagnosa berisi:

- model Gemini yang dipakai, ukuran prompt, dan ukuran media yang dikirim
- kode HTTP tiap percobaan ke Gemini + berapa lama tiap percobaan
- **jawaban mentah AI** sebelum divalidasi — ini biasanya yang paling menjelaskan
  kenapa kategori atau nominalnya meleset
- kode HTTP dan durasi tiap panggilan Telegram
- ukuran & tipe berkas foto/voice yang diunduh
- stack error kalau ada yang dilempar

`/debug` sendiri bisa dipakai kapan saja (tidak perlu `MOMON_DEBUG` aktif) untuk
melihat status: config terisi atau belum, model yang dipakai, jumlah baris sheet,
ID berikutnya, draft yang sedang menunggu konfirmasi, dan error terakhir yang
tercatat.

> Matikan lagi kalau sudah selesai — pesan diagnosa ikut terkirim ke chat dan
> isinya cukup berisik.

---

## ⚙️ Kustomisasi

Semua di `Config.gs`:

| Konstanta | Fungsi |
|---|---|
| `MOMON_TIMEZONE` | Zona waktu. **Harus sama** dengan `timeZone` di `appsscript.json` |
| `MOMON_MODEL` | Model Gemini untuk teks |
| `MOMON_MODEL_MEDIA` | Model Gemini untuk foto struk & voice note |
| `MOMON_KOMENTAR_AI` | `false` untuk mematikan kalimat insight di akhir laporan (hemat 1 panggilan API) |
| `MOMON_MAKS_RINCIAN_CHAT` | Batas baris rincian di Telegram |
| `MOMON_PREVIEW_TTL_DETIK` | Umur draft foto/suara yang menunggu konfirmasi |
| `MOMON_MAKS_UKURAN_FILE` | Batas ukuran foto/voice note yang diproses |
| `MOMON_KATEGORI_PENGELUARAN` | Whitelist kategori pengeluaran |
| `MOMON_KATEGORI_PEMASUKAN` | Whitelist kategori pemasukan |
| `MOMON_KANTONG_DEFAULT` | Kantong untuk akun yang tidak punya daftar sendiri |

Menambah kategori cukup menambah string di array — prompt AI otomatis ikut terbarui
karena daftarnya disuntikkan ke prompt saat runtime.

---

## 🧑‍💻 Pengembangan dengan clasp (opsional)

```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json   # isi scriptId dari Project Settings
clasp push                            # lokal  -> Apps Script
clasp pull                            # Apps Script -> lokal
```

`.clasp.json` sudah masuk `.gitignore` karena berisi `scriptId` milik project pribadi.

`clasp push` mengirim **seluruh isi `app/`** sebagai isi project — berkas yang kamu hapus
di lokal ikut hilang di Apps Script. Ingat, `push` saja belum mengganti bot yang live:
Web App tetap menyajikan versi yang di-deploy sampai kamu menekan
**Deploy → Manage deployments → ✏️ → New version → Deploy**.

Mau memperbarui project yang sudah jalan (termasuk pindah dari `Momon.gs` lama yang satu
berkas)? Ikuti [MIGRASI.md](MIGRASI.md).

---

## 🔐 Keamanan

- **Jangan pernah** menulis token atau API key di dalam kode. Semua rahasia hidup di
  Script Properties, dan konstanta `*_FALLBACK` di repo ini sengaja dibiarkan kosong.
- `MOMON_USERS` berisi chat id pribadi — simpan di Script Properties, bukan di kode.
- Web App memang harus dibuka untuk "Anyone", tapi `momonTerimaUpdate()` menolak
  setiap chat id yang tidak ada di `MOMON_USERS`.
- Kalau token pernah ter-commit, langsung rotate: `/revoke` ke @BotFather,
  dan hapus key lama di AI Studio. Menghapus commit saja tidak cukup —
  riwayat Git tetap menyimpannya.

---

## 🩺 Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Bot diam total | Webhook belum terpasang. Jalankan `momonPasangWebhook`, pastikan log `{"ok":true}` |
| Balasan "Momon belum kenal kamu" | Chat id belum ada di `MOMON_USERS`, atau ditulis sebagai angka tanpa kutip di JSON |
| "Layanan AI lagi rewel (HTTP 400/403)" | API key salah, belum aktif, atau kuota habis |
| Tanggal "kemarin" meleset sehari | `MOMON_TIMEZONE` dan `timeZone` di `appsscript.json` beda |
| Kode baru tidak berefek | Belum **New version** saat deploy — Web App masih memakai versi lama |
| Error permission saat Run | Setujui ulang lewat *Advanced → Go to ... (unsafe)* |
| Format kolom tanggal kacau | Sheet memakai fitur **Tables** Google Sheets; data tetap benar, hanya tampilan yang tidak dipaksa |

Log lengkap ada di **Executions** pada editor Apps Script.

---

## 📄 Lisensi

**Momon adalah milik Dhana (abela-a).** Hak ciptanya tidak dilepas.

Karya ini dilisensikan di bawah
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](LICENSE)
(**CC BY-NC-SA 4.0**) — Copyright © 2026 Dhana (abela-a).

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

| | |
|---|---|
| ✅ **Boleh dipakai & dipelajari** | Jalankan untuk keperluan pribadi sepuasnya |
| ✅ **Boleh diubah** | Fork, modifikasi, kembangkan sesuai kebutuhanmu |
| ✅ **Boleh disebarkan ulang** | Asal syarat di bawah dipenuhi |
| ❌ **Dilarang untuk komersial** | Tidak boleh dijual, dijadikan produk/layanan berbayar, atau dipakai untuk keuntungan komersial — kecuali dengan izin tertulis dari pemilik |
| 🔒 **Share-Alike** | Karya turunanmu **wajib** memakai lisensi yang sama (CC BY-NC-SA 4.0) |
| 📝 **Atribusi wajib** | Cantumkan nama pemilik + tautan ke repo ini, dan tandai bagian yang kamu ubah |
| ⚠️ **Tanpa jaminan** | Dipakai atas risiko sendiri. Ini menyangkut data keuanganmu — periksa sendiri sebelum dipercaya penuh |

Rincian kewajiban saat mendistribusikan ulang ada di [`NOTICE`](NOTICE).

Butuh memakai Momon untuk keperluan komersial? Hubungi pemiliknya untuk
meminta lisensi terpisah.

> Catatan: lisensi Creative Commons dirancang untuk karya kreatif, bukan
> khusus untuk kode, sehingga tidak mengatur paten dan batas "nonkomersial"
> bisa abu-abu dalam kasus tertentu. Lisensi ini dipilih secara sadar untuk
> menegaskan kepemilikan dan melarang pemanfaatan komersial.

Merek dan logo pihak ketiga (Telegram, Google, Gemini) bukan bagian dari
lisensi ini.
