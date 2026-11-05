/**
 * Demografi Peserta PK-287 — Google Apps Script
 * --------------------------------------------------------------
 * Membaca sheet "Cleaning Database PK-287" lalu HANYA mengirim angka
 * agregat (jumlah per kategori). Nama, NIK, kontak, alamat, dan data
 * pribadi lain TIDAK PERNAH keluar dari spreadsheet.
 *
 * Cara pakai singkat (lihat gas/README.md untuk detail):
 *  1. Buka Google Sheet → Extensions → Apps Script.
 *  2. Tempel file ini sebagai Code.gs.
 *  3. Buat file HTML bernama "index" dan tempel isi index.html.
 *  4. Deploy → New deployment → Web app
 *     (Execute as: Me, Who has access: Anyone).
 *
 * Endpoint:
 *  - <URL web app>               → halaman dashboard
 *  - <URL web app>?format=json   → JSON agregat (untuk hosting di luar GAS)
 *
 * © PK-287
 */

/* ===================== KONFIGURASI ===================== */
var CONFIG = {
  // Kosongkan jika script dibuat dari dalam spreadsheet (container-bound).
  // Isi dengan ID spreadsheet jika script berdiri sendiri (standalone).
  SPREADSHEET_ID: '',
  SHEET_NAME: 'Cleaning Database PK-287',
  ANGKATAN: 'PK-287',
  // URL logo yang bisa diakses publik (mis. https://domain-anda/asset/img/logo.png).
  // Kosongkan untuk memakai logo SVG bawaan halaman.
  LOGO_URL: '',
  // URL publik halaman (untuk tag canonical / Open Graph). Opsional.
  SITE_URL: '',
  CACHE_SECONDS: 600 // 10 menit; jalankan clearCache() untuk memaksa refresh
};

/* Nama kolom (baris 1). Dicocokkan tanpa memperhatikan huruf besar/kecil & spasi. */
var COL = {
  id:           'Kode/No. Registrasi',     // hanya dipakai untuk mendeteksi baris terisi
  nama:         'Nama Lengkap sesuai saat daftar di Web LPDP', // idem, tidak pernah dikirim
  gender:       'Jenis Kelamin',
  provinsi:     'Provinsi Asal',
  wilayah:      'Wilayah Asal',
  jenjang:      'Jenjang',
  lokasi:       'Lokasi Studi',
  skema:        'Skema Beasiswa',
  subSkema:     'Sub Skema Beasiswa',
  rumpun:       'Rumpun Studi',
  subRumpun:    'Sub Rumpun Studi',
  jenjangKode:  'Jenjang (S2/S3/Sp)',
  klpProfesi:   'Kelompok Profesi',
  profesi:      'Jenis Profesi',
  negara:       'Negara Tujuan (Utama)',
  kawasan:      'Kawasan Tujuan',
  universitas:  'Universitas Tujuan (Standar)',
  usia:         'Kelompok Usia'
};

var PROVINSI_38 = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan',
  'Bangka Belitung', 'Bengkulu', 'Lampung', 'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah',
  'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
  'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara',
  'Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan',
  'Papua Selatan'
];
var PROV_ALIAS = {
  'daerah istimewa yogyakarta': 'DI Yogyakarta', 'yogyakarta': 'DI Yogyakarta', 'diy': 'DI Yogyakarta',
  'jakarta': 'DKI Jakarta', 'dki': 'DKI Jakarta', 'kepulauan bangka belitung': 'Bangka Belitung',
  'nad': 'Aceh', 'nanggroe aceh darussalam': 'Aceh', 'ntb': 'Nusa Tenggara Barat', 'ntt': 'Nusa Tenggara Timur'
};
var USIA_ORDER = ['Di bawah 25', '25–29', '30–34', '35–39', '40 ke atas'];
var SKEMA_ORDER = ['Targeted', 'Umum', 'Afirmasi'];
var RUMPUN_ORDER = ['STEM', 'STEM-Related', 'SHARE'];
var JENJANG_ORDER = ['Magister', 'Doktor', 'Spesialis'];
var KAWASAN_ORDER = ['Asia', 'Eropa', 'Amerika', 'Oseania', 'Afrika'];
var KOSONG = ['', 'belum diisi', 'tidak diisi', '#n/a', 'n/a', '-', 'null', 'undefined'];

