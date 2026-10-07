/**
 * ============================================================
 *  MOMON — Asisten Keuangan Pintar yang Ceria 🌟
 * ============================================================
 *  Fitur:
 *   1. Multi-akun Telegram (2 akun), tiap akun punya sheet sendiri.
 *   2. Laporan cerdas berbasis bahasa alami ("berapa jajanku minggu lalu?").
 *   3. Tombol "Buka di Google Sheet" untuk lihat laporan langsung di spreadsheet.
 *
 *  Panduan pemasangan lengkap ada di README.md.
 * ------------------------------------------------------------
 *  Momon — Asisten Keuangan Telegram
 *  Copyright (c) 2026 Dhana (abela-a)
 *
 *  Karya ini dilisensikan di bawah Creative Commons
 *  Attribution-NonCommercial-ShareAlike 4.0 International
 *  (CC BY-NC-SA 4.0).
 *
 *  Kamu BOLEH memakai, mengubah, dan menyebarkan ulang karya ini dengan
 *  syarat: mencantumkan atribusi ke pemilik di atas, menandai bagian yang
 *  kamu ubah, TIDAK memakainya untuk tujuan komersial, dan merilis karya
 *  turunanmu dengan lisensi yang sama.
 *
 *  Teks lengkap: berkas LICENSE
 *  https://creativecommons.org/licenses/by-nc-sa/4.0/
 *
 *  Disediakan APA ADANYA, tanpa jaminan apa pun.
 * ============================================================
 */

// ================= KONFIGURASI =================
//
// ⚠️ JANGAN menulis token atau API key di file ini — file ini masuk Git.
//
// Isi nilainya lewat: Apps Script > ⚙️ Project Settings > Script Properties
//   MOMON_BOT_TOKEN       token dari @BotFather
//   MOMON_GEMINI_API_KEY  key dari https://aistudio.google.com/apikey
//   MOMON_USERS           JSON daftar user (lihat MOMON_USERS_FALLBACK di bawah)
//   MOMON_WEBHOOK_URL     URL deployment Web App
//
// Konstanta FALLBACK di bawah sengaja dibiarkan kosong. Script Properties
// selalu menang kalau terisi. Jalankan momonCekKonfigurasi() untuk memeriksa.
const MOMON_BOT_TOKEN_FALLBACK = "";
const MOMON_GEMINI_API_KEY_FALLBACK = "";

// Daftar akun Telegram yang boleh memakai Momon — tiap akun punya sheet sendiri.
// Ini hanya CONTOH BENTUK DATA; isi aslinya taruh di Script Property MOMON_USERS
// supaya chat id pribadi tidak ikut ter-commit.
//
// Cara dapat chat id: kirim /id ke bot, Momon akan membalas id-nya.
const MOMON_USERS_FALLBACK = {
    CHAT_ID_AKUN_1: {
        nama: "Akun Pertama",
        sheet: "akun1",
        sheetLaporan: "akun1.report",
        kantong: ["Cash", "Bank Jago", "BSI", "GoPay", "Investasi/Tabungan"],
    },
    CHAT_ID_AKUN_2: {
        nama: "Akun Kedua",
        sheet: "akun2",
        sheetLaporan: "akun2.report",
        kantong: ["Cash", "Bank Jago", "BSI", "GoPay", "Investasi/Tabungan", "BCA"],
    },
};

// Harus sama dengan timeZone di appsscript.json.
const MOMON_TIMEZONE = "Asia/Makassar";
const MOMON_MODEL = "gemini-flash-lite-latest";
// Gambar & suara butuh model yang lebih kuat dari flash-lite, tapi tetap kelas flash.
const MOMON_MODEL_MEDIA = "gemini-flash-latest";

// Gemini sesekali membalas 429/500/503 saat modelnya lagi penuh — itu sementara,
// jadi dicoba ulang sebentar. Jangan dibesarkan: Telegram menganggap webhook
// gagal kalau balasannya kelamaan, lalu mengirim ulang update yang sama.
const MOMON_GEMINI_MAKS_PERCOBAAN = 3;

// Kalau true, Momon menambahkan satu kalimat insight ceria dari AI di akhir
// laporan. Angkanya TETAP dihitung oleh script (bukan AI), jadi selalu akurat.
const MOMON_KOMENTAR_AI = true;

// Maksimum baris rincian yang ditampilkan di Telegram.
// Rincian lengkapnya selalu ditulis utuh ke Google Sheet.
const MOMON_MAKS_RINCIAN_CHAT = 20;

// Berapa lama draft hasil gambar/suara menunggu konfirmasi sebelum hangus (detik).
const MOMON_PREVIEW_TTL_DETIK = 15 * 60;

// Batas ukuran berkas gambar/suara yang mau diproses (byte).
const MOMON_MAKS_UKURAN_FILE = 10 * 1024 * 1024;

// Daftar tertutup — AI wajib memilih persis dari daftar ini.
const MOMON_KATEGORI_PENGELUARAN = [
    "Makanan & Minuman",
    "Transportasi",
    "Belanja",
    "Tagihan & Utilitas",
    "Kesehatan",
    "Pendidikan",
    "Hiburan",
    "Perawatan Diri",
    "Rumah Tangga",
    "Sosial & Hadiah",
    "Investasi",
    "Cicilan/Utang",
    "Lainnya",
];
const MOMON_KATEGORI_PEMASUKAN = ["Gaji", "Bonus/THR", "Freelance/Usaha", "Investasi", "Hadiah", "Lainnya"];
const MOMON_KATEGORI_TRANSFER = "Transfer Antar Kantong";
const MOMON_KANTONG_DEFAULT = ["Cash", "Bank Jago", "Investasi", "GoPay", "BSI"];

// Kolom "ID" sengaja ditaruh paling kanan supaya sheet lama tidak perlu digeser.
// Isi kolomnya untuk baris lama dibuat sekali lewat momonIsiIdTransaksiLama().
const MOMON_HEADER = [
    "Tanggal Transaksi",
    "Tipe",
    "Kategori",
    "Kantong",
    "Nominal",
    "Deskripsi",
    "Dicatat Pada",
    "ID",
];
const MOMON_KOL_DICATAT = 7;
const MOMON_KOL_ID = 8;
// ===============================================

// ============================================================
//  KONFIG & USER
// ============================================================

function momonConfig() {
    const props = PropertiesService.getScriptProperties();
    return {
        BOT_TOKEN: props.getProperty("MOMON_BOT_TOKEN") || MOMON_BOT_TOKEN_FALLBACK,
        GEMINI_API_KEY: props.getProperty("MOMON_GEMINI_API_KEY") || MOMON_GEMINI_API_KEY_FALLBACK,
        WEBHOOK_URL: props.getProperty("MOMON_WEBHOOK_URL") || "",
    };
}

/** Peta chat id -> profil user. Script Property MOMON_USERS menang kalau ada. */
function momonDaftarUser() {
    const json = PropertiesService.getScriptProperties().getProperty("MOMON_USERS");
    if (json) {
        try {
            const parsed = JSON.parse(json);
            if (parsed && typeof parsed === "object") return parsed;
        } catch (err) {
            Logger.log("MOMON_USERS bukan JSON valid, pakai fallback: " + err);
        }
    }
    return MOMON_USERS_FALLBACK;
}

/** Ambil profil user (sudah dilengkapi default) atau null kalau tidak terdaftar. */
function momonUser(chatId) {
    const profil = momonDaftarUser()[String(chatId)];
    if (!profil) return null;

    const nama = String(profil.nama || "Teman").trim() || "Teman";
    return {
        chatId: String(chatId),
        nama: nama,
        sheet: String(profil.sheet || "Momon - " + nama),
        sheetLaporan: String(profil.sheetLaporan || "Laporan - " + nama),
        kantong:
            Array.isArray(profil.kantong) && profil.kantong.length
                ? profil.kantong.map(String)
                : MOMON_KANTONG_DEFAULT.slice(),
    };
}

/** Semua user terdaftar (dipakai sapaan pagi/malam lewat trigger).
 *  Entri contoh seperti "CHAT_ID_AKUN_1" otomatis diabaikan karena bukan angka. */
function momonSemuaUser() {
    return Object.keys(momonDaftarUser())
        .map(momonUser)
        .filter((u) => u && /^-?\d+$/.test(u.chatId));
}

// ============================================================
//  ENTRY POINT & ROUTING
// ============================================================

function momonTerimaUpdate(e) {
    try {
        if (!e || !e.postData) return;

        const update = JSON.parse(e.postData.contents);

        // Tombol konfirmasi (preview gambar/suara, konfirmasi hapus).
        if (update.callback_query) return momonTanganiCallback(update.callback_query);

        const pesan = update.message || update.edited_message;
        if (!pesan || !pesan.chat) return;

        const chatId = String(pesan.chat.id);
        // Caption hanya dianggap teks untuk FOTO. Lampiran jenis lain belum
        // didukung, dan captionnya tidak boleh diam-diam tercatat sebagai
        // transaksi lewat jalur teks biasa.
        const teks = String(pesan.text || (pesan.photo ? pesan.caption : "") || "").trim();
        const adaMedia = !!(pesan.photo || pesan.voice);
        const lampiranLain = !adaMedia && !!(pesan.document || pesan.audio || pesan.video);
        if (!teks && !adaMedia && !lampiranLain) return;

        // /id boleh dipakai siapa saja — ini cara mendaftarkan akun kedua.
        if (teks.toLowerCase().indexOf("/id") === 0) {
            momonKirim(
                chatId,
                [
                    "🪪 <b>Chat ID kamu:</b>",
                    `<pre><code>${momonEsc(chatId)}</code></pre>`,
                    "",
                    "Titipkan id ini ke pemilik bot ya, nanti Momon daftarkan ✨",
                ].join("\n"),
            );
            return;
        }

        const user = momonUser(chatId);
        if (!user) {
            momonKirim(
                chatId,
                [
                    "🙈 <b>Hai! Momon belum kenal kamu.</b>",
                    "",
                    "Chat ID kamu:",
                    `<pre><code>${momonEsc(chatId)}</code></pre>`,
                    "",
                    "Minta pemilik bot untuk mendaftarkan id ini dulu ya 💛",
                ].join("\n"),
            );
            return;
        }

        if (pesan.photo) return momonProsesFoto(user, pesan);
        if (pesan.voice) return momonProsesSuara(user, pesan);

        if (lampiranLain) {
            return momonKirim(
                chatId,
                [
                    "📎 <b>Momon belum bisa baca lampiran jenis ini.</b>",
                    "",
                    "Kalau itu struk, kirim sebagai <b>foto</b> ya (jangan sebagai file).",
                    "Kalau mau ngomong, pakai <b>voice note</b> 🎙️",
                ].join("\n"),
            );
        }

        if (!teks) return;
        momonRoute(user, teks);
    } catch (err) {
        Logger.log("Momon error: " + err + "\n" + (err && err.stack));
        try {
            const chatId = momonChatIdDariUpdate(JSON.parse(e.postData.contents));
            momonKirim(
                chatId,
                "😵 <b>Aduh, Momon kesandung error.</b>\n<pre><code>" +
                    momonEsc(String(err)) +
                    "</code></pre>\nCoba ulangi sebentar lagi ya!",
            );
        } catch (_) {
            /* jangan sampai error ganda */
        }
    }
}

/** Chat id dari bentuk update apa pun — dipakai saat melaporkan error. */
function momonChatIdDariUpdate(update) {
    const pesan = update.message || update.edited_message || (update.callback_query && update.callback_query.message);
    return pesan && pesan.chat ? pesan.chat.id : null;
}

function momonRoute(user, teks) {
    const lower = teks.toLowerCase();

    // Kalau user menekan "✏️ Edit" di preview, pesan teks berikutnya adalah koreksinya.
    if (teks.charAt(0) !== "/") {
        const pending = momonAmbilPending(user.chatId);
        if (pending && pending.menungguKoreksi) return momonTerapkanKoreksi(user, pending, teks);
    }

    if (lower === "/start" || lower === "/help" || lower.indexOf("/help") === 0) {
        return momonBantuan(user);
    }
    if (lower.indexOf("/saldo") === 0) return momonLaporanSaldo(user, teks.slice("/saldo".length).trim().length > 0);
    if (lower.indexOf("/sheet") === 0) return momonKirimLinkSheet(user);
    if (lower.indexOf("/kategori") === 0) return momonDaftarKategori(user);
    if (lower.indexOf("/kantong") === 0) return momonDaftarKantong(user);

    // /transfer <nominal> dari <kantong asal> ke <kantong tujuan>
    if (lower.indexOf("/transfer") === 0) {
        const kueri = teks.slice("/transfer".length).trim();
        if (!kueri) {
            return momonKirim(
                user.chatId,
                [
                    "🔄 <b>Transfer antar kantong</b>",
                    "Tulis seperti ini:",
                    "<pre><code>/transfer 100k dari Cash ke GoPay</code></pre>",
                ].join("\n"),
            );
        }
        const hasil = momonOtak(user, kueri, "transfer");
        if (hasil && hasil.gagal) return momonKirim(user.chatId, hasil.reply);
        return momonTransfer(user, hasil && hasil.transfer ? hasil.transfer : {});
    }

    // /edit <id> <koreksi bebas>
    if (lower.indexOf("/edit") === 0) return momonPerintahEdit(user, teks.slice("/edit".length).trim());

    // /hapus <id>
    if (lower.indexOf("/hapus") === 0) return momonPerintahHapus(user, teks.slice("/hapus".length).trim());

    if (lower.indexOf("/hari") === 0) return momonLaporanCepat(user, "hari ini");
    if (lower.indexOf("/minggu") === 0) return momonLaporanCepat(user, "minggu ini");
    if (lower.indexOf("/bulan") === 0) return momonLaporanCepat(user, "bulan ini");

    // /laporan <pertanyaan bebas>
    if (lower.indexOf("/laporan") === 0) {
        const kueri = teks.slice("/laporan".length).trim();
        return momonLaporanCepat(user, kueri || "bulan ini");
    }

    // Perintah tak dikenal
    if (teks.charAt(0) === "/") {
        return momonKirim(
            user.chatId,
            `🤔 Hmm, Momon belum punya perintah itu, ${momonEsc(user.nama)}.\nKetik /help untuk lihat daftarnya ya!`,
        );
    }

    // Teks bebas -> AI yang menentukan: transaksi / laporan / obrolan
    momonProsesTeksBebas(user, teks);
}

// ============================================================
//  OTAK AI — satu panggilan untuk niat + ekstraksi
// ============================================================

