# Cara Membuka EZI dari Perangkat Lain

EZI berjalan di **satu PC host**. PC lain, laptop, dan HP di jaringan kantor yang sama cukup membuka EZI di browser. Tidak ada aplikasi yang perlu dipasang.

## 1. Cari alamat EZI

Di PC host, buka **Start Menu > EZI Inventory > Tampilkan alamat akses** (klik **Yes** saat diminta izin). Jendela hitam menampilkan, misalnya:

```text
Buka EZI di browser:
  http://localhost:3000
  http://192.168.1.20:3000
  http://KANTOR-PC:3000
```

- `http://localhost:3000` hanya bisa dipakai **di PC host itu sendiri**.
- `http://192.168.1.20:3000` (angka IP) dipakai dari perangkat lain.
- `http://KANTOR-PC:3000` (nama komputer) juga bisa dipakai dari PC Windows lain; di HP kadang tidak bisa, jadi gunakan alamat IP.

## 2. Buka dari perangkat lain

1. Pastikan perangkat tersambung ke **Wi-Fi atau jaringan kantor yang sama** dengan PC host.
2. Buka browser (Chrome, Edge, Firefox, atau Safari).
3. Ketik alamat IP lengkap dengan `http://` dan `:3000`, misalnya `http://192.168.1.20:3000`.
4. Login dengan akun yang dibuat Admin.
5. (Opsional) Simpan sebagai bookmark atau "Add to Home screen" di HP.

## 3. Jika alamat tidak bisa dibuka

| Gejala | Yang dicek |
|---|---|
| Browser lama berputar lalu gagal | PC host menyala? EZI berjalan? (di PC host buka `http://localhost:3000`) |
| Bisa di PC host, tidak bisa di perangkat lain | Perangkat di jaringan yang sama? Saat install, opsi "Izinkan perangkat lain" dicentang? Jaringan Windows di PC host diset **Private**, bukan Public? |
| Kemarin bisa, hari ini tidak | Alamat IP PC host mungkin berubah. Lihat lagi langkah 1 |
| Muncul halaman login tapi lambat | Sinyal Wi-Fi lemah, atau PC host sibuk |

## 4. Jika alamat IP PC host berubah

Router kantor bisa memberi IP berbeda setelah PC host restart. Ini tidak merusak data; hanya alamatnya yang berubah.

- Solusi cepat: lihat alamat baru (langkah 1) dan beri tahu pengguna.
- Solusi tetap: minta pengelola jaringan memberi **IP tetap** (DHCP reservation) untuk PC host. Lihat [ADMIN-GUIDE.md](ADMIN-GUIDE.md).

## 5. Keamanan

- EZI hanya bisa dibuka dari jaringan kantor, bukan dari internet.
- Database EZI tidak pernah bisa diakses dari perangkat lain; hanya aplikasi EZI di PC host yang memakainya.
- Jangan berbagi akun. Setiap orang memakai akunnya sendiri supaya riwayat aktivitas jelas.
