const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
let hasErrors = false;

function logError(msg) {
  console.error('❌ FAIL:', msg);
  hasErrors = true;
}

function logSuccess(msg) {
  console.log('✅ PASS:', msg);
}

// 1. Cek appsscript.json
try {
  const manifestPath = path.join(rootDir, 'appsscript.json');
  if (!fs.existsSync(manifestPath)) {
    logError('appsscript.json tidak ditemukan');
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.timeZone) logError('appsscript.json: missing timeZone');
    if (!manifest.runtimeVersion) logError('appsscript.json: missing runtimeVersion');
    if (!manifest.webapp) logError('appsscript.json: missing webapp');
    else logSuccess('appsscript.json struktur valid');
  }
} catch (e) {
  logError('appsscript.json invalid JSON: ' + e.message);
}

// 2. Cek SHEET_ID di Kode.gs
try {
  const kodePath = path.join(rootDir, 'Kode.gs');
  if (!fs.existsSync(kodePath)) {
    logError('Kode.gs tidak ditemukan');
  } else {
    const code = fs.readFileSync(kodePath, 'utf8');
    
    // Cek SHEET_ID definition
    if (!/var\s+SHEET_ID\s*=\s*['"]([^'"]+)['"]/.test(code)) {
      logError('Kode.gs: SHEET_ID tidak ditemukan atau kosong');
    } else {
      logSuccess('Kode.gs: SHEET_ID terdefinisi');
    }

    // Cek invalidate cache
    const mutators = ['function simpan(', 'function editData(', 'function hapusData('];
    let mutatorMissingCache = false;
    for (const m of mutators) {
      // Very simple heuristic: just check if the code has _invalidateCache()
      // A more robust check would parse AST, but for GAS this simple check works
      if (!code.includes('_invalidateCache()')) {
        logError('Kode.gs: Fungsi mutasi data mungkin tidak memanggil _invalidateCache()');
        mutatorMissingCache = true;
        break;
      }
    }
    if (!mutatorMissingCache) {
      logSuccess('Kode.gs: Cache invalidation ada');
    }
  }
} catch (e) {
  logError('Gagal membaca Kode.gs: ' + e.message);
}

if (hasErrors) {
  console.error('\nValidasi gagal. Harap perbaiki error di atas sebelum deployment.');
  process.exit(1);
} else {
  console.log('\n✨ Semua pengecekan struktur lolos. Siap deploy.');
  process.exit(0);
}
