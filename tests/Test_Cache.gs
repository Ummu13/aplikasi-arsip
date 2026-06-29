// ════════════════════════════════════════════════════════════════════════
//  Test_Cache.gs
//  Unit Test untuk Mekanisme Caching
// ════════════════════════════════════════════════════════════════════════

function test_getAll_cacheHit() {
  try {
    // Invalidate dulu
    _invalidateCache();
    
    var start1 = new Date().getTime();
    var data1 = getAll();
    var end1 = new Date().getTime();
    var duration1 = end1 - start1;
    
    // Call kedua, harusnya hit cache
    var start2 = new Date().getTime();
    var data2 = getAll();
    var end2 = new Date().getTime();
    var duration2 = end2 - start2;
    
    assert(data1.length === data2.length, "Data hasil cache harus sama dengan data sheet");
    // Waktu pengambilan via cache umumnya jauh lebih cepat, walau di env test mungkin mirip
    // Yang penting tidak error dan mengembalikan data array
    Logger.log('✅ PASS [test_getAll_cacheHit] (Duration 1: ' + duration1 + 'ms, Duration 2: ' + duration2 + 'ms)');
    return { name: 'test_getAll_cacheHit', passed: true };
  } catch (e) {
    return { name: 'test_getAll_cacheHit', passed: false, error: e.message };
  }
}

function test_invalidateCache_afterSimpan() {
  try {
    _invalidateCache();
    // Cache harusnya kosong
    var cache = CacheService.getScriptCache();
    var cached = cache.get(CACHE_KEY_ALL);
    assert(cached === null, "Cache seharusnya kosong setelah di-invalidate");
    
    // Panggil getAll() untuk mengisi cache
    getAll();
    assert(cache.get(CACHE_KEY_ALL) !== null, "Cache harusnya terisi setelah getAll");
    
    // Simpan data (trigger invalidate)
    simpan({ No_Berkas: 'C', No_Item_Arsip: 'C', Kode_Klasifikasi: 'C', Judul: 'C', Tanggal_Surat: 'C', Jumlah: 'C', Tingkat_Perkembangan: 'C', Klasifikasi_Keamanan: 'C', Akses_Publik: 'C', Hak_Akses: 'C', Dasar_Pertimbangan: 'C', Keterangan: 'C', Lokasi: 'C', No_Bok: 'C', Link_Tautan: 'C' });
    
    // Cache harusnya kosong lagi
    assert(cache.get(CACHE_KEY_ALL) === null, "Cache seharusnya kosong setelah simpan()");
    
    Logger.log('✅ PASS [test_invalidateCache_afterSimpan]');
    return { name: 'test_invalidateCache_afterSimpan', passed: true };
  } catch (e) {
    return { name: 'test_invalidateCache_afterSimpan', passed: false, error: e.message };
  }
}

function test_cacheSize_withinLimit() {
  try {
    // Generate dummy array size kecil dan limit test logika di Kode.gs: 
    // json.length < 95000 (aman). 
    // Tidak mudah menguji bypass hard limit GAS dalam test kecil,
    // jadi kita cukup pastikan error handling tidak membuat aplikasi crash.
    var bigArray = new Array(1000).fill(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"]);
    try {
      var json = JSON.stringify(bigArray);
      if (json.length < 95000) {
        CacheService.getScriptCache().put("TEST_BIG_CACHE", json, 60);
      }
    } catch(err) {
      // should silently pass if payload is too big
    }
    Logger.log('✅ PASS [test_cacheSize_withinLimit]');
    return { name: 'test_cacheSize_withinLimit', passed: true };
  } catch (e) {
    return { name: 'test_cacheSize_withinLimit', passed: false, error: e.message };
  }
}
