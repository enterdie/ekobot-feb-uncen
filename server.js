const express = require('express');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const Tesseract = require('tesseract.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const KB_PATH = path.join(__dirname, 'knowledge_base.json');
const STUDENTS_PATH = path.join(__dirname, 'students.json');
const PA_KB_PATH = path.join(__dirname, 'pa_uncen_kb.json');
const DATA_EVALUASI_PATH = path.join(__dirname, 'data_evaluasi.json');
const DOSEN_WALI_PATH = path.join(__dirname, 'dosen_wali_db.json');
const COURSES_DB_PATH = path.join(__dirname, 'courses_db.json');

// Session store for NIM verification
const sessions = {};

// Load Courses Database
let coursesDb = {};
try {
  if (fs.existsSync(COURSES_DB_PATH)) {
    coursesDb = JSON.parse(fs.readFileSync(COURSES_DB_PATH, 'utf8'));
    console.log(`Loaded courses database with types: ${Object.keys(coursesDb).join(', ')}`);
  } else {
    console.warn('Warning: courses_db.json not found.');
  }
} catch (err) {
  console.error('Error loading courses database:', err);
}

// Load Dosen Wali Database
let dosenWaliDb = {};
try {
  if (fs.existsSync(DOSEN_WALI_PATH)) {
    dosenWaliDb = JSON.parse(fs.readFileSync(DOSEN_WALI_PATH, 'utf8'));
    console.log(`Loaded ${Object.keys(dosenWaliDb).length} student Dosen Wali mappings.`);
  } else {
    console.warn('Warning: dosen_wali_db.json not found.');
  }
} catch (err) {
  console.error('Error loading Dosen Wali database:', err);
}

// Load Data Evaluasi 20242 Database
let dataEvaluasiDb = [];
try {
  if (fs.existsSync(DATA_EVALUASI_PATH)) {
    dataEvaluasiDb = JSON.parse(fs.readFileSync(DATA_EVALUASI_PATH, 'utf8'));
    console.log(`Loaded ${dataEvaluasiDb.length} unique student NIMs from Data Evaluasi database.`);
  } else {
    console.warn('Warning: data_evaluasi.json not found. Make sure to generate it.');
  }
} catch (err) {
  print('Error loading Data Evaluasi database:', err);
}

// Load PA Uncen 2024 PDF Knowledge Base
let paKb = [];
try {
  if (fs.existsSync(PA_KB_PATH)) {
    paKb = JSON.parse(fs.readFileSync(PA_KB_PATH, 'utf8'));
    console.log(`Loaded ${paKb.length} pages of PA Uncen 2024 knowledge base.`);
  } else {
    console.warn('Warning: pa_uncen_kb.json not found. Run index_pa_uncen.py first.');
  }
} catch (err) {
  console.error('Error loading PA Uncen database:', err);
}

// Helper to search through PA Uncen indexed PDF pages
function searchPAKnowledgeBase(queryText) {
  if (!paKb || paKb.length === 0) return null;
  
  // Split query into keywords, clean punctuation, filter out common short Indonesian stop words
  const queryWords = queryText.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 3 && !['yang', 'dengan', 'untuk', 'pada', 'dari', 'dalam'].includes(word));
    
  if (queryWords.length === 0) return null;
  
  let bestPage = null;
  let maxMatchCount = 0;
  
  for (const pageItem of paKb) {
    const contentLower = pageItem.content.toLowerCase();
    let matchCount = 0;
    
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matchCount++;
      }
    }
    
    if (matchCount > maxMatchCount) {
      maxMatchCount = matchCount;
      bestPage = pageItem;
    }
  }
  
  // Require at least 2 matching words or 40% of the query words to prevent random incorrect matches
  const minMatchesRequired = Math.max(2, Math.floor(queryWords.length * 0.4));
  if (bestPage && maxMatchCount >= minMatchesRequired) {
    return {
      page: bestPage.page,
      raw: bestPage.raw,
      score: maxMatchCount
    };
  }
  
  return null;
}

// Load Students Database
let studentsDb = {};
try {
  if (fs.existsSync(STUDENTS_PATH)) {
    studentsDb = JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf8'));
    console.log(`Loaded ${Object.keys(studentsDb).length} student records from database.`);
  } else {
    console.warn('Warning: students.json not found. Run parse_xlsx.py first.');
  }
} catch (err) {
  console.error('Error loading students database:', err);
}