function momonProsesTeksBebas(user, teks) {
    const hasil = momonOtak(user, teks);

    if (!hasil) {
        return momonKirim(user.chatId, "😔 Maaf, otak Momon lagi ngadat. Coba lagi sebentar lagi ya!");
    }

    const intent = String(hasil.intent || "obrolan").toLowerCase();

    if (intent === "transaksi") return momonCatatTransaksi(user, hasil.transaksi);
    if (intent === "transfer") return momonTransfer(user, hasil.transfer);
    if (intent === "laporan") return momonSajikanLaporan(user, hasil.laporan, teks);

    momonKirim(
        user.chatId,
        hasil.reply || `Hehe, Momon kurang paham maksudnya, ${momonEsc(user.nama)}. Coba tulis ulang ya! 🌼`,
    );
}

/** Jalur cepat: langsung minta AI menyusun spesifikasi laporan dari kueri. */
function momonLaporanCepat(user, kueri) {
    const hasil = momonOtak(user, kueri, "laporan");
    if (hasil && hasil.gagal) {
        return momonKirim(user.chatId, hasil.reply);
    }
    momonSajikanLaporan(user, hasil && hasil.laporan ? hasil.laporan : {}, kueri);
}

/**
 * Satu panggilan Gemini. `paksaIntent` dipakai saat user sudah jelas
 * minta laporan (lewat /laporan, /bulan, dst) supaya AI tidak salah tebak.
 * `media` ({mimeType, data}) dipakai jalur suara: isi pesannya ada di audio,
 * bukan di teks.
 */
function momonOtak(user, teks, paksaIntent, media) {
    const config = momonConfig();
    const now = new Date();
    const hariIni = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");
    const labelHari = Utilities.formatDate(now, MOMON_TIMEZONE, "EEEE, d MMMM yyyy");
    const awalBulan = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-01");

    const aturanIntent = paksaIntent
        ? paksaIntent === "transfer"
            ? `Pesan ini SUDAH DIPASTIKAN permintaan transfer antar kantong. Set "intent": "transfer".`
            : `Pesan ini SUDAH DIPASTIKAN permintaan laporan. Set "intent": "laporan".`
        : `Tentukan "intent" dari pesan: "transaksi" (mencatat uang masuk/keluar), "transfer" (memindahkan saldo antar kantong milik sendiri, misal "pindah 100k dari Cash ke GoPay"), "laporan" (menanyakan/merekap data yang sudah tercatat), atau "obrolan" (sapaan, pertanyaan umum, curhat).`;

    const prompt = `Kamu adalah "Momon", asisten keuangan pribadi yang CERIA, hangat, dan suka menyemangati.
Kamu bicara dengan ${user.nama}. Gaya bahasa: santai, akrab, pakai emoji secukupnya (1-3 per balasan),
selalu menyemangati supaya rajin mencatat keuangan. Jangan menggurui, jangan panjang-panjang.

KONTEKS WAKTU:
- Hari ini: ${labelHari} (${hariIni}), zona waktu ${MOMON_TIMEZONE}.
- Awal bulan ini: ${awalBulan}.

${aturanIntent}

JIKA intent = "transaksi", isi array "transaksi" dengan SATU OBJECT PER TRANSAKSI.
Satu pesan bisa menyebut lebih dari satu transaksi sekaligus (dipisah "lalu", koma, baris baru, dst) —
pisahkan tiap transaksi jadi object tersendiri dalam array ini. Kalau cuma satu transaksi, array cukup
berisi satu object. Tiap object:
- "tipe": PERSIS "Pemasukan" atau "Pengeluaran".
- "kategori": PERSIS satu dari daftar sesuai tipe (dilarang mengarang):
  - Pengeluaran: ${JSON.stringify(MOMON_KATEGORI_PENGELUARAN)}
  - Pemasukan: ${JSON.stringify(MOMON_KATEGORI_PEMASUKAN)}
- "kantong": PERSIS satu dari ${JSON.stringify(user.kantong)}. Kalau tidak disebut, tebak paling masuk akal, kalau tidak ada petunjuk pakai "${user.kantong[0]}".
- "nominal": angka murni ("50k" -> 50000, "2jt" -> 2000000, "1.5jt" -> 1500000).
- "deskripsi": ringkasan singkat.
- "tanggal": ISO "YYYY-MM-DD". Hitung kata relatif ("kemarin", "3 hari lalu", "Senin kemarin") dari hari ini. Kalau tidak disebut, pakai ${hariIni}.
- "waktu": "HH:mm" HANYA kalau disebut eksplisit, selain itu "".

JIKA intent = "transfer", isi object "transfer":
- "dari": kantong asal, PERSIS satu dari ${JSON.stringify(user.kantong)}.
- "ke": kantong tujuan, PERSIS satu dari ${JSON.stringify(user.kantong)}, harus beda dari "dari".
- "nominal": angka murni ("50k" -> 50000, "2jt" -> 2000000, "1.5jt" -> 1500000).
- "deskripsi": ringkasan singkat kalau disebut, selain itu "".
- "tanggal": ISO "YYYY-MM-DD". Hitung kata relatif dari hari ini. Kalau tidak disebut, pakai ${hariIni}.
- "waktu": "HH:mm" HANYA kalau disebut eksplisit, selain itu "".

JIKA intent = "laporan", isi object "laporan" (ini dipakai untuk memfilter data, bukan untuk menghitung — jangan mengarang angka):
- "judul": judul pendek laporan, contoh "Pengeluaran Makanan Bulan Ini".
- "dari" dan "sampai": rentang tanggal ISO "YYYY-MM-DD" (inklusif). Terjemahkan "minggu lalu", "bulan ini", "3 bulan terakhir", "Januari", dsb. Kalau pesan tidak menyebut waktu sama sekali, pakai "${awalBulan}" sampai "${hariIni}".
- "tipe": "Pemasukan", "Pengeluaran", atau "Semua".
- "kategori": array kategori dari daftar di atas yang diminta, atau [] kalau semua.
- "kantong": array kantong dari ${JSON.stringify(user.kantong)}, atau [] kalau semua.
- "kata_kunci": kata yang harus ada di deskripsi, atau "".
- "min_nominal" / "max_nominal": angka, 0 kalau tidak dibatasi.
- "kelompok": PERSIS satu dari ["kategori","kantong","hari","bulan","tipe","tidak"] — pilih pengelompokan paling menjawab pertanyaan.
- "urut": PERSIS satu dari ["nominal_desc","nominal_asc","tanggal_desc","tanggal_asc"].
- "limit": jumlah baris rincian yang diminta (contoh "5 pengeluaran terbesar" -> 5), 0 kalau tidak disebut.
- "rincian": true kalau user kemungkinan ingin melihat daftar transaksinya, false kalau cukup ringkasan.

"reply" diisi HANYA kalau intent = "obrolan" (balasan ceria dan singkat). Selain itu kosongkan.

${
    media
        ? `Pesan ${user.nama} dikirim sebagai REKAMAN SUARA yang terlampir. Dengarkan rekamannya,
tulis hasil transkripnya apa adanya ke "transkrip", lalu proses isinya seperti pesan teks biasa.
Kalau suaranya tidak terdengar jelas, set "intent": "obrolan" dan jelaskan di "reply".`
        : `Pesan ${user.nama}: "${teks}"`
}

Jawab HANYA JSON murni, tanpa markdown, tanpa teks lain:
{"intent":"obrolan","transkrip":"","transaksi":[{"tipe":"","kategori":"","kantong":"","nominal":0,"deskripsi":"","tanggal":"","waktu":""}],"transfer":{"dari":"","ke":"","nominal":0,"deskripsi":"","tanggal":"","waktu":""},"laporan":{"judul":"","dari":"","sampai":"","tipe":"Semua","kategori":[],"kantong":[],"kata_kunci":"","min_nominal":0,"max_nominal":0,"kelompok":"kategori","urut":"nominal_desc","limit":0,"rincian":true},"reply":""}`;

    const jawaban = momonPanggilGemini(config, prompt, 0.2, media ? { media: media, model: MOMON_MODEL_MEDIA } : null);
    if (!jawaban.ok) {
        return { intent: "obrolan", gagal: true, reply: jawaban.pesan };
    }
    if (paksaIntent) jawaban.data.intent = paksaIntent;
    return jawaban.data;
}

/**
 * Panggilan Gemini generik. Mengembalikan {ok, data} atau {ok:false, pesan}.
 * `opsi.media` ({mimeType, data-base64}) menempelkan gambar/suara ke prompt,
 * `opsi.model` menimpa model default.
 */
function momonPanggilGemini(config, prompt, suhu, opsi) {
    opsi = opsi || {};
    const model = opsi.model || MOMON_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`;

    const parts = [{ text: prompt }];
    if (opsi.media) parts.push({ inlineData: { mimeType: opsi.media.mimeType, data: opsi.media.data } });

    const payload = {
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json", temperature: suhu },
    };

    const permintaan = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
    };

    let res = null;
    for (let percobaan = 1; percobaan <= MOMON_GEMINI_MAKS_PERCOBAAN; percobaan++) {
        try {
            res = UrlFetchApp.fetch(url, permintaan);
        } catch (err) {
            Logger.log("Gagal menghubungi Gemini: " + err);
            return { ok: false, pesan: "📡 Momon lagi susah sinyal ke layanan AI. Coba lagi sebentar lagi ya!" };
        }

        const kode = res.getResponseCode();
        if (kode === 200) break;

        // 429 kena rate limit, 500/503 modelnya lagi penuh — ketiganya sementara.
        const sementara = kode === 429 || kode === 500 || kode === 503;
        Logger.log(`Gemini HTTP ${kode} (percobaan ${percobaan}): ` + res.getContentText());

        if (!sementara || percobaan === MOMON_GEMINI_MAKS_PERCOBAAN) {
            return {
                ok: false,
                pesan: sementara
                    ? "😵‍💫 <b>Layanan AI-nya lagi penuh.</b>\nIni dari sananya, bukan catatanmu — tunggu sebentar lalu kirim ulang ya!"
                    : `😣 Layanan AI lagi rewel (HTTP ${kode}). Coba lagi nanti ya!`,
            };
        }

        Utilities.sleep(700 * percobaan);
    }

    let body;
    try {
        body = JSON.parse(res.getContentText());
    } catch (err) {
        Logger.log("Response Gemini tidak bisa diparse: " + res.getContentText());
        return { ok: false, pesan: "😵 Balasan AI-nya aneh, Momon tidak bisa baca. Coba ulangi ya!" };
    }

    if (body.error) {
        Logger.log("Gemini API error: " + JSON.stringify(body.error));
        return { ok: false, pesan: "😔 Ada kendala di layanan AI. Mohon coba beberapa saat lagi!" };
    }

    try {
        let teks = body.candidates[0].content.parts[0].text;
        teks = teks
            .replace(/```json/gi, "")
            .replace(/```/gi, "")
            .trim();
        return { ok: true, data: JSON.parse(teks) };
    } catch (err) {
        Logger.log("Gagal parse JSON hasil Gemini: " + JSON.stringify(body));
        return {
            ok: false,
            pesan: "🙃 Momon bingung baca jawaban AI-nya. Coba tulis dengan kalimat lebih sederhana ya!",
        };
    }
}

// ============================================================
//  PENCATATAN TRANSAKSI
// ============================================================

/** `daftarRaw` biasanya array (AI bisa mengirim beberapa transaksi dari satu pesan),
 *  tapi tetap menerima object tunggal untuk jaga-jaga kalau AI lupa membungkusnya. */
function momonCatatTransaksi(user, daftarRaw) {
    const hasil = momonSimpanTransaksi(user, daftarRaw);

    if (hasil.kosong) {
        return momonKirim(
            user.chatId,
            [
                "🤏 <b>Transaksinya belum kebaca nih!</b>",
                "Coba tulis angkanya, contoh:",
                "<pre><code>jajan 50k</code></pre>",
            ].join("\n"),
        );
    }

    momonKirim(
        user.chatId,
        momonRenderHasilTransaksi(user, hasil.berhasil, hasil.gagal, hasil.now),
        hasil.berhasil.length
            ? { tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(hasil.sheet) } }
            : undefined,
    );
}

/**
 * Validasi + tulis transaksi ke sheet, TANPA mengirim pesan apa pun.
 * Semua jalur penulisan (teks bebas, konfirmasi gambar/suara) wajib lewat sini
 * supaya kantong & nominal selalu divalidasi terhadap daftar tertutup user.
 */
function momonSimpanTransaksi(user, daftarRaw) {
    const daftar = (Array.isArray(daftarRaw) ? daftarRaw : [daftarRaw]).filter((r) => r && typeof r === "object");
    if (!daftar.length) return { kosong: true, berhasil: [], gagal: [], now: new Date(), sheet: null };

    const sheet = momonSheetData(user);
    const now = new Date();
    const berhasil = [];
    const gagal = [];
    const barisBaru = [];

    daftar.forEach((raw, i) => {
        const hasil = momonValidasiTransaksi(user, raw);
        if (!hasil.ok) {
            gagal.push(`#${i + 1} ${hasil.alasan}`);
            return;
        }

        barisBaru.push([hasil.tanggal, hasil.tipe, hasil.kategori, hasil.kantong, hasil.nominal, hasil.deskripsi, now]);
        berhasil.push(hasil);
    });

    const ids = momonTambahBaris(sheet, barisBaru);
    berhasil.forEach((t, i) => (t.id = ids[i]));

    return { kosong: false, berhasil: berhasil, gagal: gagal, now: now, sheet: sheet };
}

/**
 * SATU-SATUNYA tempat nilai hasil AI diadu dengan daftar tertutup milik user.
 * Kantong & nominal divalidasi ketat (ditolak kalau tidak cocok); tipe, kategori,
 * dan tanggal dirapikan longgar lewat momonLengkapiTransaksi.
 *
 * Semua jalur yang menulis transaksi ke sheet — teks bebas, konfirmasi foto/suara,
 * dan /edit — WAJIB lewat sini. Jangan menambah jalur tulis yang memakai nilai
 * mentah dari AI tanpa memanggil fungsi ini.
 */
function momonValidasiTransaksi(user, raw) {
    if (!raw || typeof raw !== "object") return { ok: false, alasan: "transaksinya belum kebaca" };

    if (!raw.nominal || isNaN(raw.nominal) || Number(raw.nominal) <= 0) {
        return { ok: false, alasan: "nominalnya belum kebaca" };
    }

    const kantongInput = String(raw.kantong || "").trim();
    const kantong = user.kantong.find((k) => k.toLowerCase() === kantongInput.toLowerCase());
    if (!kantong) {
        return { ok: false, alasan: `kantong "${momonEsc(kantongInput || "-")}" belum terdaftar` };
    }

    const t = momonLengkapiTransaksi(raw);
    return {
        ok: true,
        tipe: t.tipe,
        kategori: t.kategori,
        kantong: kantong,
        nominal: Number(raw.nominal),
        deskripsi: t.deskripsi,
        tanggal: t.tanggal,
        peringatan: t.peringatan,
    };
}

