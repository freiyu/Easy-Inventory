# Panduan Admin EZI Inventory

Panduan untuk Admin EZI dan orang yang merawat PC host. Pemasangan ada di [INSTALLATION.md](INSTALLATION.md), akses dari perangkat lain di [USER-ACCESS.md](USER-ACCESS.md).

## 1. Backup database

Backup adalah satu-satunya cara memulihkan data jika PC host rusak. **Excel export bukan backup** dan tidak bisa memulihkan EZI.

EZI membuat backup sendiri:

- **Otomatis** sekali sehari selama EZI berjalan.
- **Sebelum update** oleh installer.
- **Sebelum import CSV** dan **sebelum restore**.
- **Manual** lewat halaman **Backup** di EZI (Admin) atau **Start Menu > EZI Inventory > Backup sekarang**.

EZI menyimpan **14 backup terbaru** di `C:\ProgramData\EZI\backups`; yang lebih lama dihapus otomatis.

**Penting:** backup itu ada di PC yang sama. Jika hard disk PC host rusak, backupnya ikut hilang. Karena itu, **seminggu sekali** buka halaman **Backup** di EZI, unduh backup terbaru, lalu simpan di flashdisk atau PC lain. Tanpa salinan di luar PC host, data tidak bisa dipulihkan jika PC host rusak.

## 2. Restore dari backup

Restore **mengganti semua data EZI** dengan isi file backup. Lakukan hanya jika memang perlu (data rusak, salah besar, atau pindah PC).

1. Di PC host, buka **Start Menu > EZI Inventory > Restore dari backup**, lalu klik **Yes** saat diminta izin Administrator.
2. Pilih file backup (`.sql.gz`). Defaultnya folder `C:\ProgramData\EZI\backups`; file yang diunduh dari halaman Backup juga bisa dipilih.
3. Baca peringatannya, ketik `YA`, lalu tekan Enter.
4. EZI otomatis:
   - membuat backup **"Before restore"** dari data saat ini,
   - menghentikan EZI,
   - memuat data dari file,
   - memperbarui struktur database jika backup berasal dari versi lama,
   - menyalakan EZI dan menjalankan smoke test.
5. Login dan periksa datanya.

Jika restore gagal, jendela menyebut nama file backup "Before restore". Jalankan Restore lagi dengan file itu untuk kembali ke keadaan sebelumnya.

**Uji restore:** sebelum EZI dipakai penuh, latih restore sekali di PC uji (bukan PC host produksi). Dengan begitu Anda tahu caranya sebelum benar-benar butuh.

## 3. Ganti PC host

1. Di PC lama (jika masih menyala): **Uninstall EZI**, pilih **Pindah ke PC lain**, lalu simpan backup terakhir di flashdisk. Jika PC lama rusak, pakai backup terbaru yang pernah Anda unduh.
2. Di PC baru: pasang EZI dengan installer yang sama ([INSTALLATION.md](INSTALLATION.md)). Lewati pembuatan Admin pertama; restore akan menggantinya.
3. Di PC baru: **Start Menu > EZI Inventory > Restore dari backup**, lalu pilih file backup dari flashdisk.
4. Login dengan akun lama dan periksa data.
5. Beri tahu pengguna alamat baru ([USER-ACCESS.md](USER-ACCESS.md)).

## 4. Update dan rollback

**Update:** jalankan installer versi baru di PC host. Installer membuat backup "Before update" sebelum mengganti apa pun (lihat [INSTALLATION.md](INSTALLATION.md) bagian 7).

**Rollback** (jika versi baru bermasalah). Perubahan database tidak bisa dibatalkan begitu saja, jadi rollback memakai backup sebelum update:

1. **Stop EZI** (Start Menu).
2. Jalankan installer **versi sebelumnya**.
3. **Restore dari backup**, lalu pilih file backup **"Before update"** terbaru.
4. Periksa data. Jangan pernah memulihkan database tanpa backup "Before update".

## 5. Admin kedua

EZI melarang Admin menyetujui pinjaman atau permintaan pembelian **miliknya sendiri**. Buat minimal **dua akun Admin** supaya permintaan Admin bisa disetujui Admin lain, dan supaya EZI tetap bisa dikelola jika satu Admin lupa password.

## 6. Export Excel

Halaman Reports, Items, dan Dashboard punya tombol **Export Excel**. File Excel hanya untuk dibaca dan dianalisis. Mengubah file Excel **tidak** mengubah data EZI, dan Excel **bukan** backup.

## 7. Merawat PC host

- **Jangan biarkan PC host tidur (sleep/hibernate)** selama jam kerja: Settings > System > Power > Screen and sleep > "Put my device to sleep after": **Never** (saat tersambung listrik). Layar boleh mati.
- **Beri IP tetap** untuk PC host (DHCP reservation di router, minta pengelola jaringan) supaya alamat EZI tidak berubah.
- Pastikan jaringan Windows di PC host diset **Private** (Settings > Network & Internet > properti jaringan), supaya perangkat lain bisa membuka EZI.
- Jika opsi "Jalankan otomatis" tidak dicentang saat install, nyalakan EZI setiap pagi: **Start Menu > EZI Inventory > Start EZI**.
- Windows Update aman: EZI menyala lagi sendiri setelah restart (jika opsi otomatis dicentang).
- Simpan salinan backup di luar PC host secara rutin (bagian 1).

## 8. Log

**Start Menu > EZI Inventory > Lihat log** membuka `C:\ProgramData\EZI\logs` (Windows bisa meminta izin Administrator). Isinya: log install/update/restore/uninstall, log service, dan `ezi-error.log`. Kirim file log terbaru ke pengelola IT saat melapor masalah.
