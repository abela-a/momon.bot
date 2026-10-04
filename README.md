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
(`momonNormalisasiTransaksi`, `momonNormalisasiSpec`). Kalau AI mengarang kategori,
nilainya dipaksa ke `Lainnya` dan kamu diberi tahu lewat peringatan ⚠️.

---

## 📦 Isi repo

```
.
├── Momon.gs              # seluruh logika bot (satu file, self-contained)
├── appsscript.json       # manifest Apps Script (timezone + konfigurasi Web App)
├── .clasp.json.example   # contoh config clasp — salin ke .clasp.json
├── .gitignore
├── LICENSE               # Apache License 2.0
├── NOTICE                # atribusi yang wajib ikut saat didistribusikan ulang
└── README.md
```

Tidak ada dependency, tidak ada build step.

---

## 🚀 Pemasangan

### 1. Buat spreadsheet & project Apps Script

1. Buat Google Spreadsheet baru → beri nama bebas, misal `Keuangan Momon`.
2. Menu **Extensions → Apps Script**.

> ⚠️ **Harus dibuat dari dalam spreadsheet** (container-bound). Momon memakai
> `SpreadsheetApp.getActiveSpreadsheet()`, jadi project Apps Script yang berdiri
> sendiri tidak akan jalan.

3. Hapus isi `Code.gs` bawaan, ganti namanya jadi `Momon`, lalu tempel seluruh isi `Momon.gs`.
4. Klik ⚙️ **Project Settings** → centang *Show "appsscript.json" manifest file*,
   lalu samakan isinya dengan `appsscript.json` di repo ini.

### 2. Buat bot Telegram

1. Chat [@BotFather](https://t.me/BotFather) → `/newbot` → ikuti instruksinya.
2. Simpan token yang diberikan (bentuknya `123456789:AA...`).

### 3. Ambil Gemini API key

Buka <https://aistudio.google.com/apikey> → **Create API key** → salin.

### 4. Isi Script Properties

**Project Settings → Script Properties → Add script property.**
Ini satu-satunya tempat menyimpan rahasia — jangan pernah menulisnya di `Momon.gs`.

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
| `/sheet` | Tombol ke Google Sheet |
| `/kategori` | Daftar kategori yang berlaku |
| `/kantong` | Daftar kantong milikmu |
| `/id` | Tampilkan chat id (terbuka untuk siapa saja) |

**Teks bebas** tidak perlu perintah. Momon sendiri yang menebak maksudnya:
mencatat transaksi, menanyakan laporan, atau sekadar mengobrol.

### Contoh mencatat

```
kopi 25k pakai GoPay
gajian 5jt
kemarin beli buku 120k
bayar listrik 350rb dari Bank Jago
3 hari lalu grab ke kantor 28k
makan siang 45k jam 12:30
```

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

Sheet transaksi tiap akun memakai 7 kolom:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Tanggal Transaksi | Tipe | Kategori | Kantong | Nominal | Deskripsi | Dicatat Pada |

- **Tanggal Transaksi** — waktu efektif transaksi (boleh backdate).
- **Dicatat Pada** — waktu pesan masuk, tidak pernah backdate. Berguna untuk audit.

Sheet laporan ditulis ulang setiap kali laporan dibuat, berisi: ringkasan,
tabel per-kelompok dengan persentase, lalu rincian transaksi **lengkap**
(di Telegram rincian dibatasi 20 baris, di sheet tidak dipotong).

> Baris yang tanggalnya bukan Date atau nominalnya ≤ 0 otomatis dilewati,
> jadi aman kalau kamu menambahkan catatan manual di bawah data.

---

## ⚙️ Kustomisasi

Semua di bagian atas `Momon.gs`:

| Konstanta | Fungsi |
|---|---|
| `MOMON_TIMEZONE` | Zona waktu. **Harus sama** dengan `timeZone` di `appsscript.json` |
| `MOMON_MODEL` | Model Gemini yang dipakai |
| `MOMON_KOMENTAR_AI` | `false` untuk mematikan kalimat insight di akhir laporan (hemat 1 panggilan API) |
| `MOMON_MAKS_RINCIAN_CHAT` | Batas baris rincian di Telegram |
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

---

## 🔐 Keamanan

- **Jangan pernah** menulis token atau API key di `Momon.gs`. Semua rahasia hidup di
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

[Apache License 2.0](LICENSE) — Copyright 2026 Dhana.

Silakan dipakai, diubah, dikembangkan, bahkan dijual. Syaratnya:

- ✅ **Lampirkan sumbernya** — sertakan salinan [`LICENSE`](LICENSE) dan [`NOTICE`](NOTICE),
  serta pertahankan baris copyright di header `Momon.gs`.
- ✅ **Tandai perubahanmu** — beri keterangan pada file yang kamu ubah, supaya jelas
  mana yang karya asli dan mana hasil modifikasimu.
- ❌ **Tanpa garansi** — dipakai atas risiko sendiri. Ini menyangkut data keuanganmu,
  jadi periksa sendiri sebelum dipercaya penuh.
- ⚖️ Lisensi ini juga memberi **hibah paten** eksplisit dari kontributor ke pengguna.

Nama "Momon" dan isi README ikut lisensi yang sama; merek atau logo pihak lain
(Telegram, Google, Gemini) bukan bagian dari hibah ini.