/** Rangkum hasil pencatatan satu atau banyak transaksi jadi satu pesan balasan. */
function momonRenderHasilTransaksi(user, berhasil, gagal, now) {
    const baris = [];

    if (berhasil.length === 1 && !gagal.length) {
        const t = berhasil[0];
        const icon = t.tipe === "Pemasukan" ? "🟢" : "🔴";
        const backdate =
            Utilities.formatDate(t.tanggal, MOMON_TIMEZONE, "yyyy-MM-dd") !==
            Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");

        baris.push(`✅ <b>Sip, dicatat ya ${momonEsc(user.nama)}!</b> ${momonSemangat()}`);
        baris.push("");
        baris.push(`${icon} ${t.tipe} <b>Rp ${momonRupiah(t.nominal)}</b> — <i>${momonEsc(t.deskripsi)}</i>`);
        baris.push(`📂 Kategori: ${momonEsc(t.kategori)}`);
        baris.push(`💼 Kantong: ${momonEsc(t.kantong)}`);
        baris.push(
            `🗓️ ${Utilities.formatDate(t.tanggal, MOMON_TIMEZONE, "d MMMM yyyy, HH:mm")}${backdate ? " (backdate)" : ""}`,
        );
        baris.push(`🆔 <code>#${t.id}</code> — salah? <code>/edit ${t.id} ...</code> atau <code>/hapus ${t.id}</code>`);
        if (t.peringatan.length) {
            baris.push("");
            baris.push("⚠️ " + t.peringatan.join(" "));
        }
        return baris.join("\n");
    }

    if (berhasil.length) {
        baris.push(`✅ <b>${berhasil.length} transaksi dicatat ya ${momonEsc(user.nama)}!</b> ${momonSemangat()}`);
        baris.push("");
        let totalMasuk = 0;
        let totalKeluar = 0;
        berhasil.forEach((t) => {
            const icon = t.tipe === "Pemasukan" ? "🟢" : "🔴";
            if (t.tipe === "Pemasukan") totalMasuk += t.nominal;
            else totalKeluar += t.nominal;
            const backdate =
                Utilities.formatDate(t.tanggal, MOMON_TIMEZONE, "yyyy-MM-dd") !==
                Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");
            baris.push(
                `${icon} <code>#${t.id}</code> Rp ${momonRupiah(t.nominal)} — <i>${momonEsc(t.deskripsi)}</i> <i>(${momonEsc(t.kategori)} · ${momonEsc(t.kantong)}${backdate ? ", backdate" : ""})</i>`,
            );
            if (t.peringatan.length) baris.push(`   ⚠️ ${momonEsc(t.peringatan.join(" "))}`);
        });
        baris.push("");
        if (totalMasuk) baris.push(`🟢 Total masuk: <b>Rp ${momonRupiah(totalMasuk)}</b>`);
        if (totalKeluar) baris.push(`🔴 Total keluar: <b>Rp ${momonRupiah(totalKeluar)}</b>`);
    }

    if (gagal.length) {
        if (berhasil.length) baris.push("");
        baris.push(`⚠️ <b>${gagal.length} transaksi tidak tercatat:</b>`);
        gagal.forEach((g) => baris.push(`• ${g}`));
    }

    if (!berhasil.length && !gagal.length) {
        baris.push(`🤷 Nggak ada transaksi yang kebaca, ${momonEsc(user.nama)}.`);
    }

    return baris.join("\n");
}

/**
 * Lengkapi tipe/kategori/tanggal/deskripsi secara longgar — ini yang "dibantu AI":
 * kalau hasil ekstraksi AI meleset, Momon merapikan ke nilai yang masuk akal
 * (bukan menolak) dan mencatat penyesuaiannya di `peringatan`. Hanya kantong
 * & nominal yang divalidasi ketat (ditangani terpisah di momonValidasiTransaksi).
 */
function momonLengkapiTransaksi(raw) {
    const peringatan = [];

    const tipeRaw = String(raw.tipe || "").toLowerCase();
    const tipe = tipeRaw.indexOf("masuk") >= 0 || tipeRaw.indexOf("income") >= 0 ? "Pemasukan" : "Pengeluaran";

    const daftarKategori = tipe === "Pemasukan" ? MOMON_KATEGORI_PEMASUKAN : MOMON_KATEGORI_PENGELUARAN;
    const kategoriInput = String(raw.kategori || "").trim();
    let kategori = daftarKategori.find((k) => k.toLowerCase() === kategoriInput.toLowerCase());
    if (!kategori) {
        kategori = "Lainnya";
        if (kategoriInput)
            peringatan.push(`Kategori "${kategoriInput}" belum terdaftar, Momon catat sebagai "Lainnya".`);
    }

    const tanggal = momonResolveTanggalWaktu(raw, peringatan);

    return {
        tipe: tipe,
        kategori: kategori,
        deskripsi: String(raw.deskripsi || "-").trim() || "-",
        tanggal: tanggal,
        peringatan: peringatan,
    };
}

/** Gabungkan tanggal & jam dari input AI jadi satu Date; tiap penyesuaian dicatat ke `peringatan`. */
function momonResolveTanggalWaktu(raw, peringatan) {
    // Tanggal: boleh backdate, tapi tidak boleh di masa depan.
    const now = new Date();
    const hariIni = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");
    let tanggalStr = hariIni;
    const tanggalInput = String(raw.tanggal || "").trim();
    if (tanggalInput) {
        const parsed = momonParseTanggalISO(tanggalInput);
        if (!parsed) {
            peringatan.push(`Tanggal "${tanggalInput}" tidak valid, Momon pakai hari ini.`);
        } else {
            const parsedStr = Utilities.formatDate(parsed, MOMON_TIMEZONE, "yyyy-MM-dd");
            if (parsedStr > hariIni)
                peringatan.push(`Tanggal "${tanggalInput}" ada di masa depan, Momon pakai hari ini.`);
            else tanggalStr = parsedStr;
        }
    }

    // Jam: pakai yang disebut eksplisit, kalau tidak pakai waktu sekarang.
    let jamMenit = Utilities.formatDate(now, MOMON_TIMEZONE, "HH:mm");
    const waktuInput = String(raw.waktu || "").trim();
    if (waktuInput) {
        const m = waktuInput.match(/^(\d{1,2}):(\d{2})$/);
        const jam = m ? Number(m[1]) : -1;
        const menit = m ? Number(m[2]) : -1;
        if (jam >= 0 && jam <= 23 && menit >= 0 && menit <= 59) {
            jamMenit = String(jam).padStart(2, "0") + ":" + String(menit).padStart(2, "0");
        } else {
            peringatan.push(`Jam "${waktuInput}" tidak valid, Momon pakai jam sekarang.`);
        }
    }

    try {
        const tanggal = Utilities.parseDate(`${tanggalStr} ${jamMenit}:00`, MOMON_TIMEZONE, "yyyy-MM-dd HH:mm:ss");
        if (isNaN(tanggal.getTime())) throw new Error("invalid");
        return tanggal;
    } catch (err) {
        peringatan.push("Gagal menyusun tanggal & jam, Momon catat sebagai waktu sekarang.");
        return now;
    }
}

/**
 * Transfer antar kantong milik user sendiri — dicatat sebagai sepasang baris
 * bertipe "Transfer" (bukan Pemasukan/Pengeluaran) di kantong asal & tujuan,
 * supaya tidak ikut terhitung sebagai uang masuk/keluar betulan dan tidak
 * mengubah saldo total (hanya berpindah antar kantong). Arahnya (keluar/masuk)
 * ditandai lewat awalan deskripsi "Transfer ke "/"Transfer dari ", lihat
 * momonTransferMasuk().
 */
function momonTransfer(user, raw) {
    const hasil = momonSimpanTransfer(user, raw);
    if (!hasil.ok) return momonKirim(user.chatId, hasil.pesan);

    momonKirim(user.chatId, hasil.pesan, {
        tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(hasil.sheet) },
    });
}

/**
 * Validasi + tulis sepasang baris transfer, TANPA mengirim pesan.
 * Mengembalikan {ok, pesan, sheet, ids}.
 */
function momonSimpanTransfer(user, raw) {
    raw = raw || {};

    if (!raw.nominal || isNaN(raw.nominal) || Number(raw.nominal) <= 0) {
        return {
            ok: false,
            pesan: [
                "🤏 <b>Nominalnya belum kebaca nih!</b>",
                "Coba tulis seperti ini, contoh:",
                "<pre><code>pindah 100k dari Cash ke GoPay</code></pre>",
            ].join("\n"),
        };
    }

    const dariInput = String(raw.dari || "").trim();
    const keInput = String(raw.ke || "").trim();
    const dari = user.kantong.find((k) => k.toLowerCase() === dariInput.toLowerCase());
    const ke = user.kantong.find((k) => k.toLowerCase() === keInput.toLowerCase());

    if (!dari || !ke) {
        return {
            ok: false,
            pesan: [
                "🙈 <b>Kantong asal/tujuannya belum ketemu nih.</b>",
                `Kantong yang Momon kenal: ${user.kantong.map((k) => momonEsc(k)).join(", ")}.`,
                "Coba sebutkan lagi, contoh:",
                `<pre><code>pindah 100k dari ${momonEsc(user.kantong[0])} ke ${momonEsc(
                    user.kantong[1] || user.kantong[0],
                )}</code></pre>`,
            ].join("\n"),
        };
    }

    if (dari.toLowerCase() === ke.toLowerCase()) {
        return { ok: false, pesan: "🙃 Kantong asal dan tujuan sama, nggak ada yang perlu dipindah dong!" };
    }

    const peringatan = [];
    const tanggal = momonResolveTanggalWaktu(raw, peringatan);
    const nominal = Number(raw.nominal);
    const deskripsi = String(raw.deskripsi || "").trim();
    const catatanDari = "Transfer ke " + ke + (deskripsi ? ": " + deskripsi : "");
    const catatanKe = "Transfer dari " + dari + (deskripsi ? ": " + deskripsi : "");

    const sheet = momonSheetData(user);
    const now = new Date();
    const ids = momonTambahBaris(sheet, [
        [tanggal, "Transfer", MOMON_KATEGORI_TRANSFER, dari, nominal, catatanDari, now],
        [tanggal, "Transfer", MOMON_KATEGORI_TRANSFER, ke, nominal, catatanKe, now],
    ]);

    const backdate =
        Utilities.formatDate(tanggal, MOMON_TIMEZONE, "yyyy-MM-dd") !==
        Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");

    const baris = [];
    baris.push(`✅ <b>Sip, transfer dicatat ya ${momonEsc(user.nama)}!</b> ${momonSemangat()}`);
    baris.push("");
    baris.push(
        `🔄 Rp <b>${momonRupiah(nominal)}</b> dipindah dari <b>${momonEsc(dari)}</b> ke <b>${momonEsc(ke)}</b>`,
    );
    if (deskripsi) baris.push(`📝 ${momonEsc(deskripsi)}`);
    baris.push(
        `🗓️ ${Utilities.formatDate(tanggal, MOMON_TIMEZONE, "d MMMM yyyy, HH:mm")}${backdate ? " (backdate)" : ""}`,
    );
    baris.push(`🆔 <code>#${ids[0]}</code> & <code>#${ids[1]}</code> — batal? <code>/hapus ${ids[0]}</code>`);
    if (peringatan.length) {
        baris.push("");
        baris.push("⚠️ " + peringatan.join(" "));
    }

    return { ok: true, pesan: baris.join("\n"), sheet: sheet, ids: ids };
}

// ============================================================
//  INPUT GAMBAR & SUARA
// ============================================================

/**
 * Foto diperlakukan sebagai struk: AI membaca isinya, caption (kalau ada)
 * dipakai sebagai konteks tambahan. Hasilnya TIDAK langsung disimpan —
 * selalu lewat preview + konfirmasi.
 */
function momonProsesFoto(user, pesan) {
    // Dibuang di awal: begitu ada kiriman baru, draft lama tidak boleh bisa
    // disimpan lagi lewat tombolnya — termasuk kalau pembacaan ini gagal.
    momonHapusPending(user.chatId);
    const messageId = momonKirim(user.chatId, "🧾 <b>Momon lagi baca strukmu…</b> sebentar ya!");

    const foto = pesan.photo[pesan.photo.length - 1]; // ukuran terbesar
    const berkas = momonUnduhFileTelegram(foto.file_id, "image/jpeg");
    if (!berkas.ok) return momonEditPesan(user.chatId, messageId, berkas.pesan);

    const caption = String(pesan.caption || "").trim();
    const hasil = momonOtakGambar(user, caption, berkas.media);
    if (!hasil || hasil.gagal) {
        return momonEditPesan(user.chatId, messageId, (hasil && hasil.reply) || "😔 Momon gagal membaca gambarnya.");
    }

    const intent = String(hasil.intent || "transaksi").toLowerCase();
    const daftar = Array.isArray(hasil.transaksi) ? hasil.transaksi.filter((t) => t && typeof t === "object") : [];

    if (intent === "transfer" && hasil.transfer) {
        return momonTampilkanPreview(user, {
            jenis: "transfer",
            sumber: "gambar",
            messageId: messageId,
            transfer: hasil.transfer,
        });
    }

    if (!daftar.length) {
        return momonEditPesan(
            user.chatId,
            messageId,
            [
                "🤔 <b>Momon belum menemukan transaksi di gambar ini.</b>",
                "",
                "Pastikan nominalnya kebaca ya. Boleh juga tulis manual:",
                "<pre><code>belanja 150k pakai BCA</code></pre>",
            ].join("\n"),
        );
    }

    momonTampilkanPreview(user, {
        jenis: "transaksi",
        sumber: "gambar",
        messageId: messageId,
        transaksi: daftar,
    });
}

/**
 * Voice note = "ngomong, bukan ngetik": hasil transkrip diproses lewat otak yang
 * sama dengan teks bebas, jadi bisa jadi transaksi, transfer, ATAU laporan.
 * Yang menulis ke sheet (transaksi/transfer) lewat preview dulu; laporan &
 * obrolan tidak perlu dikonfirmasi karena tidak mengubah data apa pun.
 */