// Helper to read Knowledge Base
function readKB() {
  try {
    const data = fs.readFileSync(KB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading knowledge base:', err);
    return {};
  }
}

// Helper to write Knowledge Base
function writeKB(data) {
  try {
    fs.writeFileSync(KB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing knowledge base:', err);
    return false;
  }
}

// Simulated NLP Matching logic
function findResponse(messageText, kb) {
  const text = messageText.toLowerCase().trim();
  
  // Exact command triggers first (fast path)
  if (text === '/start') return kb.start;
  if (text === '/menu') return kb.menu;
  if (text === '/kaldik') return kb.kaldik;
  if (text === '/jadwalkuliah') return kb.jadwalkuliah;
  if (text === '/janjian') return kb.janjian;
  if (text === '/akt') return kb.akt;
  if (text === '/man') return kb.man;
  if (text === '/ie') return kb.ie;
  if (text === '/beasiswa') return kb.beasiswa;
  if (text === '/tugasakhir') return kb.tugasakhir;
  if (text === '/zi') return kb.zi;
  if (text === '/kontak') return kb.kontak;
  if (text === '/yudisium') return kb.yudisium;
  if (text === '/rpl') return kb.rpl;
  if (text === '/rpl_a1') return kb.rpl_a1;
  if (text === '/rpl_a2') return kb.rpl_a2;
  if (text === '/rpl_syarat') return kb.rpl_syarat;
  if (text === '/rpl_tahapan') return kb.rpl_tahapan;
  if (text === '/rpl_kelulusan') return kb.rpl_kelulusan;
  if (text === '/akreditasi') return kb.akreditasi;

  // Semantic keyword database for natural queries
  const kbKeywords = {
    start: ['halo', 'hi', 'selamat', 'pagi', 'siang', 'sore', 'malam', 'assalamualaikum', 'ekobot'],
    menu: ['menu', 'layanan', 'daftar layanan', 'bantuan', 'fitur', 'command'],
    kaldik: ['kalender', 'akademik', 'agenda', 'kaldik', 'jadwal akademik', 'tanggal penting', 'uts kapan', 'uas kapan', 'wisuda kapan', 'yudisium kapan', 'krs kapan', 'perkuliahan dimulai'],
    jadwalkuliah: ['jadwal kuliah', 'jadwal perkuliahan', 'jam kuliah', 'kelas', 'jadwal mengajar'],
    janjian: ['jadwal ujian', 'uts', 'uas', 'ujian semester', 'ujian akhir', 'ujian tengah'],
    akt: ['akuntansi', 's1 akuntansi', 'jurusan akuntansi', 'kaprodi akuntansi', 'prodi akuntansi'],
    man: ['manajemen', 's1 manajemen', 'jurusan manajemen', 'kaprodi manajemen', 'prodi manajemen'],
    ie: ['ilmu ekonomi', 'ekonomi pembangunan', 'ep', 'kaprodi ekonomi', 'prodi ekonomi'],
    beasiswa: ['beasiswa', 'kip', 'kip-kuliah', 'kip kuliah', 'otsus', 'bantuan biaya', 'beasiswa uncen', 'beasiswa bakti bca', 'beasiswa ppa', 'daftar beasiswa', 'syarat beasiswa'],
    akademik: ['biro akademik', 'bak', 'informasi akademik', 'layanan akademik', 'portal uncen', 'portal mahasiswa', 'tracer study', 'pin mahasiswa', 'pengumuman akademik'],
    tugasakhir: ['tugas akhir', 'skripsi', 'ta', 'proposal', 'sidang', 'kelulusan', 'sempro', 'seminar hasil'],
    yudisium: ['yudisium', 'wisuda', 'kelulusan', 'daftar wisuda', 'daftar yudisium', 'syarat yudisium', 'pendaftaran yudisium', 'sk yudisium', 'periode yudisium', 'tanggal yudisium', 'lulus kapan', 'kapan yudisium'],
    zi: ['zona integritas', 'zi', 'wbbm', 'wbk', 'integritas'],
    kontak: ['kontak', 'alamat', 'telepon', 'email', 'lokasi', 'nomor hp', 'hubungi'],
    faq_pindah_prodi: ['pindah', 'prodi', 'program studi', 'perpindahan', 'transfer prodi', 'pindah jurusan', 'pindah fakultas', 'pindah kampus'],
    faq_krs_isi: ['isi krs', 'mengisi krs', 'rencana studi', 'krs online', 'krs portal', 'pilih matakuliah'],
    faq_nilai_portal: ['nilai', 'khs', 'nilai portal', 'nilai kosong', 'nilai t', 'kartu hasil studi', 'nilai belum keluar'],
    faq_reset_portal: ['reset password', 'reset portal', 'lupa password', 'lupa akun', 'reset akun'],
    faq_sempro_daftar: ['daftar sempro', 'seminar proposal', 'syarat sempro', 'pendaftaran proposal', 'acc sempro', 'sempro'],
    faq_sidang_daftar: ['daftar sidang', 'daftar skripsi', 'seminar hasil', 'sidang skripsi', 'ujian skripsi', 'ujian tugas akhir'],
    faq_sp_daftar: ['semester antara', 'semester pendek', 'sp', 'kuliah pendek', 'daftar sp'],
    faq_pddikti_ubah: ['pddikti', 'ubah data', 'perubahan data', 'ijazah', 'ktp', 'kk', 'akte', 'data salah', 'perbaiki data'],
    faq_ukt_keringanan: ['keringanan ukt', 'penundaan ukt', 'potongan ukt', 'cicil ukt', 'bebas ukt'],
    faq_ukt_bayar: ['bayar ukt', 'cara bayar', 'pembayaran ukt', 'teller bank', 'bri', 'bni', 'mandiri', 'portal uncen'],
    faq_dosen_nip: ['nip dosen', 'dosen nip', 'nip', 'data nip', 'nomor nip'],
    faq_portal_cara: ['menggunakan portal', 'cara portal', 'panduan portal', 'tutorial portal'],
    faq_peraturan_akademik: ['peraturan akademik', 'aturan akademik', 'pedoman akademik'],
    'dosen akuntansi': ['dosen akuntansi', 'pengajar akuntansi', 'dosen s1 akuntansi', 'tenaga pendidik akuntansi', 'list dosen akuntansi'],
    'dosen manajemen': ['dosen manajemen', 'pengajar manajemen', 'dosen s1 manajemen', 'tenaga pendidik manajemen', 'list dosen manajemen'],
    akreditasi: ['akreditasi', 'sertifikat akreditasi', 'status akreditasi', 'ban-pt', 'akreditasi prodi', 'file akreditasi', 'sertifikat ban-pt'],
    'dosen ilmu ekonomi': ['dosen ilmu ekonomi', 'dosen ekonomi', 'pengajar ekonomi', 'dosen s1 ekonomi', 'tenaga pendidik ekonomi', 'dosen ie'],
    rpl: ['rpl', 'rekognisi pembelajaran lampau', 'rekognisi pembelajaran', 'pembelajaran lampau', 'jalur rpl', 'program rpl', 'daftar rpl', 'mendaftar rpl'],
    rpl_a1: ['rpl a1', 'rpl tipe a1', 'rpl tipe a-1', 'transfer kredit', 'alih kredit', 'pindah dari pt lain', 'credit transfer', 'rpl formal', 'rpl pendidikan formal'],
    rpl_a2: ['rpl a2', 'rpl tipe a2', 'rpl tipe a-2', 'perolehan kredit', 'pengalaman kerja rpl', 'rpl nonformal', 'rpl informal', 'rpl sertifikat'],
    rpl_syarat: ['syarat rpl', 'persyaratan rpl', 'dokumen rpl', 'berkas rpl', 'formulir rpl', 'kelengkapan rpl'],
    rpl_tahapan: ['tahapan rpl', 'proses rpl', 'prosedur rpl', 'langkah rpl', 'alur rpl', 'mekanisme rpl'],
    rpl_kelulusan: ['lulus rpl', 'kelulusan rpl', 'hasil rpl', 'sk rpl', 'sk rekognisi', 'ijazah rpl'],
    judul_skripsi: ['judul skripsi', 'judul tugas akhir', 'cari judul', 'referensi judul', 'kasuari', 'judul skripsi akuntansi', 'judul skripsi ekonomi']
  };

  let bestKey = null;
  let maxScore = 0;

  for (const [key, keywords] of Object.entries(kbKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      const isShort = keyword.length <= 3;
      if (isShort) {
        // Exact whole-word match for short tokens to prevent collision (e.g. 'ta' in 'antar')
        const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
        if (regex.test(text)) {
          score += 3; // Give high priority to short keyword exact matches
        }
      } else {
        if (text.includes(keyword)) {
          // Add score relative to the keyword length to prioritize longer matches (e.g., 'keringanan ukt' over just 'ukt')
          score += keyword.split(' ').length;
        }
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestKey = key;
    }
  }

  // Friendly Chat / Casual Conversation Triggers (NLU Dialog flow helper)
  const chatReplies = {
    "diajak ngobrol": "Tentu saja! Saya bisa diajak mengobrol seputar layanan informasi akademik, panduan kurikulum, mata kuliah, prosedur tugas akhir, serta bantuan reset portal di Fakultas Ekonomi dan Bisnis Universitas Cenderawasih. Ada yang ingin Anda tanyakan?",
    "siapa kamu": "Saya adalah Ekobot, asisten pintar kecerdasan buatan (AI) yang siap membantu Anda dalam mendapatkan informasi akademik di Fakultas Ekonomi dan Bisnis Universitas Cenderawasih.",
    "terima kasih": "Sama-sama! Senang bisa membantu Anda. Jika ada hal lain yang ingin Anda tanyakan, silakan tulis di sini.",
    "makasih": "Sama-sama! Senang bisa membantu Anda. Jika ada hal lain yang ingin Anda tanyakan, silakan tulis di sini."
  };

  for (const [trigger, reply] of Object.entries(chatReplies)) {
    if (text.includes(trigger)) {
      return reply;
    }
  }

  // Return matching knowledge base content if above score threshold
  if (bestKey && maxScore >= 1 && kb[bestKey]) {
    return kb[bestKey];
  }

  // If no keyword matched, search the PA Uncen 2024 PDF knowledge base
  const paMatch = searchPAKnowledgeBase(messageText);
  if (paMatch) {
    // Format raw text to be more structured and readable
    let formattedRaw = paMatch.raw
      .replace(/\r\n/g, '\n')
      .replace(/\n\s*\n/g, '\n\n') // Merge excessive empty lines
      .trim();
      
    // Replace broken lines with clean lists if page contains list elements
    formattedRaw = formattedRaw.split('\n').map(line => {
      let trimmed = line.trim();
      // Ensure bullet items have a space after the dot/dash
      if (/^\([0-9]+\)/.test(trimmed)) {
        return '\n' + trimmed; // add a line break before number lists like (1), (2)
      }
      if (/^[a-z]\./i.test(trimmed)) {
        return '   ' + trimmed; // indent sublists like a., b.
      }
      return trimmed;
    }).join('\n').replace(/\n{3,}/g, '\n\n');

    return `📖 *Peraturan Akademik Universitas Cenderawasih 2024* (Halaman ${paMatch.page}):\n\n${formattedRaw}`;
  }

  return kb.fallback;
}

// Telegram Bot instance and state management
let tgBot = null;
let botStatus = 'stopped';
let currentToken = '';

// Telegram Keyboard Setup
const inlineKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📅 Kalender Akademik' }, { text: '📚 Jadwal Kuliah' }],
      [{ text: '📝 Jadwal Ujian' }, { text: '💰 Info Beasiswa' }],
      [{ text: '🎓 S1 Akuntansi' }, { text: '🎓 S1 Manajemen' }, { text: '🎓 S1 Ilmu Ekonomi' }],
      [{ text: '🎓 Tugas Akhir / Skripsi' }, { text: '🛡️ Zona Integritas' }],
      [{ text: '📞 Kontak & Lokasi' }, { text: '🔓 Reset Portal Mandiri' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Map Telegram buttons to text commands
function mapButtonTextToCommand(text) {
  if (text.includes('Kalender')) return '/kaldik';
  if (text.includes('Jadwal Kuliah')) return '/jadwalkuliah';
  if (text.includes('Jadwal Ujian')) return '/janjian';
  if (text.includes('Akuntansi')) return '/akt';
  if (text.includes('Manajemen')) return '/man';
  if (text.includes('Ilmu Ekonomi')) return '/ie';
  if (text.includes('Beasiswa')) return '/beasiswa';
  if (text.includes('Tugas Akhir')) return '/tugasakhir';
  if (text.includes('Zona Integritas')) return '/zi';
  if (text.includes('Kontak')) return '/kontak';
  if (text.includes('Reset Portal')) return '/reset_portal';
  return text;
}

// Helper to safely escape markdown characters for Telegram (v1)
function escapeMarkdown(text) {
  if (!text) return '';
  
  // Convert standard **bold** to *bold* for Telegram Markdown v1
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  // Extract markdown links to protect their URLs from escaping
  const links = [];
  formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, (match, label, url) => {
    links.push({ label, url });
    return `%%%LINKPLACEHOLDER${links.length - 1}%%%`;
  });
  
  // Escape standalone underscores that cause parse crashes
  formatted = formatted.replace(/_/g, '\\_');
  
  // Escape standalone asterisks (e.g. bullet points or unpaired stars)
  const asterisksCount = (formatted.match(/\*/g) || []).length;
  if (asterisksCount % 2 !== 0) {
    // If odd number, escape asterisks followed by spaces or at line boundaries
    formatted = formatted.replace(/\*(?=\s|$)/g, '\\*');
  }
  
  // Put links back with escaped labels but original URLs
  formatted = formatted.replace(/%%%LINKPLACEHOLDER(\d+)%%%/g, (match, idx) => {
    const link = links[parseInt(idx)];
    const escapedLabel = link.label.replace(/_/g, '\\_');
    return `[${escapedLabel}](${link.url})`;
  });
  
  return formatted;
}

function startTelegramBot(token) {
  if (tgBot) {
    stopTelegramBot();
  }

  try {
    currentToken = token;
    tgBot = new TelegramBot(token, { polling: true });
    botStatus = 'running';
    console.log('Telegram Bot successfully started.');

    // General message listener
    tgBot.on('message', (msg) => {
      const chatId = msg.chat.id;
      let cleanText = "";
      
      // IMAGE OCR PARSER FOR KHS / TRANSKRIP ANALYSIS
      if (msg.photo) {
        if (!sessions[chatId]) {
          tgBot.sendMessage(chatId, escapeMarkdown("⚠️ Silakan masukkan NIM Anda terlebih dahulu sebelum mengupload KHS/Transkrip."), {
            parse_mode: 'Markdown'
          }).catch(err => console.error(err));
          return;
        }

        const student = sessions[chatId];
        const captionText = msg.caption ? msg.caption.trim().toLowerCase() : "";
        const isVerifyingKHS = captionText.includes('sesuai') || captionText.includes('kurang') || captionText.includes('cocok') || captionText.includes('sks') || captionText.includes('nilai') || captionText === "";

        if (isVerifyingKHS) {
          tgBot.sendMessage(chatId, "⏳ *Sedang memproses gambar KHS/Transkrip Anda dengan OCR. Mohon tunggu sebentar...*", {
            parse_mode: 'Markdown'
          }).catch(err => console.error(err));

          // Get file path from Telegram
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          tgBot.getFile(fileId).then(file => {
            const fileUrl = `https://api.telegram.org/file/bot${currentToken}/${file.file_path}`;
            
            // Run Tesseract OCR on download URL
            Tesseract.recognize(fileUrl, 'ind')
              .then(({ data: { text } }) => {
                const ocrText = text.toUpperCase();
                console.log("OCR Result text size:", ocrText.length);

                // Perform Cross-Check with courses database
                const nimPrefix = student.nim.substring(0, 4);
                let cohortType = "";
                let curriculumName = "";
                let codePattern = "";

                if (nimPrefix === "2020") {
                  cohortType = "AKT";
                  curriculumName = "KKNI AKT (Khusus Angkatan 2020)";
                  codePattern = "AKT4";
                } else if (["2021", "2022", "2023", "2024", "2025"].includes(nimPrefix)) {
                  cohortType = "AKU21";
                  curriculumName = "MBKM AKU21 (Angkatan 2021 - 2025)";
                  codePattern = "AKU21";
                } else if (nimPrefix === "2026") {
                  cohortType = "AKU26";
                  curriculumName = "OBE AKU26 (Khusus Angkatan 2026)";
                  codePattern = "AKU26";
                }

                if (!cohortType || !coursesDb[cohortType]) {
                  tgBot.sendMessage(chatId, `❌ Kurikulum untuk angkatan Anda (*${student.nim}*) belum tersedia di sistem database.`, { parse_mode: 'Markdown' });
                  return;
                }

                const allCourses = coursesDb[cohortType];
                const detectedCourses = [];
                const failedCourses = []; // List of courses with grade E or 0.00
                let totalSKSDetedted = 0;

                // Match regex codes (e.g. AKT4113 or AKU21 4503)
                const codeRegex = new RegExp(codePattern + '\\s*\\d{4}', 'gi');
                const matchedCodes = ocrText.match(codeRegex) || [];
                const uniqueMatchedCodes = [...new Set(matchedCodes.map(c => c.replace(/\s+/g, '')))];

                allCourses.forEach(c => {
                  const cleanedCode = c.code.replace(/\s+/g, '');
                  if (uniqueMatchedCodes.includes(cleanedCode)) {
                    detectedCourses.push(c);
                    if (c.sks && c.sks !== "-") {
                      totalSKSDetedted += parseInt(c.sks, 10);
                    }
                  }
                });

                // Find E grade markers in text blocks
                // Usually represented as: CODE - GRADE (E or 0.00 / 0)
                const lines = ocrText.split('\n');
                lines.forEach(line => {
                  detectedCourses.forEach(c => {
                    const cleanedCode = c.code.replace(/\s+/g, '');
                    if (line.includes(cleanedCode) && (line.includes(' E ') || line.includes(' 0.00') || line.includes(' 0 ') || line.endsWith(' E') || line.endsWith(' 0.00') || line.endsWith(' 0'))) {
                      if (!failedCourses.find(f => f.code === c.code)) {
                        failedCourses.push(c);
                      }
                    }
                  });
                });

                // Calculate missing required courses
                const missingCourses = allCourses.filter(c => {
                  const cleanedCode = c.code.replace(/\s+/g, '');
                  return !uniqueMatchedCodes.includes(cleanedCode);
                });

                // Build Markdown response
                let resultMessage = `🔍 **Hasil Analisis KHS Otomatis (OCR):**\n\n` +
                                    `• **Mahasiswa**: *${student.name}* (NIM: ${student.nim})\n` +
                                    `• **Kurikulum**: *${curriculumName}*\n` +
                                    `• **Mata Kuliah Terdeteksi**: ${detectedCourses.length} Mata Kuliah (~${totalSKSDetedted} SKS)\n\n`;

                if (failedCourses.length > 0) {
                  resultMessage += `⚠️ **Mata Kuliah Belum Lulus (Nilai E / 0.00):**\n`;
                  failedCourses.forEach(c => {
                    resultMessage += `• *${c.code}* - ${c.name} (${c.sks} SKS) ❌\n`;
                  });
                  resultMessage += `\n`;
                } else {
                  resultMessage += `✅ **Mata Kuliah Bermasalah**: Tidak terdeteksi mata kuliah bernilai E / 0.00 di gambar KHS Anda.\n\n`;
                }

                if (missingCourses.length > 0) {
                  resultMessage += `📌 **Mata Kuliah Wajib yang Belum Tercantum (Belum Diprogram):**\n`;
                  // Show top 6 missing courses as example recommendation
                  missingCourses.slice(0, 6).forEach(c => {
                    resultMessage += `• *${c.code}* - ${c.name} (Sem: ${c.semester || 'Lainnya'} - ${c.sks} SKS)\n`;
                  });
                  if (missingCourses.length > 6) {
                    resultMessage += `• *Dan ${missingCourses.length - 6} mata kuliah lainnya...*\n`;
                  }
                } else {
                  resultMessage += `✅ Semua mata kuliah wajib kurikulum telah tercantum dalam transkrip Anda.\n`;
                }

                resultMessage += `\n*Catatan: Pastikan foto KHS yang Anda kirim jelas dan tidak buram untuk hasil deteksi terbaik. Harap lakukan cross-check mandiri dengan Dosen Wali Anda.*`;

                tgBot.sendMessage(chatId, escapeMarkdown(resultMessage), {
                  parse_mode: 'Markdown',
                  ...inlineKeyboard
                }).catch(err => console.error(err));
              })
              .catch(err => {
                console.error("Tesseract processing failed:", err);
                tgBot.sendMessage(chatId, "⚠️ Gagal mengekstrak data dari gambar. Pastikan kualitas gambar KHS Anda baik.");
              });
          }).catch(err => {
            console.error("Telegram download failed:", err);
            tgBot.sendMessage(chatId, "⚠️ Gagal mengunduh gambar KHS dari server Telegram.");
          });
          return;
        }
      }

      if (msg.text) {
        cleanText = msg.text.trim();
      } else if (msg.photo && msg.caption) {
        cleanText = msg.caption.trim();
      } else {
        return; 
      }
      
      const mappedText = mapButtonTextToCommand(cleanText);
      const kb = readKB();

      // Check reset / start
      if (mappedText === '/start' || mappedText.toLowerCase() === '/reset') {
        if (sessions[chatId]) {
          if (sessions[chatId].timeoutId) clearTimeout(sessions[chatId].timeoutId);
          delete sessions[chatId];
        }
        const startMessage = kb.start + "\n\n🔑 **Silakan ketik NIM Anda terlebih dahulu untuk memverifikasi data akademik Anda:**";
        tgBot.sendMessage(chatId, escapeMarkdown(startMessage), {
          parse_mode: 'Markdown'
        }).catch(err => console.error(err));
        return;
      }

      // Check if user says goodbye or close session
      if (mappedText.toLowerCase() === 'tidak' || mappedText.toLowerCase() === 'selesai' || mappedText.toLowerCase() === 'cukup') {
        if (sessions[chatId]) {
          if (sessions[chatId].timeoutId) clearTimeout(sessions[chatId].timeoutId);
          delete sessions[chatId];
          tgBot.sendMessage(chatId, escapeMarkdown("Baik, percakapan ini saya akhiri. Terima kasih telah menggunakan Ekobot! Silakan ketik /start kapan saja untuk memulai kembali."), {
            parse_mode: 'Markdown'
          }).catch(err => console.error(err));
        } else {
          tgBot.sendMessage(chatId, escapeMarkdown("Sesi Anda belum aktif. Silakan ketik NIM Anda terlebih dahulu."), {
            parse_mode: 'Markdown'
          }).catch(err => console.error(err));
        }
        return;
      }

      // Helper function to set/reset idle timeout (5 minutes)
      const resetIdleTimeout = (id) => {
        if (sessions[id].timeoutId) {
          clearTimeout(sessions[id].timeoutId);
        }
        sessions[id].timeoutId = setTimeout(() => {
          if (sessions[id]) {
            tgBot.sendMessage(id, escapeMarkdown("Apakah ada pertanyaan lain yang ingin Anda tanyakan? (Ketik *Tidak* untuk mengakhiri percakapan)."), {
              parse_mode: 'Markdown'
            }).catch(err => console.error(err));
            
            // Set another short timeout to auto-close if still no answer (e.g. 1 minute)
            clearTimeout(sessions[id].timeoutId);
            sessions[id].timeoutId = setTimeout(() => {
              if (sessions[id]) {
                delete sessions[id];
                tgBot.sendMessage(id, escapeMarkdown("Karena tidak ada respon lanjutan, percakapan ini otomatis saya akhiri. Terima kasih!"), {
                  parse_mode: 'Markdown'
                }).catch(err => console.error(err));
              }
            }, 60000);
          }
        }, 300000); // 5 minutes
      };

      // STRICT ROUTING: Check if cleanText is a NIM (numerical, ~13 digits)
      const isNIMFormat = /^\d{10,15}$/.test(cleanText);

      if (isNIMFormat) {
        // If a NIM is entered, always verify/re-verify the student
        const student = studentsDb[cleanText];
        if (student) {
          if (sessions[chatId] && sessions[chatId].timeoutId) {
            clearTimeout(sessions[chatId].timeoutId);
          }
          // Store student session
          sessions[chatId] = student;
          resetIdleTimeout(chatId);
          const welcomeMessage = `🟢 **Data Terverifikasi!**\n\nHalo **${student.name}**!\nAnda terdaftar sebagai mahasiswa **${student.prodi}**.\n\nStatus Mahasiswa: **${student.status}**\n\n🔗 *Konfirmasi status resmi PDDikti dapat dicek melalui:* [Pencarian Spesifik PDDikti](https://pddikti.kemdiktisaintek.go.id)\n\n**Layanan Apa yang kamu inginkan?**`;
          tgBot.sendMessage(chatId, escapeMarkdown(welcomeMessage), {
            parse_mode: 'Markdown',
            ...inlineKeyboard
          }).catch(err => console.error(err));
        } else {
          tgBot.sendMessage(chatId, escapeMarkdown("⚠️ NIM Anda tidak ditemukan dalam database FEB UNCEN. Harap periksa kembali NIM yang Anda masukkan."), {
            parse_mode: 'Markdown'
          }).catch(err => console.error(err));
        }
        return;
      }

      // Check if session exists (NIM already verified)
      if (!sessions[chatId]) {
        // Since it's not a NIM and no session is active, prompt to enter NIM first
        tgBot.sendMessage(chatId, escapeMarkdown("⚠️ Sebelum memulai tanya jawab, silakan masukkan NIM Anda terlebih dahulu untuk memverifikasi data akademik Anda."), {
          parse_mode: 'Markdown'
        }).catch(err => console.error(err));
      } else {
        // Logged in: reset idle timeout
        resetIdleTimeout(chatId);

        // Respond to queries
        if (mappedText.toLowerCase() === '/reset_portal' || mappedText.toLowerCase() === 'reset portal' || mappedText.toLowerCase() === 'reset password') {
          const student = sessions[chatId];
          const isStatus7 = student.status.includes('Status: 7') || student.status.toLowerCase().includes('aktif');
          const isStatus4 = student.status.includes('Status: 4') || student.status.toLowerCase().includes('non-aktif');
          const inEvaluasi = dataEvaluasiDb.includes(student.nim);

          let eligibilityStatus = 'BELUM_LAYAK';
          let reason = '';

          if (isStatus7) {
            if (inEvaluasi) {
              eligibilityStatus = 'LAYAK_DENGAN_KONFIRMASI';
            } else {
              eligibilityStatus = 'LAYAK';
            }
          } else if (isStatus4) {
            if (inEvaluasi) {
              eligibilityStatus = 'BELUM_LAYAK';
              reason += `• Status Anda: *${student.status}* (Non-Aktif) dan nama Anda terdaftar dalam daftar evaluasi mahasiswa akademik.\n`;
            } else {
              eligibilityStatus = 'LAYAK';
            }
          } else {
            eligibilityStatus = 'BELUM_LAYAK';
            reason += `• Status PDDikti Anda: *${student.status}* (Bukan Aktif/Non-Aktif).\n`;
          }

          if (eligibilityStatus === 'LAYAK') {
            const successMessage = `🔓 **Hasil Pengecekan Kelayakan Reset Portal:**\n\n` +
                                   `• **Nama**: ${student.name}\n` +
                                   `• **NIM**: ${student.nim}\n` +
                                   `• **Status PDDikti**: ${student.status}\n\n` +
                                   `✅ **Status**: *LAYAK RESET PORTAL*\n\n` +
                                   `Akun SIAKAD Anda telah diaktifkan kembali. Silakan gunakan kredensial berikut untuk login ke portal:\n` +
                                   `• **Username**: ${student.nim}\n` +
                                   `• **Password**: ${student.nim}\n\n` +
                                   `Apakah ada informasi lain yang ingin Anda tanyakan?`;
            tgBot.sendMessage(chatId, escapeMarkdown(successMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          } else if (eligibilityStatus === 'LAYAK_DENGAN_KONFIRMASI') {
            const confirmMessage = `⚠️ **Hasil Pengecekan Kelayakan Reset Portal:**\n\n` +
                                   `• **Nama**: ${student.name}\n` +
                                   `• **NIM**: ${student.nim}\n` +
                                   `• **Status PDDikti**: ${student.status}\n\n` +
                                   `🔶 **Status**: *LAYAK DENGAN KONFIRMASI*\n\n` +
                                   `Akun SIAKAD Anda dapat diaktifkan kembali secara otomatis. Namun, karena NIM Anda terdaftar dalam daftar evaluasi akademik program studi, silakan pastikan untuk menunjukkan capture/tautan bukti aktif PDDIKTI Anda ke dosen wali atau operator program studi saat registrasi fisik.\n\n` +
                                   `Berikut kredensial login portal Anda:\n` +
                                   `• **Username**: ${student.nim}\n` +
                                   `• **Password**: ${student.nim}\n\n` +
                                   `🔗 *Tautan verifikasi status PDDIKTI:* [Pencarian PDDIKTI](https://pddikti.kemdiktisaintek.go.id)\n\n` +
                                   `Apakah ada informasi lain yang ingin Anda tanyakan?`;
            tgBot.sendMessage(chatId, escapeMarkdown(confirmMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          } else {
            const denyMessage = `⚠️ **Hasil Pengecekan Kelayakan Reset Portal:**\n\n` +
                                 `• **Nama**: ${student.name}\n` +
                                 `• **NIM**: ${student.nim}\n\n` +
                                 `❌ **Status**: *BELUM LAYAK RESET OTOMATIS*\n\n` +
                                 `**Alasan:**\n${reason}\n` +
                                 `Silakan datang langsung ke bagian Operator SIAKAD Program Studi untuk melakukan pemeriksaan manual lebih lanjut.\n\n` +
                                 `Apakah ada informasi lain yang ingin Anda tanyakan?`;
            tgBot.sendMessage(chatId, escapeMarkdown(denyMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          }
          return;
        }

        // Custom Check for "Dosen Wali / Pembimbing Akademik" casual question
        const cleanMsg = cleanText.toLowerCase();
        if (cleanMsg.includes('dosen wali') || cleanMsg.includes('pembimbing akademik') || cleanMsg.includes('dosen pembimbing akademik') || cleanMsg.includes('dosen pembimbing') || cleanMsg.includes('dosen pa')) {
          const student = sessions[chatId];
          const record = dosenWaliDb[student.nim];
          if (record && record.dosen_wali) {
            const advisorMessage = `🎓 **Informasi Pembimbing Akademik / Dosen Wali:**\n\nHalo *${student.name}*!\nBerdasarkan data relasi bimbingan akademik, Dosen Wali (Pembimbing Akademik) Anda adalah:\n\n👉 **${record.dosen_wali}**\n\nSilakan menghubungi beliau untuk keperluan konsultasi rencana studi atau bimbingan akademik lainnya. Ada hal lain yang bisa saya bantu?`;
            tgBot.sendMessage(chatId, escapeMarkdown(advisorMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          } else {
            const unknownAdvisorMessage = `🎓 **Informasi Pembimbing Akademik / Dosen Wali:**\n\nHalo *${student.name}*!\nData Dosen Wali Anda belum terdaftar dalam sistem bimbingan akademik kami.\n\nSilakan berkoordinasi langsung dengan Operator SIAKAD Program Studi Anda untuk pengecekan data relasi dosen wali lebih lanjut. Apakah ada hal lain yang ingin Anda tanyakan?`;
            tgBot.sendMessage(chatId, escapeMarkdown(unknownAdvisorMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          }
          return;
        }

        // Custom Check for "Struktur Kurikulum / Daftar Mata Kuliah / Data Kurikulum"
        if (cleanMsg.includes('mata kuliah') || cleanMsg.includes('struktur kurikulum') || cleanMsg.includes('data kurikulum') || cleanMsg.includes('kurikulum')) {
          const student = sessions[chatId];
          const nimPrefix = student.nim.substring(0, 4);
          let cohortType = "";
          let curriculumName = "";
          
          if (nimPrefix === "2020") {
            cohortType = "AKT";
            curriculumName = "KKNI AKT (Berlaku untuk Angkatan 2020)";
          } else if (["2021", "2022", "2023", "2024", "2025"].includes(nimPrefix)) {
            cohortType = "AKU21";
            curriculumName = "MBKM AKU21 (Berlaku untuk Angkatan 2021 - 2025)";
          } else if (nimPrefix === "2026") {
            cohortType = "AKU26";
            curriculumName = "OBE AKU26 (Berlaku khusus untuk Angkatan 2026)";
          }
          
          if (cohortType && coursesDb[cohortType]) {
            const listMataKuliah = coursesDb[cohortType];
            
            // Group courses by semester
            const grouped = {};
            listMataKuliah.forEach(course => {
              const sem = course.semester || "Lain-lain";
              if (!grouped[sem]) grouped[sem] = [];
              grouped[sem].push(`• \`${course.code}\` - ${course.name} (${course.sks} SKS)`);
            });
            
            let messageResponse = `📚 **Kurikulum & Daftar Mata Kuliah S1 Akuntansi**\n\nHalo *${student.name}*!\nBerdasarkan NIM Anda (*${student.nim}*), Anda menggunakan kurikulum:\n👉 **${curriculumName}**\n\nBerikut daftar mata kuliah lengkap Anda:\n`;
            
            for (const [sem, courses] of Object.entries(grouped)) {
              messageResponse += `\n📖 **${sem}**:\n` + courses.join('\n') + `\n`;
            }
            
            messageResponse += `\nAda hal lain yang bisa saya bantu?`;
            
            tgBot.sendMessage(chatId, escapeMarkdown(messageResponse), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          } else {
            const fallbackMessage = `📚 **Kurikulum & Daftar Mata Kuliah**\n\nHalo *${student.name}*!\nMohon maaf, kurikulum resmi untuk angkatan NIM Anda (*${student.nim}*) belum tersedia dalam sistem kami. Silakan hubungi bagian administrasi program studi Anda.`;
            tgBot.sendMessage(chatId, escapeMarkdown(fallbackMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          }
          return;
        }

        // Custom Check for comparing student's curriculum "apakah sudah sesuai"
        if (cleanMsg.includes('sudah sesuai') || cleanMsg.includes('apakah sesuai') || cleanMsg.includes('apakah ini sesuai') || cleanMsg.includes('apakah sudah sesuai') || cleanMsg.includes('kecocokan') || cleanMsg.includes('cek kesesuaian') || cleanMsg.includes('kurang mata kuliah') || cleanMsg.includes('belum tercantum')) {
          const student = sessions[chatId];
          const nimPrefix = student.nim.substring(0, 4);
          let cohortType = "";
          let curriculumName = "";
          let codePattern = "";
          
          if (nimPrefix === "2020") {
            cohortType = "AKT";
            curriculumName = "KKNI AKT (Khusus Angkatan 2020)";
            codePattern = "AKT xxx";
          } else if (["2021", "2022", "2023", "2024", "2025"].includes(nimPrefix)) {
            cohortType = "AKU21";
            curriculumName = "MBKM AKU21 (Angkatan 2021 - 2025)";
            codePattern = "AKU21 xxx";
          } else if (nimPrefix === "2026") {
            cohortType = "AKU26";
            curriculumName = "OBE AKU26 (Khusus Angkatan 2026)";
            codePattern = "AKU26 xxx";
          }

          if (cohortType && coursesDb[cohortType]) {
            const allCourses = coursesDb[cohortType];
            
            // To simulate what has NOT been taken, we check which semester courses are missing.
            // Since we don't have active OCR running in node-telegram-bot-api, we can show which courses are required for their curriculum,
            // and explicitly guide them on the critical courses per semester (specifically Semesters 1 to 8).
            // But let's build a smart responder that list down key core courses.
            
            let responseText = `🔍 **Analisis Kesesuaian Kurikulum & NIM Anda:**\n\nHalo *${student.name}*!\n\nBerdasarkan NIM Anda (*${student.nim}*), Anda terdaftar pada **Angkatan ${nimPrefix}** menggunakan kurikulum **${curriculumName}**.\n\nSesuai standar transkrip kurikulum tersebut, format kode mata kuliah wajib Anda harus diawali dengan \`${codePattern}\`.\n\n📌 **Mata Kuliah Utama yang Harus Dipenuhi (1-8 Semester):**\n`;
            
            // Group courses by semester
            const semGroups = {};
            allCourses.forEach(c => {
              if (!semGroups[c.semester]) semGroups[c.semester] = [];
              semGroups[c.semester].push(c);
            });
            
            // Print critical core courses for verification
            for (const [sem, list] of Object.entries(semGroups)) {
              const core = list.slice(0, 3).map(c => `• \`${c.code}\` - ${c.name}`).join('\n');
              responseText += `\n📖 *${sem}* (Contoh Wajib):\n${core}\n`;
            }
            
            responseText += `\n⚠️ **Cara Pengecekan Mandiri Kesesuaian KHS:**\n` +
                            `1. Pastikan tidak ada mata kuliah berstatus \`0.00 / E\` (seperti Pendidikan Agama/Etno Papua pada KHS).\n` +
                            `2. Jika ada kode selain \`${codePattern}\` (kecuali mata kuliah pilihan/MBKM khusus), silakan konfirmasi ke Dosen Wali Anda untuk penyesuaian konversi nilai.\n\nApakah ada hal lain yang ingin Anda tanyakan?`;

            tgBot.sendMessage(chatId, escapeMarkdown(responseText), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          } else {
            const fallbackMessage = `📚 **Kurikulum & Kesesuaian**\n\nHalo *${student.name}*!\nKurikulum untuk angkatan Anda (*${student.nim}*) belum terdaftar di sistem.`;
            tgBot.sendMessage(chatId, escapeMarkdown(fallbackMessage), {
              parse_mode: 'Markdown',
              ...inlineKeyboard
            }).catch(err => console.error(err));
          }
          return;
        }

        const response = findResponse(mappedText, kb);
        tgBot.sendMessage(chatId, escapeMarkdown(response), {
          parse_mode: 'Markdown',
          ...inlineKeyboard
        }).catch(err => {
          console.error('Error sending message:', err.message);
        });
      }
    });

    // Error listener
    tgBot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error.message);
    });

  } catch (err) {
    console.error('Failed to start Telegram Bot:', err);
    botStatus = 'stopped';
    currentToken = '';
    throw err;
  }
}

function stopTelegramBot() {
  if (tgBot) {
    try {
      tgBot.removeAllListeners('message');
      tgBot.removeAllListeners('polling_error');
    } catch (e) {
      console.error('Error removing listeners:', e);
    }
    try {
      tgBot.stopPolling();
    } catch (e) {
      console.error('Error stopping polling:', e);
    }
    tgBot = null;
    botStatus = 'stopped';
    currentToken = '';
    console.log('Telegram Bot polling stopped and listeners cleared.');
  }
}

// --- API ENDPOINTS ---

// Get Knowledge Base
app.get('/api/kb', (req, res) => {
  res.json(readKB());
});

// Update Knowledge Base
app.post('/api/kb', (req, res) => {
  const newKB = req.body;
  if (writeKB(newKB)) {
    res.json({ success: true, message: 'Knowledge Base updated successfully.' });
  } else {
    res.status(500).json({ success: false, message: 'Failed to update Knowledge Base.' });
  }
});

// Simulated Chat (Offline Simulator)
app.post('/api/chat', (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message content is required.' });
  }
  const kb = readKB();

  if (message === '/start' || message === '/reset') {
    delete sessions[sessionId];
    return res.json({ response: kb.start, askForNIM: true });
  }

  if (!sessions[sessionId]) {
    const student = studentsDb[message.trim()];
    if (student) {
      sessions[sessionId] = student;
      return res.json({ 
        response: `🟢 **Data Terverifikasi!**\n\nHalo **${student.name}**!\nAnda terdaftar sebagai mahasiswa **${student.prodi}**.\n\nStatus Mahasiswa: **${student.status}**\n\n🔗 *Konfirmasi status resmi PDDikti dapat dicek melalui:* [Pencarian Spesifik PDDikti](https://pddikti.kemdiktisaintek.go.id)\n\n**Layanan Apa yang kamu inginkan?**`, 
        askForNIM: false,
        showMenu: true
      });
    } else {
      return res.json({ 
        response: "⚠️ NIM Anda tidak ditemukan dalam database FEB UNCEN. Harap periksa kembali NIM yang Anda masukkan.", 
        askForNIM: true 
      });
    }
  }

  const response = (() => {
    const cleanMsg = message.trim().toLowerCase();

    // Reset Portal check
    if (cleanMsg === '/reset_portal' || cleanMsg === 'reset portal' || cleanMsg === 'reset password') {
      const student = sessions[sessionId];
      const isStatus7 = student.status.includes('Status: 7') || student.status.toLowerCase().includes('aktif');
      const isStatus4 = student.status.includes('Status: 4') || student.status.toLowerCase().includes('non-aktif');
      const inEvaluasi = dataEvaluasiDb.includes(student.nim);

      let eligibilityStatus = 'BELUM_LAYAK';
      let reason = '';

      if (isStatus7) {
        if (inEvaluasi) {
          eligibilityStatus = 'LAYAK_DENGAN_KONFIRMASI';
        } else {
          eligibilityStatus = 'LAYAK';
        }
      } else if (isStatus4) {
        if (inEvaluasi) {
          eligibilityStatus = 'BELUM_LAYAK';
          reason += `• Status Anda: *${student.status}* (Non-Aktif) dan nama Anda terdaftar dalam daftar evaluasi mahasiswa akademik.\n`;
        } else {
          eligibilityStatus = 'LAYAK';
        }
      } else {
        eligibilityStatus = 'BELUM_LAYAK';
        reason += `• Status PDDikti Anda: *${student.status}* (Bukan Aktif/Non-Aktif).\n`;
      }

      if (eligibilityStatus === 'LAYAK') {
        return `🔓 **Hasil Pengecekan Kelayakan Reset Portal:**\n\n` +
               `• **Nama**: ${student.name}\n` +
               `• **NIM**: ${student.nim}\n` +
               `• **Status PDDikti**: ${student.status}\n\n` +
               `✅ **Status**: *LAYAK RESET PORTAL*\n\n` +
               `Akun SIAKAD Anda telah diaktifkan kembali. Silakan gunakan kredensial berikut untuk login ke portal:\n` +
               `• **Username**: ${student.nim}\n` +
               `• **Password**: ${student.nim}\n\n` +
               `Apakah ada informasi lain yang ingin Anda tanyakan?`;
      } else if (eligibilityStatus === 'LAYAK_DENGAN_KONFIRMASI') {
        return `⚠️ **Hasil Pengecekan Kelayakan Reset Portal:**\n\n` +
               `• **Nama**: ${student.name}\n` +
               `• **NIM**: ${student.nim}\n` +
               `• **Status PDDikti**: ${student.status}\n\n` +
               `🔶 **Status**: *LAYAK DENGAN KONFIRMASI*\n\n` +
               `Akun SIAKAD Anda dapat diaktifkan kembali secara otomatis. Namun, karena NIM Anda terdaftar dalam daftar evaluasi akademik program studi, silakan pastikan untuk menunjukkan capture/tautan bukti aktif PDDIKTI Anda ke dosen wali atau operator program studi saat registrasi fisik.\n\n` +
               `Berikut kredensial login portal Anda:\n` +
               `• **Username**: ${student.nim}\n` +
               `• **Password**: ${student.nim}\n\n` +
               `🔗 *Tautan verifikasi status PDDIKTI:* [Pencarian PDDIKTI](https://pddikti.kemdiktisaintek.go.id)\n\n` +
               `Apakah ada informasi lain yang ingin Anda tanyakan?`;
      } else {
        return `⚠️ **Hasil Pengecekan Kelayakan Reset Portal:**\n\n` +
               `• **Nama**: ${student.name}\n` +
               `• **NIM**: ${student.nim}\n\n` +
               `❌ **Status**: *BELUM LAYAK RESET PORTAL*\n\n` +
               `**Alasan:**\n${reason}\n` +
               `Silakan datang langsung ke bagian Operator SIAKAD Program Studi untuk melakukan pemeriksaan manual lebih lanjut.\n\n` +
               `Apakah ada informasi lain yang ingin Anda tanyakan?`;
      }
    }

    // Dosen Wali check
    if (cleanMsg.includes('dosen wali') || cleanMsg.includes('pembimbing akademik') || cleanMsg.includes('dosen pembimbing akademik') || cleanMsg.includes('dosen pembimbing') || cleanMsg.includes('dosen pa')) {
      const student = sessions[sessionId];
      const record = dosenWaliDb[student.nim];
      if (record && record.dosen_wali) {
        return `🎓 **Informasi Pembimbing Akademik / Dosen Wali:**\n\nHalo *${student.name}*!\nBerdasarkan data relasi bimbingan akademik, Dosen Wali (Pembimbing Akademik) Anda adalah:\n\n👉 **${record.dosen_wali}**\n\nSilakan menghubungi beliau untuk keperluan konsultasi rencana studi atau bimbingan akademik lainnya. Ada hal lain yang bisa saya bantu?`;
      } else {
        return `🎓 **Informasi Pembimbing Akademik / Dosen Wali:**\n\nHalo *${student.name}*!\nData Dosen Wali Anda belum terdaftar dalam sistem bimbingan akademik kami.\n\nSilakan berkoordinasi langsung dengan Operator SIAKAD Program Studi Anda untuk pengecekan data relasi dosen wali lebih lanjut. Apakah ada hal lain yang ingin Anda tanyakan?`;
      }
    }

    // Curriculum Check
    if (cleanMsg.includes('mata kuliah') || cleanMsg.includes('struktur kurikulum') || cleanMsg.includes('data kurikulum') || cleanMsg.includes('kurikulum')) {
      const student = sessions[sessionId];
      const nimPrefix = student.nim.substring(0, 4);
      let cohortType = "";
      let curriculumName = "";
      
      if (nimPrefix === "2020") {
        cohortType = "AKT";
        curriculumName = "KKNI AKT (Berlaku untuk Angkatan 2020)";
      } else if (["2021", "2022", "2023", "2024", "2025"].includes(nimPrefix)) {
        cohortType = "AKU21";
        curriculumName = "MBKM AKU21 (Berlaku untuk Angkatan 2021 - 2025)";
      } else if (nimPrefix === "2026") {
        cohortType = "AKU26";
        curriculumName = "OBE AKU26 (Berlaku khusus untuk Angkatan 2026)";
      }
      
      if (cohortType && coursesDb[cohortType]) {
        const listMataKuliah = coursesDb[cohortType];
        const grouped = {};
        listMataKuliah.forEach(course => {
          const sem = course.semester || "Lain-lain";
          if (!grouped[sem]) grouped[sem] = [];
          grouped[sem].push(`• \`${course.code}\` - ${course.name} (${course.sks} SKS)`);
        });
        
        let msgRes = `📚 **Kurikulum & Daftar Mata Kuliah S1 Akuntansi**\n\nHalo *${student.name}*!\nBerdasarkan NIM Anda (*${student.nim}*), Anda menggunakan kurikulum:\n👉 **${curriculumName}**\n\nBerikut daftar mata kuliah lengkap Anda:\n`;
        for (const [sem, courses] of Object.entries(grouped)) {
          msgRes += `\n📖 **${sem}**:\n` + courses.join('\n') + `\n`;
        }
        msgRes += `\nAda hal lain yang bisa saya bantu?`;
        return msgRes;
      } else {
        return `📚 **Kurikulum & Daftar Mata Kuliah**\n\nHalo *${student.name}*!\nMohon maaf, kurikulum resmi untuk angkatan NIM Anda (*${student.nim}*) belum tersedia dalam sistem kami. Silakan hubungi bagian administrasi program studi Anda.`;
      }
    }

    // Comparison Check
    if (cleanMsg.includes('sudah sesuai') || cleanMsg.includes('apakah sesuai') || cleanMsg.includes('apakah ini sesuai') || cleanMsg.includes('apakah sudah sesuai') || cleanMsg.includes('kecocokan') || cleanMsg.includes('cek kesesuaian') || cleanMsg.includes('kurang mata kuliah') || cleanMsg.includes('belum tercantum')) {
      const student = sessions[sessionId];
      const nimPrefix = student.nim.substring(0, 4);
      let cohortType = "";
      let curriculumName = "";
      let codePattern = "";
      
      if (nimPrefix === "2020") {
        cohortType = "AKT";
        curriculumName = "KKNI AKT (Khusus Angkatan 2020)";
        codePattern = "AKT xxx";
      } else if (["2021", "2022", "2023", "2024", "2025"].includes(nimPrefix)) {
        cohortType = "AKU21";
        curriculumName = "MBKM AKU21 (Angkatan 2021 - 2025)";
        codePattern = "AKU21 xxx";
      } else if (nimPrefix === "2026") {
        cohortType = "AKU26";
        curriculumName = "OBE AKU26 (Khusus Angkatan 2026)";
        codePattern = "AKU26 xxx";
      }

      if (cohortType && coursesDb[cohortType]) {
        const allCourses = coursesDb[cohortType];
        let responseText = `🔍 **Analisis Kesesuaian Kurikulum & NIM Anda:**\n\nHalo *${student.name}*!\n\nBerdasarkan NIM Anda (*${student.nim}*), Anda terdaftar pada **Angkatan ${nimPrefix}** menggunakan kurikulum **${curriculumName}**.\n\nSesuai standar transkrip kurikulum tersebut, format kode mata kuliah wajib Anda harus diawali dengan \`${codePattern}\`.\n\n📌 **Mata Kuliah Utama yang Harus Dipenuhi (1-8 Semester):**\n`;
        
        const semGroups = {};
        allCourses.forEach(c => {
          if (!semGroups[c.semester]) semGroups[c.semester] = [];
          semGroups[c.semester].push(c);
        });
        
        for (const [sem, list] of Object.entries(semGroups)) {
          const core = list.slice(0, 3).map(c => `• \`${c.code}\` - ${c.name}`).join('\n');
          responseText += `\n📖 *${sem}* (Contoh Wajib):\n${core}\n`;
        }
        
        responseText += `\n⚠️ **Cara Pengecekan Mandiri Kesesuaian KHS:**\n` +
                        `1. Pastikan tidak ada mata kuliah berstatus \`0.00 / E\` (seperti Pendidikan Agama/Etno Papua pada KHS).\n` +
                        `2. Jika ada kode selain \`${codePattern}\` (kecuali mata kuliah pilihan/MBKM khusus), silakan konfirmasi ke Dosen Wali Anda untuk penyesuaian konversi nilai.\n\nApakah ada hal lain yang ingin Anda tanyakan?`;
        return responseText;
      } else {
        return `📚 **Kurikulum & Kesesuaian**\n\nHalo *${student.name}*!\nKurikulum untuk angkatan Anda (*${student.nim}*) belum terdaftar di sistem.`;
      }
    }

    // Default Fallback
    return findResponse(message, kb);
  })();

  res.json({ response, askForNIM: false });
});

// Get Bot Status
app.get('/api/bot/status', (req, res) => {
  res.json({ status: botStatus, hasToken: !!currentToken, tokenMasked: currentToken ? `${currentToken.substring(0, 6)}...${currentToken.substring(currentToken.length - 4)}` : '' });
});

// Control Bot (Start/Stop)
app.post('/api/bot/control', (req, res) => {
  const { action, token } = req.body;
  
  if (action === 'start') {
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required.' });
    }
    try {
      startTelegramBot(token);
      res.json({ success: true, status: botStatus });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  } else if (action === 'stop') {
    stopTelegramBot();
    res.json({ success: true, status: botStatus });
  } else {
    res.status(400).json({ success: false, message: 'Invalid action.' });
  }
});

// Start web server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  
  // Auto-start Telegram Bot if token is present in .env
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      console.log('Auto-starting Telegram Bot from .env token...');
      startTelegramBot(process.env.TELEGRAM_BOT_TOKEN);
    } catch (err) {
      console.error('Failed to auto-start Telegram Bot:', err.message);
    }
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  stopTelegramBot();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopTelegramBot();
  process.exit(0);
});