/* ===================== WEB APP ===================== */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.format === 'json') {
    return ContentService.createTextOutput(JSON.stringify(getSummary()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var html = HtmlService.createHtmlOutputFromFile('index').getContent();
  if (CONFIG.LOGO_URL) html = html.split('asset/img/logo.png').join(CONFIG.LOGO_URL);
  if (CONFIG.SITE_URL) html = html.split('https://pk287.example/').join(CONFIG.SITE_URL.replace(/\/?$/, '/'));
  return HtmlService.createHtmlOutput(html)
    .setTitle('Demografi Peserta ' + CONFIG.ANGKATAN + ' · Persiapan Keberangkatan LPDP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('description', 'Ringkasan demografi peserta Persiapan Keberangkatan (PK) ' + CONFIG.ANGKATAN +
      ' LPDP: jenis kelamin, usia, jenis beasiswa, rumpun studi, profesi, daerah asal, negara dan universitas tujuan.')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Dipanggil dari halaman via google.script.run, juga dipakai endpoint JSON. */
function getSummary() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('summary_v2');
  if (hit) return JSON.parse(hit);
  var sh = getSheet_();
  var values = sh.getDataRange().getValues();
  var out = buildSummary(values, { angkatan: CONFIG.ANGKATAN, sumber: 'Google Sheets · ' + CONFIG.SHEET_NAME });
  try { cache.put('summary_v2', JSON.stringify(out), CONFIG.CACHE_SECONDS); } catch (err) { /* >100KB: lewati cache */ }
  return out;
}

function clearCache() { CacheService.getScriptCache().remove('summary_v2'); }

/** Menu kecil di spreadsheet agar panitia bisa refresh data web. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Demografi Web')
    .addItem('Refresh data web (hapus cache)', 'clearCache')
    .addItem('Lihat ringkasan JSON (log)', 'logSummary')
    .addToUi();
}
function logSummary() { clearCache(); Logger.log(JSON.stringify(getSummary(), null, 2)); }

function getSheet_() {
  var ss = CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error('Sheet "' + CONFIG.SHEET_NAME + '" tidak ditemukan.');
  return sh;
}

/* ===================== AGREGASI ===================== */
/**
 * values: array 2D (baris 1 = header). Mengembalikan HANYA angka agregat.
 * Fungsi murni (tanpa API Google) sehingga bisa diuji di luar Apps Script.
 */
function buildSummary(values, meta) {
  meta = meta || {};
  var hdr = values[0].map(norm_);
  var idx = {};
  Object.keys(COL).forEach(function (k) { idx[k] = hdr.indexOf(norm_(COL[k])); });
  ['gender', 'jenjang', 'lokasi'].forEach(function (k) {
    if (idx[k] < 0) throw new Error('Kolom "' + COL[k] + '" tidak ditemukan di baris header.');
  });

  var rows = values.slice(1).filter(function (r) {
    return (idx.nama >= 0 && clean_(r[idx.nama])) || (idx.id >= 0 && clean_(r[idx.id]));
  });
  var get = function (r, k) { return idx[k] < 0 ? '' : clean_(r[idx[k]]); };
  var T = rows.length;

  // --- Jenis kelamin
  var gender = tally_(rows, function (r) { var g = get(r, 'gender').toLowerCase();
    return g.indexOf('perempuan') === 0 || g === 'p' ? 'Perempuan' : g.indexOf('laki') === 0 || g === 'l' ? 'Laki-laki' : ''; });

  // --- Usia
  var usiaMap = tally_(rows, function (r) { return get(r, 'usia').replace(/[‐-―-]/g, '–').replace(/�/g, '–'); });
  var usia = USIA_ORDER.map(function (l) { return { label: l, count: usiaMap.map[l] || 0 }; });

  // --- Lokasi & jenjang
  var lok = function (r) { return /luar/i.test(get(r, 'lokasi')) ? 'ln' : /dalam/i.test(get(r, 'lokasi')) ? 'dn' : ''; };
  var ln = rows.filter(function (r) { return lok(r) === 'ln'; }).length;
  var dn = rows.filter(function (r) { return lok(r) === 'dn'; }).length;
  var jenjangLokasi = order_(uniq_(rows.map(function (r) { return get(r, 'jenjang'); })), JENJANG_ORDER).map(function (j) {
    var rr = rows.filter(function (r) { return get(r, 'jenjang') === j; });
    var a = rr.filter(function (r) { return lok(r) === 'ln'; }).length, b = rr.filter(function (r) { return lok(r) === 'dn'; }).length;
    return { label: j, ln: a, dn: b, total: rr.length };
  });

  // --- Skema beasiswa
  var skema = group_(rows, function (r) { return get(r, 'skema'); }, function (r) { return get(r, 'subSkema'); }, SKEMA_ORDER);

  // --- Rumpun studi
  var rumpunGroups = order_(uniq_(rows.map(function (r) { return get(r, 'rumpun'); }))
    .filter(function (x) { return RUMPUN_ORDER.indexOf(x) >= 0; }), RUMPUN_ORDER).map(function (g) {
    var rr = rows.filter(function (r) { return get(r, 'rumpun') === g; });
    var items = uniq_(rr.map(function (r) { return get(r, 'subRumpun') || 'Lainnya'; })).sort().map(function (s) {
      var x = rr.filter(function (r) { return (get(r, 'subRumpun') || 'Lainnya') === s; });
      var c = function (k) { return x.filter(function (r) { return get(r, 'jenjangKode') === k; }).length; };
      return { label: s, S2: c('S2'), S3: c('S3'), Sp: c('Sp'), total: x.length };
    });
    return { label: g, items: items, total: rr.length };
  });
  var rCount = function (l) { return rows.filter(function (r) { return get(r, 'rumpun') === l; }).length; };
  var rumpunKnown = rCount('STEM') + rCount('STEM-Related') + rCount('SHARE');
  var rumpunKosong = rows.filter(function (r) { return !get(r, 'rumpun'); }).length;

  // --- Profesi
  var profesi = group_(rows, function (r) { return get(r, 'klpProfesi'); }, function (r) { return get(r, 'profesi'); },
    ['PNS/TNI/POLRI', 'Non-PNS/TNI/POLRI']);

  // --- Provinsi asal
  var provMap = tally_(rows, function (r) { return canonProv_(get(r, 'provinsi')); });
  var provList = PROVINSI_38.map(function (p) { return { label: p, count: provMap.map[p] || 0 }; })
    .sort(function (a, b) { return b.count - a.count; });
  var wilayah = idx.wilayah >= 0 ? tally_(rows, function (r) { return get(r, 'wilayah'); }).list : [];

  // --- Negara & kawasan tujuan
  var kawasan = group_(rows, function (r) { return get(r, 'kawasan'); }, function (r) { return get(r, 'negara'); }, KAWASAN_ORDER);
  var negaraMap = tally_(rows, function (r) { return get(r, 'negara'); });
  var luarNegeri = negaraMap.list.filter(function (n) { return n.label !== 'Indonesia'; });

  // --- Universitas tujuan per negara
  var univ = group_(rows, function (r) { return get(r, 'negara'); }, function (r) { return get(r, 'universitas'); }, ['Indonesia']);
  var univCount = uniq_(rows.map(function (r) { return get(r, 'universitas'); }).filter(String)).length;

  var now = new Date();
  return {
    meta: { angkatan: meta.angkatan || 'PK-287', generatedAt: now.toISOString(), asOf: now.toISOString().slice(0, 10), sumber: meta.sumber || '' },
    total: T,
    gender: gender.list,
    usia: usia, usiaBelumDiisi: T - usia.reduce(function (s, u) { return s + u.count; }, 0),
    lokasi: { ln: ln, dn: dn },
    jenjangLokasi: jenjangLokasi,
    skema: skema.groups,
    rumpun: { groups: rumpunGroups, stem: rCount('STEM') + rCount('STEM-Related'), stemRelated: rCount('STEM-Related'),
      share: rCount('SHARE'), belumDiisi: T - rumpunKnown, kosong: rumpunKosong },
    profesi: { groups: profesi.groups, belumDiisi: profesi.belum },
    provinsi: { list: provList, belumDiisi: provMap.belum, totalProvinsi: provList.filter(function (p) { return p.count; }).length, dari: 38 },
    wilayah: wilayah,
    negara: { kawasan: kawasan.groups, belumDiisi: kawasan.belum, totalNegara: negaraMap.list.length, luarNegeri: luarNegeri },
    universitas: { negara: univ.groups, belumDiisi: univ.belum, totalUniversitas: univCount }
  };
}

/* ===================== HELPER ===================== */
function norm_(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function clean_(v) {
  if (v == null) return '';
  var s = String(v).replace(/\s+/g, ' ').trim();
  return KOSONG.indexOf(s.toLowerCase()) >= 0 ? '' : s;
}
function uniq_(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o); }
function order_(labels, pref) {
  return labels.slice().sort(function (a, b) {
    var ia = pref.indexOf(a), ib = pref.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}
/** Hitung per label; label kosong masuk "belum". list diurutkan terbanyak. */
function tally_(rows, fn) {
  var map = {}, belum = 0;
  rows.forEach(function (r) { var k = fn(r); if (k) map[k] = (map[k] || 0) + 1; else belum++; });
  var list = Object.keys(map).map(function (k) { return { label: k, count: map[k] }; })
    .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  return { map: map, list: list, belum: belum };
}
/** Grup dua tingkat: { groups: [{label, count, items:[{label,count}]}], belum } */
function group_(rows, fnGroup, fnItem, pref) {
  var t = tally_(rows, fnGroup);
  var labels = order_(Object.keys(t.map), pref || []);
  if (!pref || pref.length < 2) labels = t.list.map(function (x) { return x.label; })
    .sort(function (a, b) { return (pref && pref.indexOf(b) >= 0) - (pref && pref.indexOf(a) >= 0) || t.map[b] - t.map[a] || a.localeCompare(b); });
  return {
    belum: t.belum,
    groups: labels.map(function (g) {
      var sub = tally_(rows.filter(function (r) { return fnGroup(r) === g; }), function (r) { return fnItem(r) || 'Lainnya'; });
      return { label: g, count: t.map[g], items: sub.list };
    })
  };
}
function canonProv_(s) {
  if (!s) return '';
  var k = norm_(s).replace(/^(provinsi|prov\.?)\s+/, '');
  if (PROV_ALIAS[k]) return PROV_ALIAS[k];
  for (var i = 0; i < PROVINSI_38.length; i++) if (norm_(PROVINSI_38[i]) === k) return PROVINSI_38[i];
  return s; // tidak dikenali: tetap dihitung apa adanya
}

/* Ekspor untuk pengujian di Node.js (diabaikan oleh Apps Script). */
if (typeof module !== 'undefined') module.exports = { buildSummary: buildSummary };