function momonProsesSuara(user, pesan) {
    momonHapusPending(user.chatId); // lihat alasannya di momonProsesFoto
    const messageId = momonKirim(user.chatId, "🎙️ <b>Momon lagi dengerin…</b> sebentar ya!");

    const berkas = momonUnduhFileTelegram(pesan.voice.file_id, pesan.voice.mime_type || "audio/ogg");
    if (!berkas.ok) return momonEditPesan(user.chatId, messageId, berkas.pesan);

    const hasil = momonOtak(user, "", null, berkas.media);
    if (!hasil || hasil.gagal) {
        return momonEditPesan(user.chatId, messageId, (hasil && hasil.reply) || "😔 Momon gagal mendengar suaranya.");
    }

    const transkrip = String(hasil.transkrip || "").trim();
    const intent = String(hasil.intent || "obrolan").toLowerCase();

    if (intent === "transaksi" || intent === "transfer") {
        const daftar = Array.isArray(hasil.transaksi) ? hasil.transaksi.filter((t) => t && typeof t === "object") : [];
        if (intent === "transfer" && hasil.transfer) {
            return momonTampilkanPreview(user, {
                jenis: "transfer",
                sumber: "suara",
                messageId: messageId,
                transkrip: transkrip,
                transfer: hasil.transfer,
            });
        }
        if (daftar.length) {
            return momonTampilkanPreview(user, {
                jenis: "transaksi",
                sumber: "suara",
                messageId: messageId,
                transkrip: transkrip,
                transaksi: daftar,
            });
        }
    }

    // Laporan & obrolan: tidak menulis apa pun, jadi langsung dijalankan.
    momonEditPesan(
        user.chatId,
        messageId,
        transkrip ? `🎙️ <b>Momon dengar:</b>\n<i>"${momonEsc(transkrip)}"</i>` : "🎙️ <b>Momon dengar pesanmu.</b>",
    );

    if (intent === "laporan") return momonSajikanLaporan(user, hasil.laporan, transkrip);
    momonKirim(user.chatId, hasil.reply || `Hehe, Momon kurang nangkep maksudnya, ${momonEsc(user.nama)} 🌼`);
}

/** Prompt khusus struk — sengaja dibatasi ke transaksi/transfer saja. */
function momonOtakGambar(user, caption, media) {
    const config = momonConfig();
    const now = new Date();
    const hariIni = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");
    const labelHari = Utilities.formatDate(now, MOMON_TIMEZONE, "EEEE, d MMMM yyyy");

    const prompt = `Kamu adalah "Momon", asisten keuangan pribadi milik ${user.nama}.
Gambar terlampir adalah STRUK / BUKTI TRANSAKSI. Baca isinya dengan teliti.

KONTEKS WAKTU:
- Hari ini: ${labelHari} (${hariIni}), zona waktu ${MOMON_TIMEZONE}.

${caption ? `Catatan tambahan dari ${user.nama} (prioritaskan ini kalau bentrok dengan gambar): "${caption}"` : "Tidak ada catatan tambahan."}

Set "intent": "transfer" HANYA kalau buktinya jelas pemindahan saldo antar kantong milik sendiri.
Selain itu set "intent": "transaksi".

JIKA intent = "transaksi", isi array "transaksi":
- Kalau semua item di struk masuk SATU kategori yang sama, cukup buat SATU object memakai nilai TOTAL struk.
- Kalau item-itemnya jatuh ke kategori yang BERBEDA, pisahkan jadi beberapa object sesuai kategorinya.
- Jangan pernah membuat object yang nominalnya menggandakan total struk.
Tiap object:
- "tipe": PERSIS "Pemasukan" atau "Pengeluaran" (struk belanja = "Pengeluaran").
- "kategori": PERSIS satu dari daftar sesuai tipe (dilarang mengarang):
  - Pengeluaran: ${JSON.stringify(MOMON_KATEGORI_PENGELUARAN)}
  - Pemasukan: ${JSON.stringify(MOMON_KATEGORI_PEMASUKAN)}
- "kantong": PERSIS satu dari ${JSON.stringify(user.kantong)}. Pakai petunjuk metode bayar di struk (misal "QRIS GoPay", "Debit BCA"). Kalau tidak ada petunjuk sama sekali, pakai "${user.kantong[0]}".
- "nominal": angka murni tanpa titik/koma (TOTAL yang benar-benar dibayar, bukan subtotal sebelum diskon).
- "deskripsi": ringkas, sebutkan nama toko/merchant kalau terbaca.
- "tanggal": ISO "YYYY-MM-DD" dari struk. Kalau tidak terbaca, pakai ${hariIni}.
- "waktu": "HH:mm" kalau terbaca di struk, selain itu "".

JIKA intent = "transfer", isi object "transfer":
- "dari" dan "ke": PERSIS dari ${JSON.stringify(user.kantong)}, harus berbeda.
- "nominal": angka murni.
- "deskripsi": ringkasan singkat.
- "tanggal": ISO "YYYY-MM-DD", "waktu": "HH:mm" atau "".

Kalau gambar sama sekali bukan struk atau nominalnya tidak terbaca, kembalikan "transaksi": [].

Jawab HANYA JSON murni, tanpa markdown, tanpa teks lain:
{"intent":"transaksi","transaksi":[{"tipe":"","kategori":"","kantong":"","nominal":0,"deskripsi":"","tanggal":"","waktu":""}],"transfer":{"dari":"","ke":"","nominal":0,"deskripsi":"","tanggal":"","waktu":""}}`;

    const jawaban = momonPanggilGemini(config, prompt, 0.2, { media: media, model: MOMON_MODEL_MEDIA });
    if (!jawaban.ok) return { gagal: true, reply: jawaban.pesan };
    return jawaban.data;
}

/** Ambil berkas Telegram jadi {mimeType, data-base64} siap tempel ke Gemini. */
function momonUnduhFileTelegram(fileId, mimeDefault) {
    const config = momonConfig();

    let info;
    try {
        const res = UrlFetchApp.fetch(
            `https://api.telegram.org/bot${config.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
            { muteHttpExceptions: true },
        );
        info = JSON.parse(res.getContentText());
    } catch (err) {
        Logger.log("getFile gagal: " + err);
        return { ok: false, pesan: "📡 Momon gagal mengambil berkasnya dari Telegram. Coba kirim ulang ya!" };
    }

    if (!info || !info.ok || !info.result || !info.result.file_path) {
        Logger.log("getFile ditolak: " + JSON.stringify(info));
        return { ok: false, pesan: "🙈 Berkasnya tidak bisa Momon ambil. Coba kirim ulang ya!" };
    }

    if (Number(info.result.file_size) > MOMON_MAKS_UKURAN_FILE) {
        return {
            ok: false,
            pesan: `📦 Berkasnya kebesaran (maksimal ${Math.round(MOMON_MAKS_UKURAN_FILE / 1024 / 1024)} MB). Coba kirim versi yang lebih kecil ya!`,
        };
    }

    try {
        const res = UrlFetchApp.fetch(
            `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${info.result.file_path}`,
            { muteHttpExceptions: true },
        );
        if (res.getResponseCode() !== 200) {
            Logger.log("Unduh berkas HTTP " + res.getResponseCode());
            return { ok: false, pesan: "📡 Momon gagal mengunduh berkasnya. Coba kirim ulang ya!" };
        }
        const blob = res.getBlob();
        const tipe = blob.getContentType();
        return {
            ok: true,
            media: {
                mimeType: tipe && tipe !== "application/octet-stream" ? tipe : mimeDefault,
                data: Utilities.base64Encode(blob.getBytes()),
            },
        };
    } catch (err) {
        Logger.log("Unduh berkas gagal: " + err);
        return { ok: false, pesan: "📡 Momon gagal mengunduh berkasnya. Coba kirim ulang ya!" };
    }
}

// ============================================================
//  PREVIEW & KONFIRMASI
// ============================================================

function momonKunciPending(chatId) {
    return "momon_pending_" + chatId;
}

/** Hanya ada SATU draft menunggu konfirmasi per chat — draft baru menimpa yang lama. */
function momonSimpanPending(chatId, pending) {
    CacheService.getScriptCache().put(momonKunciPending(chatId), JSON.stringify(pending), MOMON_PREVIEW_TTL_DETIK);
}

function momonAmbilPending(chatId) {
    const raw = CacheService.getScriptCache().get(momonKunciPending(chatId));
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

function momonHapusPending(chatId) {
    CacheService.getScriptCache().remove(momonKunciPending(chatId));
}

/**
 * Tampilkan draft terbaru lalu simpan drafnya. Kalau draft ini sudah punya pesan
 * sendiri (misal pesan "sedang diproses"), pesan itu yang ditulis ulang.
 */
function momonTampilkanPreview(user, pending) {
    const teks = momonRenderPreview(user, pending);
    const opsi = { tombolAksi: momonTombolPreview(pending) };

    if (pending.messageId) momonEditPesan(user.chatId, pending.messageId, teks, opsi);
    else pending.messageId = momonKirim(user.chatId, teks, opsi);

    momonSimpanPending(user.chatId, pending);
}

function momonTombolPreview(pending) {
    if (pending.jenis === "hapus") {
        return [
            [
                { teks: "🗑️ Ya, hapus", aksi: "hapus_ya" },
                { teks: "❌ Batal", aksi: "batal" },
            ],
        ];
    }
    if (pending.menungguKoreksi) {
        return [
            [
                { teks: "✅ Simpan apa adanya", aksi: "simpan" },
                { teks: "❌ Batal", aksi: "batal" },
            ],
        ];
    }
    return [
        [
            { teks: "✅ Simpan", aksi: "simpan" },
            { teks: "✏️ Edit", aksi: "koreksi" },
            { teks: "❌ Batal", aksi: "batal" },
        ],
    ];
}

function momonRenderPreview(user, pending) {
    const baris = [];

    if (pending.jenis === "hapus") {
        baris.push("🗑️ <b>Yakin mau hapus transaksi ini?</b>");
        baris.push("");
        baris.push(pending.ringkasan);
        baris.push("");
        baris.push("<i>Sekali dihapus tidak bisa dikembalikan ya.</i>");
        return baris.join("\n");
    }

    baris.push(
        `${pending.sumber === "suara" ? "🎙️" : "🧾"} <b>Momon baca ini — cek dulu ya ${momonEsc(user.nama)}!</b>`,
    );
    if (pending.transkrip) {
        baris.push("");
        baris.push(`<i>"${momonEsc(pending.transkrip)}"</i>`);
    }
    baris.push("");

    if (pending.jenis === "transfer") {
        const t = pending.transfer || {};
        baris.push(
            `🔄 Rp <b>${momonRupiah(t.nominal)}</b> dari <b>${momonEsc(t.dari || "-")}</b> ke <b>${momonEsc(t.ke || "-")}</b>`,
        );
        if (t.deskripsi) baris.push(`📝 ${momonEsc(t.deskripsi)}`);
        baris.push(`🗓️ ${t.tanggal ? momonTanggalIndo(t.tanggal) : "hari ini"}`);
    } else {
        const daftar = pending.transaksi || [];
        let total = 0;
        daftar.forEach((t, i) => {
            const masuk = String(t.tipe || "").toLowerCase().indexOf("masuk") >= 0;
            total += Number(t.nominal) || 0;
            baris.push(
                `${masuk ? "🟢" : "🔴"} <b>${i + 1}.</b> Rp ${momonRupiah(t.nominal)} — ${momonEsc(t.deskripsi || "-")}`,
            );
            baris.push(
                `       <i>${momonEsc(t.kategori || "-")} · ${momonEsc(t.kantong || "-")} · ${t.tanggal ? momonTanggalIndo(t.tanggal) : "hari ini"}</i>`,
            );
        });
        if (daftar.length > 1) {
            baris.push("");
            baris.push(`Σ <b>Total Rp ${momonRupiah(total)}</b> dari ${daftar.length} transaksi`);
        }
    }

    baris.push("");
    if (pending.menungguKoreksi) {
        baris.push("✏️ <b>Kirim koreksinya sekarang</b>, contoh:");
        baris.push("<pre><code>nominalnya 30rb, kantongnya BCA</code></pre>");
    } else {
        baris.push("<i>Belum tersimpan.</i> Tekan ✅ kalau sudah benar, ✏️ kalau ada yang meleset.");
    }

    return baris.join("\n");
}

function momonTanganiCallback(cq) {
    const chatId = cq.message && cq.message.chat ? String(cq.message.chat.id) : "";
    const user = chatId ? momonUser(chatId) : null;
    if (!user) return momonJawabCallback(cq.id, "Kamu belum terdaftar 🙈");

    const messageId = cq.message.message_id;
    const pending = momonAmbilPending(chatId);
    const aksi = String(cq.data || "");

    // Draft hangus setelah MOMON_PREVIEW_TTL_DETIK, dan draft baru menimpa yang
    // lama — tombol di pesan lama tidak boleh menyimpan apa pun.
    if (!pending || pending.messageId !== messageId) {
        momonJawabCallback(cq.id, "Draft ini sudah kedaluwarsa");
        return momonEditPesan(
            chatId,
            messageId,
            "⏳ <b>Draft ini sudah kedaluwarsa atau diganti yang baru.</b>\nKirim ulang ya, Momon siap 💛",
        );
    }

    if (aksi === "batal") {
        momonHapusPending(chatId);
        momonJawabCallback(cq.id, "Dibatalkan");
        return momonEditPesan(chatId, messageId, "❌ <b>Oke, dibatalkan.</b> Tidak ada yang tersimpan ya 💛");
    }

    if (aksi === "koreksi") {
        pending.menungguKoreksi = true;
        momonJawabCallback(cq.id, "Kirim koreksinya ya");
        return momonTampilkanPreview(user, pending);
    }

    // Draft dibuang SEBELUM eksekusi: tombol yang kepencet dua kali tidak boleh
    // menyimpan/menghapus dua kali. Risikonya draft hilang kalau eksekusinya
    // gagal — dan itu memang pilihan yang lebih aman daripada catatan ganda.
    if (aksi === "hapus_ya") {
        momonHapusPending(chatId);
        momonJawabCallback(cq.id, "Dihapus");
        return momonJalankanHapus(user, pending, messageId);
    }

    if (aksi === "simpan") {
        momonHapusPending(chatId);
        momonJawabCallback(cq.id, "Tersimpan!");
        return momonSimpanDariPreview(user, pending, messageId);
    }

    momonJawabCallback(cq.id, "");
}

/** Simpan isi draft — lewat jalur validasi yang sama persis dengan teks bebas. */
function momonSimpanDariPreview(user, pending, messageId) {
    if (pending.jenis === "transfer") {
        const hasil = momonSimpanTransfer(user, pending.transfer);
        return momonEditPesan(
            user.chatId,
            messageId,
            hasil.pesan,
            hasil.ok ? { tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(hasil.sheet) } } : null,
        );
    }

    const hasil = momonSimpanTransaksi(user, pending.transaksi);
    if (hasil.kosong) {
        return momonEditPesan(user.chatId, messageId, "🤷 Draftnya kosong, jadi tidak ada yang Momon simpan.");
    }

    momonEditPesan(
        user.chatId,
        messageId,
        momonRenderHasilTransaksi(user, hasil.berhasil, hasil.gagal, hasil.now),
        hasil.berhasil.length ? { tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(hasil.sheet) } } : null,
    );
}

/** Pesan teks setelah user menekan "✏️ Edit" = koreksi untuk draft yang masih menggantung. */
function momonTerapkanKoreksi(user, pending, teks) {
    const hasil = momonOtakKoreksi(user, pending, teks);
    if (!hasil || hasil.gagal) {
        return momonKirim(user.chatId, (hasil && hasil.reply) || "😔 Momon gagal memproses koreksinya.");
    }

    if (pending.jenis === "transfer") {
        if (hasil.transfer) pending.transfer = hasil.transfer;
    } else if (Array.isArray(hasil.transaksi) && hasil.transaksi.length) {
        pending.transaksi = hasil.transaksi;
    }

    pending.menungguKoreksi = false;
    momonTampilkanPreview(user, pending);
}

function momonOtakKoreksi(user, pending, teksKoreksi) {
    const hariIni = Utilities.formatDate(new Date(), MOMON_TIMEZONE, "yyyy-MM-dd");
    const draft = pending.jenis === "transfer" ? { transfer: pending.transfer } : { transaksi: pending.transaksi };

    const prompt = `Kamu adalah "Momon", asisten keuangan milik ${user.nama}.
Ini draft yang BELUM tersimpan:
${JSON.stringify(draft)}

${user.nama} mengirim koreksi: "${teksKoreksi}"

Terapkan koreksinya ke draft di atas, lalu kembalikan draft LENGKAP yang sudah diperbaiki.
Field yang tidak disinggung koreksi WAJIB dibiarkan persis seperti semula.

Aturan nilai (tetap berlaku):
- "kategori": PERSIS satu dari ${JSON.stringify(MOMON_KATEGORI_PENGELUARAN)} untuk Pengeluaran,
  atau ${JSON.stringify(MOMON_KATEGORI_PEMASUKAN)} untuk Pemasukan.
- "kantong"/"dari"/"ke": PERSIS satu dari ${JSON.stringify(user.kantong)}.
- "nominal": angka murni ("30rb" -> 30000, "1.5jt" -> 1500000).
- "tanggal": ISO "YYYY-MM-DD" (hari ini ${hariIni}), "waktu": "HH:mm" atau "".
- "tipe": PERSIS "Pemasukan" atau "Pengeluaran".
Kalau koreksinya minta menghapus salah satu item, buang item itu dari array.

Jawab HANYA JSON murni dengan bentuk yang sama seperti draft di atas, tanpa markdown.`;

    const jawaban = momonPanggilGemini(momonConfig(), prompt, 0.1);
    if (!jawaban.ok) return { gagal: true, reply: jawaban.pesan };
    return jawaban.data;
}

// ============================================================
//  EDIT & HAPUS TRANSAKSI (lewat ID)
// ============================================================

/** Pisahkan "<id> <sisanya>" dari argumen perintah. */
function momonPisahId(argumen) {
    const m = String(argumen || "")
        .trim()
        .match(/^#?(\d+)\s*([\s\S]*)$/);
    if (!m) return null;
    return { id: Number(m[1]), sisa: m[2].trim() };
}

function momonPerintahEdit(user, argumen) {
    const arg = momonPisahId(argumen);
    if (!arg || !arg.sisa) {
        return momonKirim(
            user.chatId,
            [
                "✏️ <b>Edit transaksi</b>",
                "Tulis id transaksinya lalu koreksinya:",
                "<pre><code>/edit 42 nominalnya 30rb, kategorinya Transportasi</code></pre>",
                "",
                "Id-nya ada di balasan Momon waktu mencatat, atau di rincian laporan.",
            ].join("\n"),
        );
    }

    const sheet = momonSheetData(user);
    const target = momonCariBarisById(sheet, arg.id);
    if (!target) {
        return momonKirim(user.chatId, `🔍 Momon tidak menemukan transaksi <code>#${arg.id}</code>.`);
    }

    if (String(target.nilai[1]) === "Transfer") {
        return momonKirim(
            user.chatId,
            [
                `🔄 <b>Transaksi #${arg.id} itu baris transfer.</b>`,
                "",
                "Transfer menyentuh dua kantong sekaligus, jadi tidak bisa diedit sepotong.",
                `Hapus dulu dengan <code>/hapus ${arg.id}</code>, lalu catat ulang transfernya ya 💛`,
            ].join("\n"),
        );
    }

    const lama = {
        tipe: String(target.nilai[1]),
        kategori: String(target.nilai[2]),
        kantong: String(target.nilai[3]),
        nominal: Number(target.nilai[4]) || 0,
        deskripsi: String(target.nilai[5]),
        tanggal: Utilities.formatDate(target.nilai[0], MOMON_TIMEZONE, "yyyy-MM-dd"),
        waktu: Utilities.formatDate(target.nilai[0], MOMON_TIMEZONE, "HH:mm"),
    };

    const hasil = momonOtakEditBaris(user, lama, arg.sisa);
    if (!hasil || hasil.gagal) {
        return momonKirim(user.chatId, (hasil && hasil.reply) || "😔 Momon gagal memproses koreksinya.");
    }

    // Jalur validasi yang sama persis dengan pencatatan biasa — hasil AI tidak
    // pernah masuk sheet tanpa lewat sini.
    const baru = momonValidasiTransaksi(user, hasil.transaksi);
    if (!baru.ok) {
        return momonKirim(
            user.chatId,
            [
                `🙈 <b>Editnya Momon batalkan</b> — ${baru.alasan}.`,
                "",
                `Kantong yang Momon kenal: ${user.kantong.map((k) => momonEsc(k)).join(", ")}.`,
            ].join("\n"),
        );
    }

    const nilaiBaru = target.nilai.slice();
    nilaiBaru[0] = baru.tanggal;
    nilaiBaru[1] = baru.tipe;
    nilaiBaru[2] = baru.kategori;
    nilaiBaru[3] = baru.kantong;
    nilaiBaru[4] = baru.nominal;
    nilaiBaru[5] = baru.deskripsi;
    // "Dicatat Pada" & "ID" sengaja tidak disentuh — keduanya jejak audit.
    sheet.getRange(target.baris, 1, 1, MOMON_HEADER.length).setValues([nilaiBaru]);

    const pesan = [
        `✅ <b>Transaksi #${arg.id} diperbarui!</b> ${momonSemangat()}`,
        "",
        "<b>Sebelum</b>",
        `🔸 Rp ${momonRupiah(lama.nominal)} — ${momonEsc(lama.deskripsi)}`,
        `🔸 <i>${momonEsc(lama.kategori)} · ${momonEsc(lama.kantong)} · ${momonTanggalIndo(lama.tanggal)}</i>`,
        "",
        "<b>Sesudah</b>",
        `🔹 Rp ${momonRupiah(baru.nominal)} — ${momonEsc(baru.deskripsi)}`,
        `🔹 <i>${momonEsc(baru.kategori)} · ${momonEsc(baru.kantong)} · ${Utilities.formatDate(baru.tanggal, MOMON_TIMEZONE, "d MMM yyyy, HH:mm")}</i>`,
    ];
    if (baru.peringatan.length) {
        pesan.push("");
        pesan.push("⚠️ " + baru.peringatan.join(" "));
    }

    momonKirim(user.chatId, pesan.join("\n"), {
        tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(sheet) },
    });
}

