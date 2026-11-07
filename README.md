# GLASS-IDEAL_VITRAJ — Telegram bot + veb-ilova (Ideal-Vit katalogi)

Oltin–qora uslubdagi katalog: mijoz kiradi → tanlaydi → savat → to'lash yoki qarzga olish.
Admin panel shu saytning o'zida (login: `admin`).

## 1. Kompyuteringizda ishga tushirish (VS Code)

```bash
npm install
npm start
```

Brauzerda oching: http://localhost:3000
Admin: `admin` / `admin1414` (kirgach «Sozlama» bo'limidan parolni almashtiring).

> Live Server (5500) ham bo'ladi, lekin API uchun `npm start` ham ishlab turishi kerak.

## 2. Telegram bot

1. Telegramda **@BotFather** → `/newbot` → bot nomi va username tanlang → **token** oling.
2. `.env.example` faylini `.env` deb nusxalang va `BOT_TOKEN=` ga tokenni yozing.
3. Bot Mini App ochishi uchun sayt **HTTPS** manzilda turishi kerak (3-bo'limga qarang) va `PUBLIC_URL=` ga shu manzil yoziladi.
4. Botga `/start` yuboring — «🛍 Katalogni ochish» tugmasi chiqadi (pastdagi menyuda ham «Katalog» bo'ladi).
5. Adminga xabarlar (yangi zakaz + chek rasmi + ✅/❌ tugmalari) kelishi uchun:
   - Telegram ichida botni ochib, Mini App'ga `admin` bilan kiring — avtomatik ulanadi, **yoki**
   - Admin panel → Sozlama → «Telegramga ulash» → chiqqan `/admin KOD` ni botga yuboring.

## 3. Internetga chiqarish (Render + MongoDB Atlas, bepul)

Nega MongoDB? Render bepul tarifida fayllar har qayta ishga tushganda o'chadi. Zakazlar, mijozlar va foyda hisoboti yo'qolmasligi uchun baza tashqarida turadi.

1. **MongoDB Atlas** (mongodb.com/atlas) → bepul klaster (M0) → *Database Access*: foydalanuvchi + parol → *Network Access*: `0.0.0.0/0` → *Connect → Drivers* dan ulanish manzilini oling (`mongodb+srv://...`).
2. Loyihani GitHub'ga yuklang (`node_modules` va `.env` yuklanmaydi — `.gitignore` bor).
3. **Render** → New → **Web Service** → GitHub repo → quyidagilarni kiriting:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `MONGODB_URI`, `BOT_TOKEN`, `ADMIN_PASSWORD`, `SECRET` (uzun tasodifiy matn)
4. Deploy tugagach Render bergan manzilni (`https://....onrender.com`) **`PUBLIC_URL`** ga qo'shing va qayta deploy qiling — bot webhook avtomatik ulanadi.
5. Bepul tarif 15 daqiqa harakatsizlikdan keyin «uxlaydi» (birinchi ochilish ~30 soniya). Uxlamasligi uchun uptimerobot.com orqali `https://MANZIL/healthz` ni 5 daqiqada bir tekshirtirib qo'ying.

## 4. Birinchi marta admin nimalarni to'ldiradi

- **Sozlama → To'lov rekvizitlari**: Payme / Click / Paynet karta raqami va qabul qiluvchi (mijoz to'lov oynasida shuni ko'radi).
- **Sozlama → Dollar kursi**, aloqa (Telegram, Instagram) va qarz shartlari (30%, 14 kun, 2 ta, rozilik matni).
- **Tovarlar**: har bir mahsulotning **qoldig'i** (hozir hammasida 50 qo'yilgan) va **tan narxi** (oylik foyda to'g'ri chiqishi uchun).
- Yangi tovar: nomi `SF…` yoki `мат…` bilan boshlansa — avtomatik «Matovkalar» (metr bilan), `DB/RB/VB/VE/OYR…` — «Bevils», `SO/DECRALED/REGALED` — «Jilkalar», qolgani — «Aksesuvarlar». Qo'lda ham tanlash mumkin.

## Qanday ishlaydi

- **To'lash**: Payme/Click/Paynet tanlanadi → mijoz to'laydi → **chek rasmini yuklaydi (majburiy)** → admin chekni ko'rib ✅ tasdiqlaydi → buyurtma «Qabul qilindi».
- **Qarzga**: shartlar + majburiy rozilik belgisi → 30% to'lov (chek bilan) → tasdiqlangach qarz «Qarzdorlik»ka yoziladi → qolganini mijoz bo'lib-bo'lib to'laydi (har to'lov chek bilan, admin tasdiqlaydi; naqd bo'lsa admin o'zi kiritadi). Bir vaqtda ko'pi bilan 2 ta qarz. Muddat o'tsa admin va mijozga eslatma boradi.
- **Oylik foyda**: har oy avtomatik yangilanadi, siz o'chirmaguningizcha saqlanadi.
- Katalog 157 ta mahsulot (12 sahifa bevils + 9 ta aksesuar), rasmlar katalogdan kesib olingan: `public/img/products/`.

## Fayllar

```
server/index.js   — API, buyurtma/qarz/hisobot mantig'i
server/bot.js     — Telegram bot (webhook yoki polling)
server/store.js   — baza (lokal fayl yoki MongoDB)
server/seed/      — katalog ma'lumotlari (nom, o'lcham, narx)
public/           — veb-ilova (index.html, css/, js/, img/)
```
