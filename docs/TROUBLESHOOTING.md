# Mengatasi Masalah EZI

Mulailah dari log: **Start Menu > EZI Inventory > Lihat log** (`C:\ProgramData\EZI\logs`). File `install-*.log`, `update-*.log`, `restore-*.log`, dan `uninstall-*.log` menulis setiap langkah; baris `GAGAL:` menjelaskan penyebabnya.

## 1. Saat install

| Pesan atau gejala | Penyebab | Cara mengatasi |
|---|---|---|
| "Windows protected your PC" | Installer tidak bersertifikat | Cek SHA-256, lalu More info > Run anyway ([INSTALLATION.md](INSTALLATION.md) bagian 3) |
| "Port 3000 sudah dipakai program lain" | Program lain memakai port itu | Jalankan installer lagi dan isi port lain, misalnya `3010` |
| "Port 3307 sudah dipakai program lain" | Ada database lain di port 3307 | Hentikan program itu, atau hubungi pengelola IT |
| "Folder database lama ditemukan tanpa config" | Sisa instalasi lama yang tidak lengkap | Data tidak disentuh. Pindahkan folder `C:\ProgramData\EZI\mysql-data` ke tempat lain, lalu install ulang |
| "Smoke test gagal" | EZI tidak menyala atau tidak menjawab | Lihat `EZI.err.log` dan `ezi-error.log` di folder log |
| Antivirus menghapus file | Deteksi keliru pada program tanpa sertifikat | Izinkan folder `C:\Program Files\EZI` di antivirus, lalu install ulang |

Jika install gagal, installer membatalkan perubahannya sendiri (service, firewall). Data lama tidak pernah dihapus.

## 2. Saat dipakai

| Gejala | Cara mengatasi |
|---|---|
| `localhost:3000` tidak terbuka di PC host | **Start Menu > EZI Inventory > Start EZI**. Jika masih gagal, lihat log |
| Perangkat lain tidak bisa membuka EZI | Lihat [USER-ACCESS.md](USER-ACCESS.md) bagian 3 |
| EZI mati setelah PC restart | Opsi "Jalankan otomatis" tidak dicentang. Nyalakan lewat Start EZI, atau jalankan installer lagi dan centang opsinya |
| Lupa password (pengguna biasa) | Admin membuka Users, lalu Reset password |
| Semua Admin lupa password | Restore backup yang dibuat saat password masih diketahui, atau hubungi pengelola IT |
| Backup gagal dibuat | Lihat `ezi-error.log`. Pastikan disk tidak penuh |
| Halaman tampil aneh setelah update | Tekan Ctrl+F5 di browser untuk memuat ulang |

## 3. Saat restore

| Gejala | Cara mengatasi |
|---|---|
| "Pilih file backup EZI (.sql.gz) yang ada" | File yang dipilih bukan backup EZI, atau sudah dipindah |
| Restore gagal di tengah jalan | Jalankan Restore lagi dengan file "Before restore" yang disebut di layar |
| Setelah restore, password lama berlaku | Normal: akun ikut dipulihkan dari backup |

## 4. Saat uninstall

| Gejala | Cara mengatasi |
|---|---|
| "Backup terakhir GAGAL. Uninstall dibatalkan" | Tidak ada yang dihapus. Coba **Start EZI** lalu ulangi, atau pilih folder tujuan lain |
| "Service EZI tidak bisa dihentikan" | Restart PC, lalu ulangi uninstall |

## 5. Melapor ke pengelola IT

Sertakan: versi EZI (Windows Settings > Apps), langkah yang dilakukan, pesan yang muncul (foto layar), dan file log terbaru dari `C:\ProgramData\EZI\logs`. Log tidak berisi password.