function momonOtakEditBaris(user, lama, koreksi) {
    const hariIni = Utilities.formatDate(new Date(), MOMON_TIMEZONE, "yyyy-MM-dd");

    const prompt = `Kamu adalah "Momon", asisten keuangan milik ${user.nama}.
Ini transaksi yang sudah tercatat:
${JSON.stringify(lama)}

${user.nama} minta perubahan: "${koreksi}"

Terapkan perubahannya, lalu kembalikan transaksi LENGKAP hasil akhirnya.
Field yang tidak disinggung WAJIB dibiarkan persis seperti semula.

Aturan nilai:
- "tipe": PERSIS "Pemasukan" atau "Pengeluaran".
- "kategori": PERSIS satu dari ${JSON.stringify(MOMON_KATEGORI_PENGELUARAN)} untuk Pengeluaran,
  atau ${JSON.stringify(MOMON_KATEGORI_PEMASUKAN)} untuk Pemasukan.
- "kantong": PERSIS satu dari ${JSON.stringify(user.kantong)}.
- "nominal": angka murni ("30rb" -> 30000, "1.5jt" -> 1500000).
- "tanggal": ISO "YYYY-MM-DD" (hari ini ${hariIni}). Hitung kata relatif dari hari ini.
- "waktu": "HH:mm".

Jawab HANYA JSON murni, tanpa markdown:
{"transaksi":{"tipe":"","kategori":"","kantong":"","nominal":0,"deskripsi":"","tanggal":"","waktu":""}}`;

    const jawaban = momonPanggilGemini(momonConfig(), prompt, 0.1);
    if (!jawaban.ok) return { gagal: true, reply: jawaban.pesan };
    return jawaban.data;
}

function momonPerintahHapus(user, argumen) {
    const arg = momonPisahId(argumen);
    if (!arg) {
        return momonKirim(
            user.chatId,
            [
                "🗑️ <b>Hapus transaksi</b>",
                "Tulis id transaksinya:",
                "<pre><code>/hapus 42</code></pre>",
                "",
                "Id-nya ada di balasan Momon waktu mencatat, atau di rincian laporan.",
            ].join("\n"),
        );
    }

    const sheet = momonSheetData(user);
    const target = momonCariBarisById(sheet, arg.id);
    if (!target) {
        return momonKirim(user.chatId, `🔍 Momon tidak menemukan transaksi <code>#${arg.id}</code>.`);
    }

    const tipe = String(target.nilai[1]);
    const ikon = tipe === "Transfer" ? "🔄" : tipe === "Pemasukan" ? "🟢" : "🔴";
    const ringkasan = [
        `${ikon} <code>#${arg.id}</code> Rp <b>${momonRupiah(target.nilai[4])}</b> — ${momonEsc(target.nilai[5])}`,
        `<i>${momonEsc(target.nilai[2])} · ${momonEsc(target.nilai[3])} · ${Utilities.formatDate(target.nilai[0], MOMON_TIMEZONE, "d MMM yyyy, HH:mm")}</i>`,
    ];
    if (tipe === "Transfer") {
        ringkasan.push("");
        ringkasan.push("<i>Ini transfer — dua barisnya (keluar &amp; masuk) akan dihapus bersama.</i>");
    }

    momonTampilkanPreview(user, {
        jenis: "hapus",
        id: arg.id,
        ringkasan: ringkasan.join("\n"),
    });
}

function momonJalankanHapus(user, pending, messageId) {
    const sheet = momonSheetData(user);
    const target = momonCariBarisById(sheet, pending.id);
    if (!target) {
        return momonEditPesan(
            user.chatId,
            messageId,
            `🔍 Transaksi <code>#${pending.id}</code> sudah tidak ada — mungkin barusan terhapus.`,
        );
    }

    // Transfer selalu sepasang baris; menghapus sebelah saja bikin saldo melenceng.
    const transfer = String(target.nilai[1]) === "Transfer";
    const baris = [target.baris];
    if (transfer) {
        const pasangan = momonCariPasanganTransfer(sheet, target.baris, target.nilai);
        if (pasangan) baris.push(pasangan.baris);
    }

    // Hapus dari baris terbawah supaya nomor baris di atasnya tidak bergeser duluan.
    baris.sort((a, b) => b - a).forEach((b) => sheet.deleteRow(b));

    const catatan = [];
    if (transfer && baris.length > 1) catatan.push("<i>Kedua baris transfernya ikut terhapus.</i>");
    if (transfer && baris.length === 1) {
        catatan.push(
            "⚠️ <i>Pasangan baris transfernya tidak ketemu, jadi cuma sebelah yang terhapus. Cek saldo kantongnya ya.</i>",
        );
    }

    momonEditPesan(
        user.chatId,
        messageId,
        [`🗑️ <b>Transaksi #${pending.id} dihapus.</b>`].concat(catatan, ["", pending.ringkasan]).join("\n"),
        { tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(sheet) } },
    );
}

/** Pasangan baris transfer dikenali dari "Dicatat Pada" + nominal yang identik. */
function momonCariPasanganTransfer(sheet, baris, nilai) {
    const total = sheet.getLastRow() - 1;
    if (total <= 0) return null;

    const dicatat = nilai[MOMON_KOL_DICATAT - 1];
    if (!(dicatat instanceof Date)) return null;
    const stempel = dicatat.getTime();
    const nominal = Number(nilai[4]);

    const data = sheet.getRange(2, 1, total, MOMON_HEADER.length).getValues();
    for (let i = 0; i < total; i++) {
        if (i + 2 === baris) continue;
        if (String(data[i][2]) !== MOMON_KATEGORI_TRANSFER) continue;
        if (Number(data[i][4]) !== nominal) continue;
        const d = data[i][MOMON_KOL_DICATAT - 1];
        if (!(d instanceof Date) || d.getTime() !== stempel) continue;
        return { baris: i + 2, nilai: data[i] };
    }
    return null;
}

// ============================================================
//  LAPORAN CERDAS
// ============================================================

function momonSajikanLaporan(user, specRaw, kueriAsli) {
    const spec = momonNormalisasiSpec(specRaw, kueriAsli);
    const semua = momonBacaTransaksi(user);

    if (!semua.length) {
        return momonKirim(
            user.chatId,
            [
                `📭 <b>Belum ada transaksi tercatat, ${momonEsc(user.nama)}.</b>`,
                "",
                "Yuk mulai! Tulis saja seperti ngobrol biasa:",
                "<pre><code>kopi 25k pakai GoPay</code></pre>",
            ].join("\n"),
        );
    }

    const rows = momonSaring(semua, spec);
    const ringkas = momonHitungRingkasan(rows);
    const grup = momonKelompokkan(rows, spec.kelompok);
    const urut = momonUrutkan(rows, spec.urut);
    const rincian = spec.limit > 0 ? urut.slice(0, spec.limit) : urut;

    const urlSheet = momonTulisLaporanKeSheet(user, spec, ringkas, grup, rincian);
    const pesan = momonRenderLaporan(user, spec, rows, ringkas, grup, rincian);

    momonKirim(user.chatId, pesan, {
        tombol: { teks: "📊 Buka laporan di Google Sheet", url: urlSheet },
    });
}

