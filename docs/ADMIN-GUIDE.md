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

**Update otomatis (mulai versi 1.2):** EZI memeriksa rilis baru sendiri, memasangnya saat tidak ada yang memakai EZI, tanpa bertanya. Cara kerjanya:

- Sebuah tugas Windows (`EZI Updater`, berjalan sebagai SYSTEM) memeriksa repo rilis publik lewat HTTPS paling sering tiap 12 jam. Tidak ada data kantor yang dikirim: hanya dua permintaan GET ke GitHub.
- Berkas installer diunduh dan **SHA-256**-nya harus cocok dengan `SHA256SUMS.txt` dari rilis yang sama. Yang tidak cocok dihapus dan tidak pernah dijalankan.
- Pemasangan menunggu EZI **sepi**: tidak ada permintaan yang berjalan dan 10 menit tanpa aktivitas. Installer membuat backup "Before update" lebih dulu; data tidak diubah.
- EZI restart sekitar satu menit saat pemasangan. Tanpa internet, tidak ada yang terjadi dan tidak ada pesan yang mengganggu.
- Di **Cadangan data** ada kartu **Pembaruan program**: versi terpasang dan terbaru, kapan terakhir diperiksa, kotak **Pasang pembaruan otomatis** (matikan bila ingin memasang sendiri; Anda tetap diberi tahu ada versi baru), dan tombol **Perbarui sekarang**. Spanduk yang sama muncul di atas halaman untuk Admin (Staff tidak melihatnya). Perbarui sekarang berjalan paling lama 5 menit kemudian, tidak menunggu EZI sepi, dan EZI restart: semua pengguna terputus sebentar.
- Bila pemasangan gagal, EZI dinyalakan lagi otomatis dan spanduk menampilkan pesan dengan tombol **Coba lagi**. Pemasangan otomatis yang gagal diulang setelah 24 jam, paling banyak 3 kali per versi. Tidak ada pemulihan otomatis file program; data aman di backup "Before update" (lihat Rollback di bawah).

**PC yang masih versi 1.0 atau 1.1 tidak punya pemeriksa update.** Pasang versi 1.2 **satu kali secara manual** (lihat [INSTALLATION.md](INSTALLATION.md) bagian 7). Data, port, dan opsi lama dipertahankan; setelah itu PC tersebut ikut update otomatis.

**Update manual:** jalankan installer versi baru di PC host. Installer membuat backup "Before update" sebelum mengganti apa pun (lihat [INSTALLATION.md](INSTALLATION.md) bagian 7).

**Rollback** (jika versi baru bermasalah). Perubahan database tidak bisa dibatalkan begitu saja, jadi rollback memakai backup sebelum update:

1. **Stop EZI** (Start Menu).
2. Jalankan installer **versi sebelumnya**.
3. **Restore dari backup**, lalu pilih file backup **"Before update"** terbaru.
4. Periksa data. Jangan pernah memulihkan database tanpa backup "Before update".

### QR code dan foto barang

Halaman detail barang menampilkan **foto** barang (satu foto, JPEG, PNG, atau WebP, diunggah dari form barang) dan **QR code** dari kode barang di bawah foto (isinya teks kode barang; pindai dengan kamera HP). Di bawah QR code ada dua tombol: **Unduh PNG** menyimpan file bernama `qr-<nama barang>.png` dan **Cetak label** mencetak label (nama barang dan QR code saja). Foto ikut dalam backup dan kembali saat restore. Aplikasi desktop punya tombol **Unduh PNG** di bawah QR code (file masuk folder Unduhan, hanya simbol QR tanpa nama atau kode); tombol **Cetak label** di desktop mengirim gambar QR code (tanpa nama barang) ke dialog cetak Windows. Staff melihat QR code tetapi tidak melihat kode sebagai teks (lihat [USER-ACCESS.md](USER-ACCESS.md) bagian 5).

**Label lama (versi 1.2.0 ke bawah).** Sebelum 1.2.1 label memakai barcode Code 128. Label itu tidak terbaca kamera HP dan tidak ada lagi di aplikasi, jadi **cetak ulang** label barang dari halaman detail barang.

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
