const fs = require('fs');

// Daftar file web/sistem yang BUKAN bagian dari patch Discord
const ignoreList = [
  "index.html",
  "index.js",
  "package.json",
  "package-lock.json",
  "manifest.json",
  "generate_manifest.js"
];

// Membaca semua isi direktori saat ini
const allFiles = fs.readdirSync('./');

// Memfilter file agar hanya file patch yang masuk ke daftar
const patchFiles = allFiles.filter(file => {
  // Pastikan yang dibaca adalah file (bukan folder seperti .vercel atau .git)
  const isFile = fs.statSync(file).isFile();
  // Pastikan nama file tidak ada di dalam ignoreList
  const isNotIgnored = !ignoreList.includes(file);
  
  return isFile && isNotIgnored;
});

// Menulis hasilnya ke dalam manifest.json
fs.writeFileSync('manifest.json', JSON.stringify(patchFiles, null, 2));
console.log("manifest.json berhasil di-generate secara otomatis!");