/** Bersihkan & lengkapi spesifikasi laporan dari AI supaya selalu aman dipakai. */
function momonNormalisasiSpec(raw, kueriAsli) {
    raw = raw || {};
    const now = new Date();
    const hariIni = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");
    const awalBulan = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-01");

    let dari = momonAmbilISO(raw.dari);
    let sampai = momonAmbilISO(raw.sampai);
    if (!dari && !sampai) {
        dari = awalBulan;
        sampai = hariIni;
    }
    if (!dari) dari = sampai;
    if (!sampai) sampai = hariIni;
    if (dari > sampai) {
        const tmp = dari;
        dari = sampai;
        sampai = tmp;
    }

    const tipeRaw = String(raw.tipe || "Semua").toLowerCase();
    let tipe = "Semua";
    if (tipeRaw.indexOf("masuk") >= 0) tipe = "Pemasukan";
    else if (tipeRaw.indexOf("keluar") >= 0) tipe = "Pengeluaran";

    const kelompokValid = ["kategori", "kantong", "hari", "bulan", "tipe", "tidak"];
    const kelompok =
        kelompokValid.indexOf(String(raw.kelompok || "").toLowerCase()) >= 0
            ? String(raw.kelompok).toLowerCase()
            : "kategori";

    const urutValid = ["nominal_desc", "nominal_asc", "tanggal_desc", "tanggal_asc"];
    const urut =
        urutValid.indexOf(String(raw.urut || "").toLowerCase()) >= 0 ? String(raw.urut).toLowerCase() : "tanggal_desc";

    return {
        judul: String(raw.judul || "").trim() || "Laporan Keuangan",
        kueri: String(kueriAsli || "").trim(),
        dari: dari,
        sampai: sampai,
        tipe: tipe,
        kategori: momonArrayTeks(raw.kategori),
        kantong: momonArrayTeks(raw.kantong),
        kataKunci: String(raw.kata_kunci || "")
            .trim()
            .toLowerCase(),
        minNominal: Math.max(0, Number(raw.min_nominal) || 0),
        maxNominal: Math.max(0, Number(raw.max_nominal) || 0),
        kelompok: kelompok,
        urut: urut,
        limit: Math.max(0, Math.floor(Number(raw.limit) || 0)),
        rincian: raw.rincian !== false,
    };
}

/** Baca sheet user jadi array object yang gampang diolah. */
function momonBacaTransaksi(user) {
    const sheet = momonSheetData(user);
    if (sheet.getLastRow() <= 1) return [];

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, MOMON_HEADER.length).getValues();
    const out = [];

    for (let i = 0; i < data.length; i++) {
        const tanggal = data[i][0];
        if (!(tanggal instanceof Date) || isNaN(tanggal.getTime())) continue;

        const nominal = Number(data[i][4]) || 0;
        if (nominal <= 0) continue;

        const kategori = String(data[i][2] || "Lainnya");
        const tipe =
            kategori === MOMON_KATEGORI_TRANSFER
                ? "Transfer"
                : String(data[i][1]).toLowerCase().indexOf("masuk") >= 0
                  ? "Pemasukan"
                  : "Pengeluaran";

        out.push({
            baris: i + 2,
            id: Number(data[i][MOMON_KOL_ID - 1]) || 0,
            tanggal: tanggal,
            tgl: Utilities.formatDate(tanggal, MOMON_TIMEZONE, "yyyy-MM-dd"),
            bulan: Utilities.formatDate(tanggal, MOMON_TIMEZONE, "yyyy-MM"),
            tipe: tipe,
            kategori: kategori,
            kantong: String(data[i][3] || "-"),
            nominal: nominal,
            deskripsi: String(data[i][5] || "-"),
        });
    }
    return out;
}

function momonSaring(rows, spec) {
    const kategoriSet = spec.kategori.map((k) => k.toLowerCase());
    const kantongSet = spec.kantong.map((k) => k.toLowerCase());

    return rows.filter((r) => {
        if (r.tgl < spec.dari || r.tgl > spec.sampai) return false;
        if (spec.tipe !== "Semua" && r.tipe !== spec.tipe) return false;
        if (kategoriSet.length && kategoriSet.indexOf(r.kategori.toLowerCase()) < 0) return false;
        if (kantongSet.length && kantongSet.indexOf(r.kantong.toLowerCase()) < 0) return false;
        if (spec.kataKunci) {
            const bahan = (r.deskripsi + " " + r.kategori + " " + r.kantong).toLowerCase();
            if (bahan.indexOf(spec.kataKunci) < 0) return false;
        }
        if (spec.minNominal && r.nominal < spec.minNominal) return false;
        if (spec.maxNominal && r.nominal > spec.maxNominal) return false;
        return true;
    });
}

/**
 * Transfer antar kantong cuma memindah saldo (tidak menambah/mengurangi kekayaan),
 * begitu juga uang yang disisihkan ke kategori "Investasi" (ditabung/diinvestasikan,
 * bukan dibelanjakan) — keduanya tidak boleh dihitung sebagai pengeluaran/pemasukan.
 */
function momonBukanArusKas(r) {
    if (r.tipe === "Transfer") return true;
    if (r.tipe === "Pengeluaran" && r.kategori.toLowerCase() === "investasi") return true;
    return false;
}

/** Arah satu baris transfer: true kalau baris ini uang MASUK ke kantongnya. */
function momonTransferMasuk(r) {
    return r.deskripsi.indexOf("Transfer dari ") === 0;
}

function momonHitungRingkasan(rows) {
    let masuk = 0,
        keluar = 0,
        jumlah = 0,
        terbesar = null;
    const hariUnik = {};

    rows.forEach((r) => {
        if (momonBukanArusKas(r)) return;
        jumlah++;
        hariUnik[r.tgl] = true;
        if (r.tipe === "Pemasukan") masuk += r.nominal;
        else {
            keluar += r.nominal;
            if (!terbesar || r.nominal > terbesar.nominal) terbesar = r;
        }
    });

    const jumlahHari = Math.max(1, Object.keys(hariUnik).length);

    return {
        jumlah: jumlah,
        masuk: masuk,
        keluar: keluar,
        net: masuk - keluar,
        rataHarian: Math.round(keluar / jumlahHari),
        hariAktif: Object.keys(hariUnik).length,
        terbesar: terbesar,
    };
}

function momonKelompokkan(rows, kelompok) {
    if (kelompok === "tidak") return [];

    const peta = {};
    rows.forEach((r) => {
        if (momonBukanArusKas(r)) return;

        let label;
        if (kelompok === "kantong") label = r.kantong;
        else if (kelompok === "tipe") label = r.tipe;
        else if (kelompok === "hari") label = r.tgl;
        else if (kelompok === "bulan") label = r.bulan;
        else label = r.kategori;

        if (!peta[label]) peta[label] = { label: label, jumlah: 0, masuk: 0, keluar: 0 };
        peta[label].jumlah++;
        if (r.tipe === "Pemasukan") peta[label].masuk += r.nominal;
        else peta[label].keluar += r.nominal;
    });

    const hasil = Object.keys(peta).map((k) => {
        const g = peta[k];
        g.net = g.masuk - g.keluar;
        g.total = g.masuk + g.keluar;
        return g;
    });

    // Rentang waktu diurut kronologis, sisanya diurut dari nilai terbesar.
    if (kelompok === "hari" || kelompok === "bulan") hasil.sort((a, b) => (a.label < b.label ? -1 : 1));
    else hasil.sort((a, b) => b.total - a.total);

    return hasil;
}

function momonUrutkan(rows, urut) {
    const salinan = rows.slice();
    if (urut === "nominal_desc") salinan.sort((a, b) => b.nominal - a.nominal);
    else if (urut === "nominal_asc") salinan.sort((a, b) => a.nominal - b.nominal);
    else if (urut === "tanggal_asc") salinan.sort((a, b) => a.tanggal - b.tanggal);
    else salinan.sort((a, b) => b.tanggal - a.tanggal);
    return salinan;
}

function momonRenderLaporan(user, spec, rows, ringkas, grup, rincian) {
    const baris = [];
    baris.push(`📊 <b>${momonEsc(spec.judul)}</b>`);
    baris.push(`<i>${momonEsc(momonLabelFilter(spec))}</i>`);
    baris.push("");

    if (!rows.length) {
        baris.push(`🍃 Tidak ada transaksi yang cocok, ${momonEsc(user.nama)}.`);
        baris.push("Coba longgarkan pertanyaannya, atau mulai catat sekarang yuk! 💪");
        return baris.join("\n");
    }

    if (spec.tipe !== "Pengeluaran") baris.push(`🟢 Pemasukan: <b>Rp ${momonRupiah(ringkas.masuk)}</b>`);
    if (spec.tipe !== "Pemasukan") baris.push(`🔴 Pengeluaran: <b>Rp ${momonRupiah(ringkas.keluar)}</b>`);
    if (spec.tipe === "Semua")
        baris.push(`${ringkas.net >= 0 ? "💚" : "💔"} Selisih: <b>Rp ${momonRupiah(ringkas.net)}</b>`);
    baris.push(`🧾 ${ringkas.jumlah} transaksi dalam ${ringkas.hariAktif} hari aktif`);
    if (ringkas.keluar > 0) baris.push(`📉 Rata-rata keluar: <b>Rp ${momonRupiah(ringkas.rataHarian)}</b>/hari aktif`);

    if (grup.length) {
        baris.push("");
        baris.push(`<b>Per ${momonEsc(momonLabelKelompok(spec.kelompok))}</b>`);
        const totalAcuan = grup.reduce((s, g) => s + g.total, 0) || 1;
        grup.slice(0, 12).forEach((g) => {
            const nilai = spec.tipe === "Pemasukan" ? g.masuk : spec.tipe === "Pengeluaran" ? g.keluar : g.total;
            const persen = Math.round((g.total / totalAcuan) * 100);
            baris.push(
                `• ${momonEsc(momonLabelCantik(spec.kelompok, g.label))} — Rp ${momonRupiah(nilai)} <i>(${persen}%)</i>`,
            );
        });
        if (grup.length > 12) baris.push(`<i>…dan ${grup.length - 12} kelompok lain (lihat di Sheet)</i>`);
    }

    if (spec.rincian && rincian.length) {
        const tampil = rincian.slice(0, MOMON_MAKS_RINCIAN_CHAT);
        baris.push("");
        baris.push("<b>Rincian</b>");
        tampil.forEach((r) => {
            const ikon = r.tipe === "Transfer" ? "🔄" : r.tipe === "Pemasukan" ? "🟢" : "🔴";
            const tgl = Utilities.formatDate(r.tanggal, MOMON_TIMEZONE, "dd/MM");
            baris.push(
                `${ikon} <code>${tgl}</code> ${r.id ? `<code>#${r.id}</code> ` : ""}Rp ${momonRupiah(r.nominal)} — ${momonEsc(r.deskripsi)} <i>(${momonEsc(r.kategori)})</i>`,
            );
        });
        if (rincian.length > tampil.length) {
            baris.push(`<i>…${rincian.length - tampil.length} transaksi lagi, lengkapnya ada di Google Sheet 👇</i>`);
        }
    }

    const komentar = momonKomentarCeria(user, spec, ringkas, grup);
    if (komentar) {
        baris.push("");
        baris.push("💬 " + momonEsc(komentar));
    }

    return baris.join("\n");
}

/** Satu kalimat insight ceria dari AI. Angkanya sudah jadi, AI cuma mengomentari. */
function momonKomentarCeria(user, spec, ringkas, grup) {
    if (!MOMON_KOMENTAR_AI) return "";

    const topGrup = grup
        .slice(0, 3)
        .map((g) => `${g.label}: Rp ${Math.round(g.total)}`)
        .join(", ");

    const prompt = `Kamu adalah "Momon", asisten keuangan yang ceria dan menyemangati ${user.nama}.
Berikut angka laporan yang SUDAH dihitung (jangan diubah, jangan menambah angka baru):
- Periode: ${spec.dari} s/d ${spec.sampai}
- Pemasukan: Rp ${ringkas.masuk}
- Pengeluaran: Rp ${ringkas.keluar}
- Selisih: Rp ${ringkas.net}
- Jumlah transaksi: ${ringkas.jumlah}
- Kelompok terbesar: ${topGrup || "-"}

Tulis SATU kalimat (maksimal 25 kata) berisi komentar hangat + ajakan rajin mencatat.
Tanpa emoji, tanpa tanda kutip, tanpa markdown.

Jawab HANYA JSON: {"komentar":"..."}`;

    try {
        const hasil = momonPanggilGemini(momonConfig(), prompt, 0.8);
        if (hasil.ok && hasil.data && hasil.data.komentar) return String(hasil.data.komentar).trim();
    } catch (err) {
        Logger.log("Komentar AI gagal (diabaikan): " + err);
    }
    return "";
}

// ============================================================
//  TULIS LAPORAN KE GOOGLE SHEET
// ============================================================

