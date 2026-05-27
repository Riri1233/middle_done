# AEGIS COMPLY v2

**AI-native RegTech платформа для двойного комплаенса ВЭД**

> Реальный скрининг по 50+ санкционным базам (OpenSanctions) + AI-анализ сделок (DeepSeek) + Evidence Vault (PDF) + Document Intelligence

---

## Что делает продукт

| Модуль | Что реально происходит |
|--------|------------------------|
| 🏛 Санкционный скрининг | Реальный запрос к OpenSanctions API (OFAC SDN, EU, UN, UK, BIS) |
| 📦 Экспортный контроль | DeepSeek анализирует ТН ВЭД + dual-use статус |
| 🔍 UBO / Правило 50% | Проверка бенефициаров + OpenSanctions |
| 💳 Платёжный коридор | AI-оценка риска банков и валютных пар |
| 🗺 Антиобход санкций | Анализ транзитных юрисдикций и перевозчиков |
| 📋 Evidence Vault | PDF-отчёт через pdfkit с audit trail |
| 📄 Document Intelligence | Upload PDF/DOCX → AI извлекает контрагента, ТН ВЭД, сумму |
| ◎ Мониторинг | Watch-list с повторным скринингом OpenSanctions |

---

## Стек

| | |
|--|--|
| **Frontend** | React 18 + TypeScript + Vite + Recharts |
| **Backend** | Express 5 + TypeScript + Prisma |
| **База данных** | PostgreSQL 16 |
| **AI анализ** | DeepSeek Chat API |
| **Санкционные данные** | OpenSanctions API (бесплатный) |
| **PDF** | pdfkit |
| **Auth** | JWT (15m) + refresh tokens (7d) + bcrypt |
| **Деплой** | Docker + docker-compose |

---

## Быстрый старт

### Локально (без Docker)

```bash
# 1. Бэкенд
cd aegis-backend
npm install
cp .env.example .env       # заполни DEEPSEEK_API_KEY, JWT_SECRET, JWT_REFRESH_SECRET
npx prisma migrate dev
npm run dev                 # http://localhost:3001

# 2. Фронтенд (другой терминал)
cd aegis-frontend
npm install
cp .env.example .env       # VITE_API_URL=http://localhost:3001
npm run dev                 # http://localhost:5173
```

### Через Docker Compose (production)

```bash
cd aegis-backend
cp .env.example .env
# Заполни: DEEPSEEK_API_KEY, JWT_SECRET, JWT_REFRESH_SECRET, POSTGRES_PASSWORD
# Для генерации секретов:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up -d --build
# Бэкенд: http://localhost:3001
# Фронтенд деплои отдельно (Vercel / Netlify)
```

---

## Переменные окружения

### Backend `.env`

```env
DATABASE_URL=postgresql://aegis:password@localhost:5432/aegis
JWT_SECRET=<случайная строка ≥32 символа>
JWT_REFRESH_SECRET=<другая случайная строка ≥32 символа>
DEEPSEEK_API_KEY=sk-...           # platform.deepseek.com
POSTGRES_PASSWORD=strongpassword  # только для docker-compose
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:3001
```

---

## API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/users/me
PATCH  /api/users/me

GET    /api/checks            ?page&limit&filter&search
GET    /api/checks/stats
GET    /api/checks/export/csv
POST   /api/checks            → OpenSanctions + DeepSeek analysis
GET    /api/checks/:id
GET    /api/checks/:id/pdf    → PDF generation (pdfkit)
DELETE /api/checks/:id

POST   /api/documents/upload  → multer → AI entity extraction
GET    /api/documents
GET    /api/documents/:id
DELETE /api/documents/:id

GET    /api/monitoring
POST   /api/monitoring        → real OpenSanctions screening
POST   /api/monitoring/:id/recheck
PATCH  /api/monitoring/:id/read
DELETE /api/monitoring/:id

GET    /health
```

---

## Деплой на GitHub + хостинг

### Фронтенд → Vercel
1. Import репозиторий → Root Directory: `aegis-frontend`
2. Build: `npm run build` | Output: `dist`
3. Env: `VITE_API_URL=https://your-backend.railway.app`

### Бэкенд → Railway
1. New Project → Deploy from GitHub
2. Root Directory: `aegis-backend`
3. Добавить PostgreSQL plugin
4. Env variables из `.env.example`
5. Start: `npx prisma migrate deploy && node dist/index.js`

---

## Архитектура проверки (check flow)

```
User submits form
      ↓
[1] OpenSanctions API    ← реальные санкционные базы
      ↓ hits/no hits
[2] DeepSeek AI          ← анализ с контекстом санкций
      ↓ structured JSON
[3] Score adjustment     ← если hit → score ≥ 90, verdict = BLOCKED
      ↓
[4] PostgreSQL save      ← полный аудит-лог
      ↓
[5] PDF available        ← GET /api/checks/:id/pdf
```

---

## Лицензия

MIT · Rafail Filatov · ФинУниверситет 2026
