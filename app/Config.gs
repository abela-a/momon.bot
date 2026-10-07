// ============================================================
//  MOMON · KONFIGURASI
//
//  Dipisahkan dari Momon.gs supaya semua yang perlu disetel ada di satu
//  tempat. Keduanya berbagi SATU ruang global Apps Script — tidak ada
//  import/export, dan urutan berkas tidak berpengaruh karena semua
//  konstanta di sini diisi nilai literal (bukan hasil hitung dari berkas
//  lain). Lisensi & seluruh logika bot ada di Momon.gs.
// ============================================================
//
// ⚠️ JANGAN menulis token atau API key di berkas ini — ikut masuk Git.
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

// Mode debug. Nyalakan lewat Script Property MOMON_DEBUG = "true" (tanpa perlu
// redeploy), matikan dengan menghapus propertinya atau mengisi "false".
// Saat aktif, Momon mengirim satu pesan diagnosa setelah tiap balasan.
const MOMON_DEBUG_FALLBACK = false;

// Error terakhir disimpan di sini supaya bisa dilihat lewat /debug walau
// kejadiannya sudah lewat.
const MOMON_PROP_ERROR_TERAKHIR = "MOMON_ERROR_TERAKHIR";

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
        DEBUG: String(props.getProperty("MOMON_DEBUG") || MOMON_DEBUG_FALLBACK).toLowerCase() === "true",
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
