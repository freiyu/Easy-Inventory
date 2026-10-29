# Panduan Instalasi EZI Inventory

Panduan ini untuk orang yang memasang EZI di **satu PC host** di kantor. PC lain, laptop, dan HP cukup membuka EZI di browser (lihat [USER-ACCESS.md](USER-ACCESS.md)).

## 1. Yang dibutuhkan

- PC dengan Windows 10 atau Windows 11 (64-bit), yang biasanya menyala selama jam kerja.
- Akun Windows dengan hak **Administrator** (installer meminta izin sekali).
- Ruang kosong sekitar 1 GB.
- Tidak perlu memasang Node.js, MySQL, Git, atau program lain. Semuanya sudah ada di dalam installer.

## 2. Unduh installer

1. Buka halaman **Releases** proyek EZI di GitHub (tidak perlu akun).
2. Unduh `EZI-Setup-x.y.z.exe` (x.y.z adalah nomor versi) dan `SHA256SUMS.txt`.
3. (Disarankan) Cek file tidak rusak atau diubah orang lain. Buka PowerShell di folder Downloads, lalu jalankan:

   ```powershell
   Get-FileHash .\EZI-Setup-x.y.z.exe -Algorithm SHA256
   ```

   Angka yang muncul harus sama persis dengan baris `EZI-Setup-x.y.z.exe` di `SHA256SUMS.txt`. Kalau berbeda, jangan dipasang; unduh ulang.

## 3. Peringatan Windows SmartScreen dan antivirus

Installer EZI tidak ditandatangani dengan sertifikat berbayar, jadi Windows bisa menampilkan **"Windows protected your PC"** atau **"Unknown publisher"**. Ini wajar untuk program kecil yang tidak membeli sertifikat.

1. Pastikan file berasal dari halaman Releases EZI dan SHA-256-nya cocok (langkah 2.3).
2. Klik **More info** (Info selengkapnya).
3. Klik **Run anyway** (Tetap jalankan).

Jika antivirus memblokir file, periksa ulang SHA-256, lalu izinkan file itu di antivirus. Jika ragu, tanyakan ke pengelola IT.

## 4. Memasang EZI

1. Klik dua kali `EZI-Setup-x.y.z.exe`, lalu pilih **Yes** saat Windows meminta izin Administrator.
2. **Lisensi pihak ketiga:** baca, lalu setujui.
3. **Folder install:** biarkan default (`C:\Program Files\EZI`) kecuali ada alasan khusus.
4. **Pengaturan EZI:**
   - **Port aplikasi:** biarkan `3000`, kecuali port itu sudah dipakai program lain.
   - **Izinkan perangkat lain di jaringan kantor:** centang jika PC dan HP lain di kantor akan membuka EZI (biasanya ya).
   - **Jalankan EZI otomatis di latar belakang saat Windows menyala:** centang supaya EZI selalu siap setelah PC dinyalakan. Jika tidak dicentang, setiap kali PC menyala Anda harus membuka **Start Menu > EZI Inventory > Start EZI** dulu.
5. Klik **Install** dan tunggu. Langkah "Menyiapkan database, service, dan firewall" bisa 1-2 menit.
6. Halaman akhir menunjukkan **"EZI sudah berjalan dan lolos smoke test"**. Biarkan **Buka EZI sekarang** tercentang, lalu klik **Finish**.

Jika muncul pesan **"Instalasi EZI GAGAL"**, tidak ada data lama yang disentuh. Buka folder log yang disebut di pesan, lalu lihat [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 5. Pertama kali dibuka: membuat Admin pertama

1. Browser membuka EZI di `http://localhost:3000`.
2. Halaman **setup** meminta data **Admin pertama** (nama, email, password). Isi dan simpan baik-baik.
3. Halaman ini hanya muncul **sekali**. Setelah itu EZI langsung menampilkan halaman login.
4. Disarankan segera membuat **Admin kedua** di menu Users, karena Admin tidak boleh menyetujui permintaannya sendiri (lihat [ADMIN-GUIDE.md](ADMIN-GUIDE.md)).

## 6. Yang terpasang di PC

| Lokasi | Isi |
|---|---|
| `C:\Program Files\EZI` | Program (diganti saat update) |
| `C:\ProgramData\EZI` | Data: `config`, `mysql-data` (database), `backups`, `logs`. **Tidak pernah** diganti oleh update |
| Start Menu > EZI Inventory | Buka EZI, Start EZI, Stop EZI, Backup sekarang, Restore dari backup, Lihat log, Tampilkan alamat akses, Uninstall EZI |
| Desktop | Shortcut **EZI Inventory** |
| Windows Services | `EZI` (aplikasi) dan `EZI-DB` (database pribadi, hanya `127.0.0.1:3307`) |

## 7. Update ke versi baru

Unduh installer versi baru, lalu jalankan seperti biasa. Installer mengenali EZI yang sudah terpasang dan:

1. menghentikan EZI,
2. membuat backup **"Before update"**,
3. mengganti file program,
4. memperbarui struktur database,
5. menyalakan EZI dan menjalankan smoke test.

Data dan password tidak berubah. Halaman Pengaturan menampilkan pilihan Anda yang sekarang; ubah hanya jika memang perlu. Jika update bermasalah, ikuti bagian "Rollback" di [ADMIN-GUIDE.md](ADMIN-GUIDE.md).

## 8. Uninstall

Buka **Start Menu > EZI Inventory > Uninstall EZI** (atau Windows Settings > Apps). Ada dua pilihan:

- **Pindah ke PC lain:** membuat backup terakhir ke folder yang Anda pilih (default `Documents\EZI-backup`). Data di PC ini tetap disimpan. Bawa file backup itu ke PC baru, lalu ikuti "Ganti PC host" di [ADMIN-GUIDE.md](ADMIN-GUIDE.md).
- **Bersihkan PC:** menghapus program dan **semua** data EZI di PC ini. Anda ditawari backup terakhir dulu, lalu diminta konfirmasi kedua. Data yang sudah dihapus tidak bisa dikembalikan.

Jika backup terakhir gagal, uninstall dibatalkan dan tidak ada yang dihapus.
