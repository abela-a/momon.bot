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

// Kalau true, Momon menambahkan satu kalimat insight ceria dari AI di akhir
// laporan. Angkanya TETAP dihitung oleh script (bukan AI), jadi selalu akurat.
const MOMON_KOMENTAR_AI = true;

// Maksimum baris rincian yang ditampilkan di Telegram.
// Rincian lengkapnya selalu ditulis utuh ke Google Sheet.
const MOMON_MAKS_RINCIAN_CHAT = 20;

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
const MOMON_KANTONG_DEFAULT = ["Cash", "Bank Jago", "Investasi", "GoPay", "BSI"];

const MOMON_HEADER = ["Tanggal Transaksi", "Tipe", "Kategori", "Kantong", "Nominal", "Deskripsi", "Dicatat Pada"];
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
        const pesan = update.message || update.edited_message;
        if (!pesan || !pesan.text) return;

        const chatId = String(pesan.chat.id);
        const teks = String(pesan.text).trim();
        if (!teks) return;

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

        momonRoute(user, teks);
    } catch (err) {
        Logger.log("Momon error: " + err + "\n" + (err && err.stack));
        try {
            const chatId = JSON.parse(e.postData.contents).message.chat.id;
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

function momonRoute(user, teks) {
    const lower = teks.toLowerCase();

    if (lower === "/start" || lower === "/help" || lower.indexOf("/help") === 0) {
        return momonBantuan(user);
    }
    if (lower.indexOf("/saldo") === 0) return momonLaporanSaldo(user);
    if (lower.indexOf("/sheet") === 0) return momonKirimLinkSheet(user);
    if (lower.indexOf("/kategori") === 0) return momonDaftarKategori(user);
    if (lower.indexOf("/kantong") === 0) return momonDaftarKantong(user);
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
 */
function momonOtak(user, teks, paksaIntent) {
    const config = momonConfig();
    const now = new Date();
    const hariIni = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");
    const labelHari = Utilities.formatDate(now, MOMON_TIMEZONE, "EEEE, d MMMM yyyy");
    const awalBulan = Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-01");

    const aturanIntent = paksaIntent
        ? `Pesan ini SUDAH DIPASTIKAN permintaan laporan. Set "intent": "laporan".`
        : `Tentukan "intent" dari pesan: "transaksi" (mencatat uang masuk/keluar), "laporan" (menanyakan/merekap data yang sudah tercatat), atau "obrolan" (sapaan, pertanyaan umum, curhat).`;

    const prompt = `Kamu adalah "Momon", asisten keuangan pribadi yang CERIA, hangat, dan suka menyemangati.
Kamu bicara dengan ${user.nama}. Gaya bahasa: santai, akrab, pakai emoji secukupnya (1-3 per balasan),
selalu menyemangati supaya rajin mencatat keuangan. Jangan menggurui, jangan panjang-panjang.

KONTEKS WAKTU:
- Hari ini: ${labelHari} (${hariIni}), zona waktu ${MOMON_TIMEZONE}.
- Awal bulan ini: ${awalBulan}.

${aturanIntent}

JIKA intent = "transaksi", isi object "transaksi":
- "tipe": PERSIS "Pemasukan" atau "Pengeluaran".
- "kategori": PERSIS satu dari daftar sesuai tipe (dilarang mengarang):
  - Pengeluaran: ${JSON.stringify(MOMON_KATEGORI_PENGELUARAN)}
  - Pemasukan: ${JSON.stringify(MOMON_KATEGORI_PEMASUKAN)}
- "kantong": PERSIS satu dari ${JSON.stringify(user.kantong)}. Kalau tidak disebut, tebak paling masuk akal, kalau tidak ada petunjuk pakai "${user.kantong[0]}".
- "nominal": angka murni ("50k" -> 50000, "2jt" -> 2000000, "1.5jt" -> 1500000).
- "deskripsi": ringkasan singkat.
- "tanggal": ISO "YYYY-MM-DD". Hitung kata relatif ("kemarin", "3 hari lalu", "Senin kemarin") dari hari ini. Kalau tidak disebut, pakai ${hariIni}.
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

Pesan ${user.nama}: "${teks}"

Jawab HANYA JSON murni, tanpa markdown, tanpa teks lain:
{"intent":"obrolan","transaksi":{"tipe":"","kategori":"","kantong":"","nominal":0,"deskripsi":"","tanggal":"","waktu":""},"laporan":{"judul":"","dari":"","sampai":"","tipe":"Semua","kategori":[],"kantong":[],"kata_kunci":"","min_nominal":0,"max_nominal":0,"kelompok":"kategori","urut":"nominal_desc","limit":0,"rincian":true},"reply":""}`;

    const jawaban = momonPanggilGemini(config, prompt, 0.2);
    if (!jawaban.ok) {
        return { intent: "obrolan", gagal: true, reply: jawaban.pesan };
    }
    if (paksaIntent) jawaban.data.intent = paksaIntent;
    return jawaban.data;
}

/** Panggilan Gemini generik. Mengembalikan {ok, data} atau {ok:false, pesan}. */
function momonPanggilGemini(config, prompt, suhu) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MOMON_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: suhu },
    };

    let res;
    try {
        res = UrlFetchApp.fetch(url, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
        });
    } catch (err) {
        Logger.log("Gagal menghubungi Gemini: " + err);
        return { ok: false, pesan: "📡 Momon lagi susah sinyal ke layanan AI. Coba lagi sebentar lagi ya!" };
    }

    if (res.getResponseCode() !== 200) {
        Logger.log("Gemini HTTP " + res.getResponseCode() + ": " + res.getContentText());
        return { ok: false, pesan: `😣 Layanan AI lagi rewel (HTTP ${res.getResponseCode()}). Coba lagi nanti ya!` };
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

function momonCatatTransaksi(user, raw) {
    raw = raw || {};

    if (!raw.nominal || isNaN(raw.nominal) || Number(raw.nominal) <= 0) {
        return momonKirim(
            user.chatId,
            [
                "🤏 <b>Nominalnya belum kebaca nih!</b>",
                "Coba tulis angkanya, contoh:",
                "<pre><code>jajan 50k</code></pre>",
            ].join("\n"),
        );
    }

    const t = momonNormalisasiTransaksi(user, raw);
    const now = new Date();
    const sheet = momonSheetData(user);

    sheet.appendRow([t.tanggal, t.tipe, t.kategori, t.kantong, t.nominal, t.deskripsi, now]);

    const icon = t.tipe === "Pemasukan" ? "🟢" : "🔴";
    const backdate =
        Utilities.formatDate(t.tanggal, MOMON_TIMEZONE, "yyyy-MM-dd") !==
        Utilities.formatDate(now, MOMON_TIMEZONE, "yyyy-MM-dd");

    const baris = [];
    baris.push(`✅ <b>Sip, dicatat ya ${momonEsc(user.nama)}!</b> ${momonSemangat()}`);
    baris.push("");
    baris.push(`${icon} ${t.tipe} <b>Rp ${momonRupiah(t.nominal)}</b> — <i>${momonEsc(t.deskripsi)}</i>`);
    baris.push(`📂 Kategori: ${momonEsc(t.kategori)}`);
    baris.push(`💼 Kantong: ${momonEsc(t.kantong)}`);
    baris.push(
        `🗓️ ${Utilities.formatDate(t.tanggal, MOMON_TIMEZONE, "d MMMM yyyy, HH:mm")}${backdate ? " (backdate)" : ""}`,
    );
    if (t.peringatan.length) {
        baris.push("");
        baris.push("⚠️ " + t.peringatan.join(" "));
    }

    momonKirim(user.chatId, baris.join("\n"), {
        tombol: { teks: "📊 Lihat di Google Sheet", url: momonUrlSheet(sheet) },
    });
}

/** Validasi hasil AI terhadap daftar tertutup; tiap penyesuaian dicatat di `peringatan`. */
function momonNormalisasiTransaksi(user, raw) {
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

    const kantongInput = String(raw.kantong || "").trim();
    let kantong = user.kantong.find((k) => k.toLowerCase() === kantongInput.toLowerCase());
    if (!kantong) {
        kantong = user.kantong[0];
        peringatan.push(`Kantong "${kantongInput || "-"}" belum terdaftar, Momon catat ke "${kantong}".`);
    }

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

    let tanggal;
    try {
        tanggal = Utilities.parseDate(`${tanggalStr} ${jamMenit}:00`, MOMON_TIMEZONE, "yyyy-MM-dd HH:mm:ss");
        if (isNaN(tanggal.getTime())) throw new Error("invalid");
    } catch (err) {
        tanggal = now;
        peringatan.push("Gagal menyusun tanggal & jam, Momon catat sebagai waktu sekarang.");
    }

    return {
        tipe: tipe,
        kategori: kategori,
        kantong: kantong,
        nominal: Number(raw.nominal),
        deskripsi: String(raw.deskripsi || "-").trim() || "-",
        tanggal: tanggal,
        peringatan: peringatan,
    };
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

        out.push({
            baris: i + 2,
            tanggal: tanggal,
            tgl: Utilities.formatDate(tanggal, MOMON_TIMEZONE, "yyyy-MM-dd"),
            bulan: Utilities.formatDate(tanggal, MOMON_TIMEZONE, "yyyy-MM"),
            tipe: String(data[i][1]).toLowerCase().indexOf("masuk") >= 0 ? "Pemasukan" : "Pengeluaran",
            kategori: String(data[i][2] || "Lainnya"),
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

function momonHitungRingkasan(rows) {
    let masuk = 0,
        keluar = 0,
        terbesar = null;
    rows.forEach((r) => {
        if (r.tipe === "Pemasukan") masuk += r.nominal;
        else {
            keluar += r.nominal;
            if (!terbesar || r.nominal > terbesar.nominal) terbesar = r;
        }
    });

    const hariUnik = {};
    rows.forEach((r) => {
        hariUnik[r.tgl] = true;
    });
    const jumlahHari = Math.max(1, Object.keys(hariUnik).length);

    return {
        jumlah: rows.length,
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
            const ikon = r.tipe === "Pemasukan" ? "🟢" : "🔴";
            const tgl = Utilities.formatDate(r.tanggal, MOMON_TIMEZONE, "dd/MM");
            baris.push(
                `${ikon} <code>${tgl}</code> Rp ${momonRupiah(r.nominal)} — ${momonEsc(r.deskripsi)} <i>(${momonEsc(r.kategori)})</i>`,
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

    const LEBAR = 6;
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
    tandaiJudul.push(tulis(["Tanggal", "Tipe", "Kategori", "Kantong", "Nominal", "Deskripsi"]));
    if (!rincian.length) {
        tulis(["Tidak ada transaksi yang cocok dengan filter ini."]);
    } else {
        rincian.forEach((r) => {
            const nomor = tulis([r.tanggal, r.tipe, r.kategori, r.kantong, r.nominal, r.deskripsi]);
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

function momonLaporanSaldo(user) {
    const rows = momonBacaTransaksi(user);
    if (!rows.length) {
        return momonKirim(user.chatId, `📭 Belum ada data, ${momonEsc(user.nama)}. Yuk catat transaksi pertamamu! 🌱`);
    }

    const saldo = {};
    user.kantong.forEach((k) => (saldo[k] = 0));

    rows.forEach((r) => {
        const kantong = user.kantong.find((k) => k.toLowerCase() === r.kantong.toLowerCase()) || r.kantong;
        if (!(kantong in saldo)) saldo[kantong] = 0;
        saldo[kantong] += r.tipe === "Pemasukan" ? r.nominal : -r.nominal;
    });

    const baris = [`💼 <b>Saldo Kantong — ${momonEsc(user.nama)}</b>`, ""];
    let total = 0;

    user.kantong.forEach((k) => {
        baris.push(`<b>${momonEsc(k)}:</b> Rp ${momonRupiah(saldo[k])}`);
        total += saldo[k];
    });
    Object.keys(saldo)
        .filter((k) => user.kantong.indexOf(k) < 0)
        .forEach((k) => {
            baris.push(`<b>${momonEsc(k)}</b> <i>(tidak terdaftar)</i>: Rp ${momonRupiah(saldo[k])}`);
            total += saldo[k];
        });

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
            "",
            "<b>🧠 Tanya apa saja</b> — Momon paham bahasa manusia:",
            "<pre><code>berapa jajanku minggu lalu?</code></pre>",
            "<pre><code>5 pengeluaran terbesar bulan ini</code></pre>",
            "<pre><code>rekap transportasi 3 bulan terakhir</code></pre>",
            "",
            "<b>⚡ Perintah cepat</b>",
            "/saldo — saldo tiap kantong",
            "/hari — rekap hari ini",
            "/minggu — rekap minggu ini",
            "/bulan — rekap bulan ini",
            "/laporan &lt;pertanyaan&gt; — laporan cerdas",
            "/sheet — buka Google Sheet",
            "/kategori — daftar kategori",
            "/kantong — daftar kantong",
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

    if (sheet.getLastRow() === 0) {
        sheet.appendRow(MOMON_HEADER);
        try {
            sheet.getRange(1, 1, 1, MOMON_HEADER.length).setFontWeight("bold");
            sheet.setFrozenRows(1);
        } catch (err) {
            /* abaikan */
        }
    } else if (!sheet.getRange(1, MOMON_HEADER.length).getValue()) {
        // Sheet lama belum punya kolom terakhir — tambahkan headernya saja.
        sheet.getRange(1, MOMON_HEADER.length).setValue(MOMON_HEADER[MOMON_HEADER.length - 1]);
    }

    try {
        const totalBaris = Math.max(sheet.getMaxRows() - 1, 1);
        sheet.getRange(2, 1, totalBaris, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
        sheet.getRange(2, 5, totalBaris, 1).setNumberFormat("#,##0");
        sheet.getRange(2, 7, totalBaris, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    } catch (err) {
        Logger.log("Format kolom dilewati (kemungkinan sheet memakai fitur Tables): " + err);
    }

    return sheet;
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
 * opsi: { tombol: { teks, url } }
 */
function momonKirim(chatId, teks, opsi) {
    const config = momonConfig();
    const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`;
    const potongan = momonPotongPesan(teks, 3800);

    potongan.forEach((bagian, i) => {
        const payload = {
            chat_id: String(chatId),
            text: bagian,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        };
        if (opsi && opsi.tombol && i === potongan.length - 1) {
            payload.reply_markup = {
                inline_keyboard: [[{ text: opsi.tombol.teks, url: opsi.tombol.url }]],
            };
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
            }
        } catch (err) {
            Logger.log("Exception kirim Telegram: " + err);
        }
    });
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