/** Tulis ulang sheet laporan milik user, lalu kembalikan URL yang langsung membuka tab-nya. */
function momonTulisLaporanKeSheet(user, spec, ringkas, grup, rincian) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(user.sheetLaporan);
    if (!sh) sh = ss.insertSheet(user.sheetLaporan);

    sh.clear();

    const LEBAR = 7;
    const out = [];
    const tandaiJudul = [];
    const tandaiUang = []; // {baris, kolomAwal, jumlahKolom}
    const tandaiTanggal = [];

    function tulis(arr) {
        const row = arr.slice(0, LEBAR);
        while (row.length < LEBAR) row.push("");
        out.push(row);
        return out.length; // nomor baris (1-based)
    }

    tandaiJudul.push(tulis([spec.judul]));
    tulis([momonLabelFilter(spec)]);
    if (spec.kueri) tulis(['Pertanyaan: "' + spec.kueri + '"']);
    tulis([
        "Dibuat: " + Utilities.formatDate(new Date(), MOMON_TIMEZONE, "d MMMM yyyy, HH:mm") + " — untuk " + user.nama,
    ]);
    tulis([]);

    // --- Ringkasan ---
    tandaiJudul.push(tulis(["RINGKASAN"]));
    let b;
    b = tulis(["Total Pemasukan", ringkas.masuk]);
    tandaiUang.push({ baris: b, kolom: 2, n: 1 });
    b = tulis(["Total Pengeluaran", ringkas.keluar]);
    tandaiUang.push({ baris: b, kolom: 2, n: 1 });
    b = tulis(["Selisih (Net)", ringkas.net]);
    tandaiUang.push({ baris: b, kolom: 2, n: 1 });
    tulis(["Jumlah Transaksi", ringkas.jumlah]);
    tulis(["Hari Aktif", ringkas.hariAktif]);
    b = tulis(["Rata-rata Pengeluaran / Hari Aktif", ringkas.rataHarian]);
    tandaiUang.push({ baris: b, kolom: 2, n: 1 });
    if (ringkas.terbesar) {
        b = tulis([
            "Pengeluaran Terbesar",
            ringkas.terbesar.nominal,
            ringkas.terbesar.deskripsi,
            ringkas.terbesar.kategori,
        ]);
        tandaiUang.push({ baris: b, kolom: 2, n: 1 });
    }
    tulis([]);

    // --- Kelompok ---
    if (grup.length) {
        tandaiJudul.push(tulis(["PER " + momonLabelKelompok(spec.kelompok).toUpperCase()]));
        tandaiJudul.push(tulis(["Kelompok", "Transaksi", "Pemasukan", "Pengeluaran", "Net", "Porsi"]));
        const totalAcuan = grup.reduce((s, g) => s + g.total, 0) || 1;
        grup.forEach((g) => {
            const r = tulis([
                momonLabelCantik(spec.kelompok, g.label),
                g.jumlah,
                g.masuk,
                g.keluar,
                g.net,
                Math.round((g.total / totalAcuan) * 100) + "%",
            ]);
            tandaiUang.push({ baris: r, kolom: 3, n: 3 });
        });
        tulis([]);
    }

    // --- Rincian ---
    tandaiJudul.push(tulis(["RINCIAN TRANSAKSI (" + rincian.length + ")"]));
    tandaiJudul.push(tulis(["Tanggal", "Tipe", "Kategori", "Kantong", "Nominal", "Deskripsi", "ID"]));
    if (!rincian.length) {
        tulis(["Tidak ada transaksi yang cocok dengan filter ini."]);
    } else {
        rincian.forEach((r) => {
            const nomor = tulis([r.tanggal, r.tipe, r.kategori, r.kantong, r.nominal, r.deskripsi, r.id]);
            tandaiTanggal.push(nomor);
            tandaiUang.push({ baris: nomor, kolom: 5, n: 1 });
        });
    }

    sh.getRange(1, 1, out.length, LEBAR).setValues(out);

    // Perapihan tampilan. Dibungkus try/catch: kalau sheet memakai fitur "Tables",
    // sebagian pemformatan bisa ditolak — datanya tetap benar.
    try {
        tandaiJudul.forEach((r) => sh.getRange(r, 1, 1, LEBAR).setFontWeight("bold"));
        sh.getRange(1, 1, 1, LEBAR).setFontSize(14);
        tandaiUang.forEach((m) => sh.getRange(m.baris, m.kolom, 1, m.n).setNumberFormat("#,##0"));
        tandaiTanggal.forEach((r) => sh.getRange(r, 1).setNumberFormat("yyyy-mm-dd hh:mm"));
        sh.setColumnWidth(1, 160);
        sh.setColumnWidth(6, 320);
        sh.setFrozenRows(1);
    } catch (err) {
        Logger.log("Pemformatan sheet laporan dilewati: " + err);
    }

    return momonUrlSheet(sh);
}

function momonUrlSheet(sheet) {
    return SpreadsheetApp.getActiveSpreadsheet().getUrl() + "#gid=" + sheet.getSheetId();
}

function momonKirimLinkSheet(user) {
    const data = momonSheetData(user);
    momonKirim(
        user.chatId,
        [
            `📒 <b>Buku keuangan ${momonEsc(user.nama)}</b>`,
            "",
            `Semua catatanmu tersimpan rapi di sheet <b>${momonEsc(user.sheet)}</b>.`,
            `Laporan terakhir ada di sheet <b>${momonEsc(user.sheetLaporan)}</b>.`,
            "",
            "Klik tombol di bawah untuk membukanya ✨",
        ].join("\n"),
        {
            tombol: { teks: "📂 Buka Google Sheet", url: momonUrlSheet(data) },
        },
    );
}

// ============================================================
//  LAPORAN CEPAT LAIN
// ============================================================

/** Kantong tabungan/investasi disembunyikan dari /saldo secara default (bukan uang siap pakai). */
function momonAdalahKantongTabungan(namaKantong) {
    const nama = String(namaKantong || "").toLowerCase();
    return nama.indexOf("tabungan") >= 0 || nama.indexOf("investasi") >= 0;
}

function momonLaporanSaldo(user, sertakanTabungan) {
    const rows = momonBacaTransaksi(user);
    if (!rows.length) {
        return momonKirim(user.chatId, `📭 Belum ada data, ${momonEsc(user.nama)}. Yuk catat transaksi pertamamu! 🌱`);
    }

    const saldo = {};
    user.kantong.forEach((k) => (saldo[k] = 0));

    rows.forEach((r) => {
        const kantong = user.kantong.find((k) => k.toLowerCase() === r.kantong.toLowerCase()) || r.kantong;
        if (!(kantong in saldo)) saldo[kantong] = 0;
        const masuk = r.tipe === "Transfer" ? momonTransferMasuk(r) : r.tipe === "Pemasukan";
        saldo[kantong] += masuk ? r.nominal : -r.nominal;
    });

    const baris = [`💼 <b>Saldo Kantong — ${momonEsc(user.nama)}</b>`, ""];
    let total = 0;
    let disembunyikan = 0;

    user.kantong.forEach((k) => {
        if (!sertakanTabungan && momonAdalahKantongTabungan(k)) {
            disembunyikan++;
            return;
        }
        baris.push(`<b>${momonEsc(k)}:</b> Rp ${momonRupiah(saldo[k])}`);
        total += saldo[k];
    });
    Object.keys(saldo)
        .filter((k) => user.kantong.indexOf(k) < 0)
        .forEach((k) => {
            if (!sertakanTabungan && momonAdalahKantongTabungan(k)) {
                disembunyikan++;
                return;
            }
            baris.push(`<b>${momonEsc(k)}</b> <i>(tidak terdaftar)</i>: Rp ${momonRupiah(saldo[k])}`);
            total += saldo[k];
        });

    if (disembunyikan) {
        baris.push("");
        baris.push(
            `<i>🏦 ${disembunyikan} kantong tabungan/investasi disembunyikan dari total ini. Ketik <code>/saldo semua</code> untuk lihat.</i>`,
        );
    }

    baris.push("");
    baris.push(`<pre><code>TOTAL: Rp ${momonRupiah(total)}</code></pre>`);
    baris.push(total >= 0 ? "🎉 Mantap, terus dijaga ya!" : "🫂 Lagi minus nih, semangat benerinnya!");

    momonKirim(user.chatId, baris.join("\n"), {
        tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(momonSheetData(user)) },
    });
}

function momonDaftarKategori(user) {
    momonKirim(
        user.chatId,
        [
            "📂 <b>Kategori Pengeluaran</b>",
            ...MOMON_KATEGORI_PENGELUARAN.map((k) => "• " + momonEsc(k)),
            "",
            "📈 <b>Kategori Pemasukan</b>",
            ...MOMON_KATEGORI_PEMASUKAN.map((k) => "• " + momonEsc(k)),
        ].join("\n"),
    );
}

function momonDaftarKantong(user) {
    momonKirim(
        user.chatId,
        [`💼 <b>Kantong milik ${momonEsc(user.nama)}</b>`, ...user.kantong.map((k) => "• " + momonEsc(k))].join("\n"),
    );
}

function momonBantuan(user) {
    momonKirim(
        user.chatId,
        [
            `🌟 <b>Hai ${momonEsc(user.nama)}, aku Momon!</b>`,
            "Asisten keuanganmu yang paling semangat ngajak nyatet 💪",
            "",
            "<b>✍️ Mencatat</b> — tulis seperti ngobrol biasa:",
            "<pre><code>kopi 25k pakai GoPay</code></pre>",
            "<pre><code>gajian 5jt</code></pre>",
            "<pre><code>kemarin beli buku 120k</code></pre>",
            "<pre><code>kopi 25k, parkir 5k, gajian 5jt</code></pre>",
            "",
            "<b>🔄 Transfer antar kantong</b> — tulis atau pakai /transfer:",
            "<pre><code>pindah 100k dari Cash ke GoPay</code></pre>",
            "",
            "<b>🧾 Foto struk</b> — kirim fotonya, Momon yang baca.",
            "Boleh ditambahi caption kalau ada yang perlu dijelaskan, misal <i>pakai BCA</i>.",
            "",
            "<b>🎙️ Voice note</b> — tinggal ngomong, nggak usah ngetik.",
            "Bisa buat mencatat maupun bertanya laporan.",
            "",
            "<i>Hasil dari foto &amp; suara selalu Momon tunjukkan dulu buat dicek — baru tersimpan kalau kamu tekan ✅.</i>",
            "",
            "<b>🧠 Tanya apa saja</b> — Momon paham bahasa manusia:",
            "<pre><code>berapa jajanku minggu lalu?</code></pre>",
            "<pre><code>5 pengeluaran terbesar bulan ini</code></pre>",
            "<pre><code>rekap transportasi 3 bulan terakhir</code></pre>",
            "",
            "<b>⚡ Perintah cepat</b>",
            "/saldo — saldo tiap kantong (tabungan/investasi disembunyikan, pakai /saldo semua kalau mau lihat)",
            "/hari — rekap hari ini",
            "/minggu — rekap minggu ini",
            "/bulan — rekap bulan ini",
            "/laporan &lt;pertanyaan&gt; — laporan cerdas",
            "/sheet — buka Google Sheet",
            "/kategori — daftar kategori",
            "/kantong — daftar kantong",
            "/transfer &lt;nominal&gt; dari &lt;asal&gt; ke &lt;tujuan&gt; — pindah saldo antar kantong",
            "/edit &lt;id&gt; &lt;koreksi&gt; — perbaiki transaksi, contoh <code>/edit 42 nominalnya 30rb</code>",
            "/hapus &lt;id&gt; — hapus transaksi (Momon tanya dulu)",
            "/id — lihat chat id kamu",
            "/help — pesan ini",
            "",
            "Catat sedikit tiap hari, hasilnya besar di akhir bulan! 🌈",
        ].join("\n"),
        {
            tombol: { teks: "📂 Buka Google Sheet", url: momonUrlSheet(momonSheetData(user)) },
        },
    );
}

// ============================================================
//  SAPAAN TERJADWAL (pasang lewat Triggers)
// ============================================================

/** Trigger harian pagi — ajak mulai mencatat. */
function momonSapaPagi() {
    momonSemuaUser().forEach((user) => {
        momonKirim(
            user.chatId,
            [
                `☀️ <b>Pagi, ${momonEsc(user.nama)}!</b>`,
                "Hari baru, catatan baru. Jangan lupa catat tiap pengeluaran ya, sekecil apa pun! 🌱",
                "",
                "Ketik /saldo untuk cek posisi uangmu.",
            ].join("\n"),
        );
    });
}

/** Trigger harian malam — ingatkan kalau hari ini belum ada catatan. */
function momonIngatkanMalam() {
    const hariIni = Utilities.formatDate(new Date(), MOMON_TIMEZONE, "yyyy-MM-dd");

    momonSemuaUser().forEach((user) => {
        const rows = momonBacaTransaksi(user).filter((r) => r.tgl === hariIni);

        if (!rows.length) {
            momonKirim(
                user.chatId,
                [
                    `🌙 <b>Halo ${momonEsc(user.nama)}, hari ini belum ada catatan nih.</b>`,
                    "Masa sih seharian nggak ada transaksi? 😄",
                    "Ketik sekarang mumpung ingat, satu baris saja cukup!",
                ].join("\n"),
            );
            return;
        }

        const ringkas = momonHitungRingkasan(rows);
        momonKirim(
            user.chatId,
            [
                `🌙 <b>Rekap hari ini, ${momonEsc(user.nama)}</b>`,
                `🟢 Masuk: <b>Rp ${momonRupiah(ringkas.masuk)}</b>`,
                `🔴 Keluar: <b>Rp ${momonRupiah(ringkas.keluar)}</b>`,
                `🧾 ${ringkas.jumlah} transaksi tercatat`,
                "",
                "Keren, kamu konsisten! Sampai besok ya 💛",
            ].join("\n"),
        );
    });
}

// ============================================================
//  SHEET & UTILITAS
// ============================================================

/** Sheet data milik user — dibuat otomatis beserta headernya kalau belum ada. */
function momonSheetData(user) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(user.sheet);
    if (!sheet) sheet = ss.insertSheet(user.sheet);

    // Sheet lama bisa saja dipangkas pas 7 kolom — kolom ID butuh ruang dulu.
    if (sheet.getMaxColumns() < MOMON_HEADER.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), MOMON_HEADER.length - sheet.getMaxColumns());
    }

    if (sheet.getLastRow() === 0) {
        sheet.appendRow(MOMON_HEADER);
        try {
            sheet.getRange(1, 1, 1, MOMON_HEADER.length).setFontWeight("bold");
            sheet.setFrozenRows(1);
        } catch (err) {
            /* abaikan */
        }
    } else {
        // Sheet lama belum punya kolom terbaru — isi judul kolom yang masih kosong.
        const headerRange = sheet.getRange(1, 1, 1, MOMON_HEADER.length);
        const judul = headerRange.getValues()[0];
        let perluTulis = false;
        for (let i = 0; i < MOMON_HEADER.length; i++) {
            if (!String(judul[i] || "").trim()) {
                judul[i] = MOMON_HEADER[i];
                perluTulis = true;
            }
        }
        if (perluTulis) headerRange.setValues([judul]);
    }

    try {
        const totalBaris = Math.max(sheet.getMaxRows() - 1, 1);
        sheet.getRange(2, 1, totalBaris, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
        sheet.getRange(2, 5, totalBaris, 1).setNumberFormat("#,##0");
        sheet.getRange(2, MOMON_KOL_DICATAT, totalBaris, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
        sheet.getRange(2, MOMON_KOL_ID, totalBaris, 1).setNumberFormat("0");
    } catch (err) {
        Logger.log("Format kolom dilewati (kemungkinan sheet memakai fitur Tables): " + err);
    }

    return sheet;
}

/**
 * Tambah baris transaksi sekaligus memberi ID urut per user.
 * `daftarBaris` berisi 7 kolom pertama (tanpa ID); ID diisi di sini supaya tidak
 * ada satu pun jalur penulisan yang lupa memberi ID. Dikunci karena webhook bisa
 * datang bersamaan — dua pesan serempak tidak boleh dapat ID kembar.
 */
function momonTambahBaris(sheet, daftarBaris) {
    if (!daftarBaris.length) return [];

    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(20000);
    } catch (err) {
        Logger.log("Gagal mengambil lock, lanjut tanpa kunci: " + err);
    }

    try {
        let idBerikut = momonIdBerikutnya(sheet);
        const ids = [];
        const rows = daftarBaris.map((b) => {
            const row = b.slice(0, MOMON_HEADER.length - 1);
            row.push(idBerikut);
            ids.push(idBerikut);
            idBerikut++;
            return row;
        });

        const mulai = sheet.getLastRow() + 1;
        const butuh = mulai + rows.length - 1;
        if (butuh > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), butuh - sheet.getMaxRows());

        sheet.getRange(mulai, 1, rows.length, MOMON_HEADER.length).setValues(rows);
        SpreadsheetApp.flush();
        return ids;
    } finally {
        try {
            lock.releaseLock();
        } catch (err) {
            /* abaikan */
        }
    }
}

/**
 * ID baru selalu di atas jumlah baris data, bukan sekadar di atas ID terbesar.
 * Ini yang membuat momonIsiIdTransaksiLama() aman dijalankan belakangan: baris
 * lama yang belum ber-ID masih punya ruang 1..N tanpa menabrak ID yang terpakai.
 */
function momonIdBerikutnya(sheet) {
    const total = sheet.getLastRow() - 1;
    if (total <= 0) return 1;

    const kolom = sheet.getRange(2, MOMON_KOL_ID, total, 1).getValues();
    let maks = 0;
    for (let i = 0; i < total; i++) {
        const n = Number(kolom[i][0]);
        if (!isNaN(n) && n > maks) maks = n;
    }
    return Math.max(maks, total) + 1;
}

/** Cari baris berdasarkan ID. Mengembalikan {baris, nilai} atau null. */
function momonCariBarisById(sheet, id) {
    const total = sheet.getLastRow() - 1;
    if (total <= 0) return null;

    const kolom = sheet.getRange(2, MOMON_KOL_ID, total, 1).getValues();
    for (let i = 0; i < total; i++) {
        if (Number(kolom[i][0]) === id) {
            return { baris: i + 2, nilai: sheet.getRange(i + 2, 1, 1, MOMON_HEADER.length).getValues()[0] };
        }
    }
    return null;
}

function momonLabelFilter(spec) {
    const bagian = [];
    bagian.push(momonTanggalIndo(spec.dari) + " s/d " + momonTanggalIndo(spec.sampai));
    if (spec.tipe !== "Semua") bagian.push(spec.tipe);
    if (spec.kategori.length) bagian.push("Kategori: " + spec.kategori.join(", "));
    if (spec.kantong.length) bagian.push("Kantong: " + spec.kantong.join(", "));
    if (spec.kataKunci) bagian.push('Kata kunci: "' + spec.kataKunci + '"');
    if (spec.minNominal) bagian.push("≥ Rp " + momonRupiah(spec.minNominal));
    if (spec.maxNominal) bagian.push("≤ Rp " + momonRupiah(spec.maxNominal));
    return bagian.join(" • ");
}

function momonLabelKelompok(kelompok) {
    const peta = { kategori: "Kategori", kantong: "Kantong", hari: "Hari", bulan: "Bulan", tipe: "Tipe" };
    return peta[kelompok] || "Kategori";
}

function momonLabelCantik(kelompok, label) {
    if (kelompok === "hari") return momonTanggalIndo(label);
    if (kelompok === "bulan") {
        const d = momonParseTanggalISO(label + "-01");
        return d ? Utilities.formatDate(d, MOMON_TIMEZONE, "MMMM yyyy") : label;
    }
    return label;
}

function momonTanggalIndo(iso) {
    const d = momonParseTanggalISO(iso);
    return d ? Utilities.formatDate(d, MOMON_TIMEZONE, "d MMM yyyy") : String(iso);
}

function momonParseTanggalISO(str) {
    const m = String(str).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    try {
        const d = Utilities.parseDate(m[1], MOMON_TIMEZONE, "yyyy-MM-dd");
        return isNaN(d.getTime()) ? null : d;
    } catch (err) {
        return null;
    }
}

/** Kembalikan string ISO "yyyy-MM-dd" kalau valid, selain itu "". */
function momonAmbilISO(str) {
    const d = momonParseTanggalISO(str);
    return d ? Utilities.formatDate(d, MOMON_TIMEZONE, "yyyy-MM-dd") : "";
}

function momonArrayTeks(v) {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
}

function momonRupiah(n) {
    return Number(n || 0).toLocaleString("id-ID");
}

function momonEsc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MOMON_SEMANGAT = ["🎉", "✨", "💪", "🌟", "🙌", "🥳", "🌈"];
function momonSemangat() {
    return MOMON_SEMANGAT[Math.floor(Math.random() * MOMON_SEMANGAT.length)];
}

/**
 * Kirim pesan Telegram. Otomatis dipotong kalau melebihi batas 4096 karakter;
 * tombol hanya ditempel di potongan terakhir.
 * opsi: { tombol: { teks, url } } atau { tombolAksi: [[{teks, aksi}]] }
 * Mengembalikan message_id potongan terakhir (0 kalau gagal) supaya pesannya
 * bisa diedit belakangan.
 */
function momonKirim(chatId, teks, opsi) {
    const config = momonConfig();
    const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`;
    const potongan = momonPotongPesan(teks, 3800);
    let messageId = 0;

    potongan.forEach((bagian, i) => {
        const payload = {
            chat_id: String(chatId),
            text: bagian,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        };
        if (i === potongan.length - 1) {
            const markup = momonReplyMarkup(opsi);
            if (markup) payload.reply_markup = markup;
        }

        try {
            const res = UrlFetchApp.fetch(url, {
                method: "post",
                contentType: "application/json",
                payload: JSON.stringify(payload),
                muteHttpExceptions: true,
            });
            if (res.getResponseCode() !== 200) {
                Logger.log("Gagal kirim Telegram (" + res.getResponseCode() + "): " + res.getContentText());
                return;
            }
            const body = JSON.parse(res.getContentText());
            if (body && body.result && body.result.message_id) messageId = body.result.message_id;
        } catch (err) {
            Logger.log("Exception kirim Telegram: " + err);
        }
    });

    return messageId;
}

/** Tulis ulang isi pesan yang sudah terkirim (dipakai preview & konfirmasi). */
function momonEditPesan(chatId, messageId, teks, opsi) {
    if (!messageId) return momonKirim(chatId, teks, opsi);

    const config = momonConfig();
    const payload = {
        chat_id: String(chatId),
        message_id: messageId,
        text: momonPotongPesan(teks, 3800)[0],
        parse_mode: "HTML",
        disable_web_page_preview: true,
    };
    const markup = momonReplyMarkup(opsi);
    payload.reply_markup = markup || { inline_keyboard: [] }; // kosongkan tombol lama

    try {
        const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/editMessageText`, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
        });
        if (res.getResponseCode() !== 200) {
            Logger.log("Gagal edit Telegram (" + res.getResponseCode() + "): " + res.getContentText());
        }
    } catch (err) {
        Logger.log("Exception edit Telegram: " + err);
    }
}

/** Matikan animasi loading di tombol yang baru ditekan. */
function momonJawabCallback(callbackId, teks) {
    const config = momonConfig();
    try {
        UrlFetchApp.fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/answerCallbackQuery`, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify({ callback_query_id: callbackId, text: teks || "" }),
            muteHttpExceptions: true,
        });
    } catch (err) {
        Logger.log("Exception answerCallbackQuery: " + err);
    }
}

function momonReplyMarkup(opsi) {
    if (!opsi) return null;
    if (opsi.tombolAksi) {
        return {
            inline_keyboard: opsi.tombolAksi.map((baris) =>
                baris.map((t) => ({ text: t.teks, callback_data: t.aksi })),
            ),
        };
    }
    if (opsi.tombol) return { inline_keyboard: [[{ text: opsi.tombol.teks, url: opsi.tombol.url }]] };
    return null;
}

/** Potong pesan per baris supaya tag HTML tidak terbelah di tengah. */
function momonPotongPesan(teks, maks) {
    const str = String(teks);
    if (str.length <= maks) return [str];

    const hasil = [];
    let buffer = "";
    str.split("\n").forEach((baris) => {
        if ((buffer + "\n" + baris).length > maks) {
            if (buffer) hasil.push(buffer);
            buffer = baris.length > maks ? baris.slice(0, maks) : baris;
        } else {
            buffer = buffer ? buffer + "\n" + baris : baris;
        }
    });
    if (buffer) hasil.push(buffer);
    return hasil;
}

// ============================================================
//  SETUP — jalankan manual sekali dari editor Apps Script
// ============================================================

/**
 * Periksa semua Script Properties sebelum deploy.
 * Jalankan dari editor, lalu lihat hasilnya di Execution log (Ctrl+Enter).
 */
function momonCekKonfigurasi() {
    const config = momonConfig();
    const laporan = [];
    const masalah = [];

    function cek(label, nilai, wajib) {
        if (nilai) {
            laporan.push(`✅ ${label}: terisi (${String(nilai).length} karakter)`);
        } else {
            laporan.push(`${wajib ? "❌" : "⚠️"} ${label}: KOSONG`);
            if (wajib) masalah.push(label);
        }
    }

    cek("MOMON_BOT_TOKEN", config.BOT_TOKEN, true);
    cek("MOMON_GEMINI_API_KEY", config.GEMINI_API_KEY, true);
    cek("MOMON_WEBHOOK_URL", config.WEBHOOK_URL, false);

    const users = momonSemuaUser();
    if (users.length) {
        laporan.push(`✅ MOMON_USERS: ${users.length} akun terdaftar`);
        users.forEach((u) => laporan.push(`   • ${u.nama} (${u.chatId}) -> sheet "${u.sheet}"`));
    } else {
        laporan.push("❌ MOMON_USERS: belum ada akun dengan chat id berupa angka");
        masalah.push("MOMON_USERS");
    }

    try {
        laporan.push(`✅ Spreadsheet: ${SpreadsheetApp.getActiveSpreadsheet().getName()}`);
    } catch (err) {
        laporan.push("❌ Spreadsheet: script ini tidak terikat ke spreadsheet mana pun");
        masalah.push("Spreadsheet");
    }

    laporan.push(`ℹ️ Zona waktu script: ${MOMON_TIMEZONE}`);
    laporan.push(masalah.length ? `\n⛔ Perlu dibereskan: ${masalah.join(", ")}` : "\n🎉 Konfigurasi lengkap!");

    const hasil = laporan.join("\n");
    Logger.log(hasil);
    return hasil;
}

/** Daftarkan webhook Telegram. Isi Script Property MOMON_WEBHOOK_URL dengan URL Web App dulu. */
function momonPasangWebhook() {
    const config = momonConfig();
    if (!config.BOT_TOKEN) {
        throw new Error("Isi dulu Script Property MOMON_BOT_TOKEN. Jalankan momonCekKonfigurasi() untuk memeriksa.");
    }
    if (!config.WEBHOOK_URL) {
        throw new Error("Isi dulu Script Property MOMON_WEBHOOK_URL dengan URL deployment Web App-nya.");
    }
    const res = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${config.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(config.WEBHOOK_URL)}`,
        { muteHttpExceptions: true },
    );
    Logger.log(res.getContentText());
    return res.getContentText();
}

/** Buat sheet untuk semua user terdaftar tanpa menunggu pesan pertama. */
function momonSiapkanSheet() {
    momonSemuaUser().forEach((u) => {
        momonSheetData(u);
        Logger.log("Sheet siap: " + u.sheet + " (" + u.nama + ")");
    });
}

/**
 * Migrasi sekali jalan: baris transfer LAMA (dicatat sebelum Tipe "Transfer"
 * ada) masih tertulis "Pengeluaran"/"Pemasukan" di kolom Tipe. Fungsi ini
 * menuliskan ulang kolom Tipe jadi "Transfer" untuk semua baris yang
 * Kategori-nya MOMON_KATEGORI_TRANSFER, di semua sheet transaksi user
 * terdaftar. Aman dijalankan berkali-kali — baris yang sudah "Transfer"
 * dilewati, kolom lain tidak disentuh.
 */
function momonPerbaikiTipeTransferLama() {
    const laporan = [];

    momonSemuaUser().forEach((user) => {
        const sheet = momonSheetData(user);
        const totalBaris = sheet.getLastRow() - 1;
        if (totalBaris <= 0) {
            laporan.push(`${user.nama}: belum ada data.`);
            return;
        }

        const tipeRange = sheet.getRange(2, 2, totalBaris, 1);
        const kategori = sheet.getRange(2, 3, totalBaris, 1).getValues();
        const tipe = tipeRange.getValues();

        let diubah = 0;
        for (let i = 0; i < totalBaris; i++) {
            if (String(kategori[i][0]) === MOMON_KATEGORI_TRANSFER && String(tipe[i][0]) !== "Transfer") {
                tipe[i][0] = "Transfer";
                diubah++;
            }
        }

        if (diubah > 0) tipeRange.setValues(tipe);
        laporan.push(`${user.nama} (${user.sheet}): ${diubah} baris transfer diperbaiki.`);
    });

    const hasil = laporan.join("\n");
    Logger.log(hasil);
    return hasil;
}

/**
 * Migrasi sekali jalan: isi kolom "ID" untuk baris yang dicatat sebelum kolom
 * ini ada. Baris pertama setelah header dapat ID 1, dan seterusnya — ID yang
 * sudah terisi tidak pernah disentuh atau dipakai ulang. Aman dijalankan
 * berkali-kali.
 */
function momonIsiIdTransaksiLama() {
    const laporan = [];

    momonSemuaUser().forEach((user) => {
        const sheet = momonSheetData(user);
        const total = sheet.getLastRow() - 1;
        if (total <= 0) {
            laporan.push(`${user.nama}: belum ada data.`);
            return;
        }

        const data = sheet.getRange(2, 1, total, MOMON_HEADER.length).getValues();
        const range = sheet.getRange(2, MOMON_KOL_ID, total, 1);
        const kolom = range.getValues();

        const terpakai = {};
        kolom.forEach((r) => {
            const n = Number(r[0]);
            if (n > 0) terpakai[n] = true;
        });

        let berikut = 1;
        let diisi = 0;
        for (let i = 0; i < total; i++) {
            if (Number(kolom[i][0]) > 0) continue;
            // Catatan manual di bawah data bukan transaksi — jangan diberi ID.
            if (!(data[i][0] instanceof Date) || Number(data[i][4]) <= 0) continue;

            while (terpakai[berikut]) berikut++;
            kolom[i][0] = berikut;
            terpakai[berikut] = true;
            diisi++;
        }

        if (diisi > 0) range.setValues(kolom);
        laporan.push(`${user.nama} (${user.sheet}): ${diisi} baris diberi ID.`);
    });

    const hasil = laporan.join("\n");
    Logger.log(hasil);
    return hasil;
}

// ============================================================
//  ENTRY POINT — dipanggil Telegram lewat webhook Web App.
//
//  Apps Script hanya boleh punya SATU doPost per project.
//  Kalau project ini sudah punya bot lain, hapus fungsi di bawah
//  lalu panggil momonTerimaUpdate(e) dari doPost() yang sudah ada.
// ============================================================
function doPost(e) {
    momonTerimaUpdate(e);
    return HtmlService.createHtmlOutput("OK");
}
