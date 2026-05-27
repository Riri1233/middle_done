// ── Aegis Comply · Demo Seed Script ──────────────────────────────────────────
// Fills the database with realistic demo data for investor/employer demos.
// Run: npx ts-node scripts/seed.ts
//
// Creates:
//   • 1 demo user (demo@aegis-comply.ru / demo12345)
//   • 10 realistic compliance checks (mix of APPROVED/CAUTION/BLOCKED)
//   • 3 monitoring watch-list entries
//   Spread over last 14 days for a healthy dashboard trend chart.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ── Demo user ──────────────────────────────────────────────────────────────
const DEMO_USER = {
  email: 'demo@aegis-comply.ru',
  password: 'demo12345',
  name: 'Алексей Иванов',
  company: 'ООО ТехЭкспорт',
  inn: '7712345678',
  activity: 'export',
  plan: 'business',
  checksLeft: 45,
};

// ── Helpers ────────────────────────────────────────────────────────────────
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// ── Realistic check scenarios ──────────────────────────────────────────────
const CHECKS = [
  // 1. BLOCKED – direct sanctions hit on counterparty (14 days ago)
  {
    counterparty: 'Ural Industrial Holdings Ltd',
    country: 'RU',
    product: 'Промышленное оборудование с ЧПУ',
    currency: 'EUR',
    riskScore: 96,
    daysAgo: 14,
    formData: { cp: 'Ural Industrial Holdings Ltd', country: 'RU', product: 'Промышленное оборудование с ЧПУ', tnved: '8457 10 100 0', dual: 'yes', currency: 'EUR', val: '3 200 000', bank: 'Sberbank OJSC', payMethod: 'SWIFT', transit: 'Прямая поставка', finalDest: 'RU' },
    sanctionsHits: {
      counterparty: {
        searched: 'Ural Industrial Holdings Ltd', isSanctioned: true, isHighRisk: true,
        datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'],
        hits: [{ id: 'NK-OFACsdn-4721', caption: 'Ural Industrial Holdings Ltd', schema: 'Organization', score: 0.94, datasets: ['us_ofac_sdn', 'eu_fsf'], sanctionedBy: ['OFAC SDN', 'EU Consolidated'], isSanctioned: true, isHighConfidence: true, topics: ['sanction'], aliases: ['UIH Ltd', 'Ural Industrial'], countries: ['ru'] }],
        topHit: { id: 'NK-OFACsdn-4721', caption: 'Ural Industrial Holdings Ltd', schema: 'Organization', score: 0.94, sanctionedBy: ['OFAC SDN', 'EU Consolidated'], isSanctioned: true, isHighConfidence: true },
        screendAt: daysAgo(14).toISOString(),
      }
    },
    result: {
      overall: 'HIGH', score: 96, verdict: 'BLOCKED',
      summary: 'Контрагент напрямую включён в санкционный список OFAC SDN и EU Consolidated. Любые транзакции с данным юридическим лицом влекут нарушение санкционного режима США и ЕС и могут квалифицироваться по 50 U.S.C. § 1705.',
      red_flags: ['ПРЯМОЕ ПОПАДАНИЕ В OFAC SDN — Ural Industrial Holdings Ltd', 'Подтверждено в EU Consolidated (пакет санкций ЕС)', 'ЧПУ-оборудование (8457) входит в Common High Priority Items', 'Расчёт в EUR через SWIFT невозможен при наличии OFAC block'],
      norms: ['OFAC SDN', 'EU Reg 833/2014', 'ФЗ-183 ст.6', 'IEEPA 50 U.S.C. § 1705'],
      modules: {
        sanctions: { risk: 'HIGH', score: 98, findings: ['Прямое попадание в OFAC SDN (score 94%)', 'EU Consolidated — пакет 14'] },
        exportControl: { risk: 'HIGH', score: 90, findings: ['Код 8457 — станки с ЧПУ, ECCN 2B001', 'Запрет экспорта в РФ — BIS Entity List'] },
        ubo: { risk: 'HIGH', score: 85, findings: ['UBO не раскрыт — признак схемы', 'Российская юрисдикция — дополнительный риск'] },
        payment: { risk: 'HIGH', score: 95, findings: ['EUR/SWIFT недоступен для OFAC-заблокированных', 'Sberbank — под блокирующими санкциями'] },
        route: { risk: 'MEDIUM', score: 60, findings: ['Прямая поставка, но через российскую таможню', 'Риск конечного использования не верифицирован'] },
      },
      recs: ['Немедленно отказаться от сделки', 'Зафиксировать отказ в AML-системе компании', 'Уведомить комплаенс-офицера и юридический отдел', 'Не вступать в переговоры без заключения санкционного адвоката'],
    },
  },

  // 2. BLOCKED – UBO rule 50% (12 days ago)
  {
    counterparty: 'KazTransit Resource LLP',
    country: 'KZ',
    product: 'Микросхемы интегральные (DUAL-USE)',
    currency: 'USD',
    riskScore: 89,
    daysAgo: 12,
    formData: { cp: 'KazTransit Resource LLP', country: 'KZ', ctype: 'LLC', product: 'Микросхемы интегральные', tnved: '8542 31 900 0', dual: 'yes', enduse: 'Промышленное применение', ubo: 'Рашидов Алишер Камалович', uboCountry: 'RU', ownership: '65', currency: 'USD', val: '1 850 000', bank: 'Halyk Bank', payMethod: 'SWIFT', transit: 'Казахстан → Россия', finalDest: 'RU' },
    sanctionsHits: {
      counterparty: {
        searched: 'KazTransit Resource LLP', isSanctioned: false, isHighRisk: true,
        datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'],
        hits: [{ id: 'NK-EU-8832', caption: 'KazTransit Holdings Group', schema: 'Organization', score: 0.71, datasets: ['eu_fsf'], sanctionedBy: ['EU Consolidated'], isSanctioned: true, isHighConfidence: false, topics: ['sanction'], aliases: [], countries: ['kz'] }],
        topHit: { id: 'NK-EU-8832', caption: 'KazTransit Holdings Group', schema: 'Organization', score: 0.71, sanctionedBy: ['EU Consolidated'], isSanctioned: true, isHighConfidence: false },
        screendAt: daysAgo(12).toISOString(),
      },
      ubo: {
        searched: 'Рашидов Алишер Камалович', isSanctioned: true, isHighRisk: true,
        hits: [{ id: 'NK-OFAC-1198', caption: 'Rashidov Alisher Kamalovich', schema: 'Person', score: 0.88, datasets: ['us_ofac_sdn'], sanctionedBy: ['OFAC SDN'], isSanctioned: true, isHighConfidence: true, topics: ['sanction'], aliases: ['A. Rashidov'], countries: ['ru'] }],
        topHit: { id: 'NK-OFAC-1198', caption: 'Rashidov Alisher Kamalovich', schema: 'Person', score: 0.88, sanctionedBy: ['OFAC SDN'], isSanctioned: true, isHighConfidence: true },
        screendAt: daysAgo(12).toISOString(),
      }
    },
    result: {
      overall: 'HIGH', score: 89, verdict: 'BLOCKED',
      summary: 'Бенефициарный владелец компании (65% доли) обнаружен в санкционном списке OFAC SDN. Согласно правилу 50% OFAC, KazTransit Resource LLP автоматически подпадает под санкционный режим. Транзит через Казахстан с конечным назначением в РФ является дополнительным red flag.',
      red_flags: ['UBO Рашидов А.К. — в OFAC SDN (score 88%)', 'Правило 50% OFAC: >50% доля подсанкционного лица', 'Код 8542 — Common High Priority Items (BIS/OFAC 2023)', 'Транзит KZ→RU — юрисдикция высокого реэкспортного риска', 'Конечное назначение РФ при прямых санкциях'],
      norms: ['OFAC SDN — Rule 50%', 'EU Reg 833/2014', 'ФЗ-183 ст.6', 'BIS Entity List', 'EAR Part 744'],
      modules: {
        sanctions: { risk: 'HIGH', score: 92, findings: ['UBO в OFAC SDN — правило 50%', 'Возможное совпадение контрагента EU (71%)'] },
        exportControl: { risk: 'HIGH', score: 88, findings: ['8542 — ECCN 3A001 (Export License Required)', 'Включён в Common High Priority Items'] },
        ubo: { risk: 'HIGH', score: 95, findings: ['Rashidov A.K. — OFAC SDN (прямое попадание)', 'Доля 65% → правило 50% применяется'] },
        payment: { risk: 'HIGH', score: 80, findings: ['USD через Halyk Bank — высокий риск при OFAC block', 'Halyk Bank не под санкциями, но несёт корресп. риск'] },
        route: { risk: 'HIGH', score: 82, findings: ['KZ транзит — известный канал реэкспорта', 'Конечная точка РФ противоречит EAR restrictions'] },
      },
      recs: ['Отказать в сделке в связи с правилом 50% OFAC', 'Запросить официальное юридическое заключение по UBO-цепочке', 'Сообщить об отказе в рамках процедуры SAR (при наличии)', 'Провести проверку альтернативных поставщиков из незатронутых юрисдикций'],
    },
  },

  // 3. HIGH CAUTION – dual-use semiconductors to China (10 days ago)
  {
    counterparty: 'Shenzhen TechTrade Technology Co., Ltd',
    country: 'CN',
    product: 'Полупроводниковые чипы (AI/HPC)',
    currency: 'CNY',
    riskScore: 74,
    daysAgo: 10,
    formData: { cp: 'Shenzhen TechTrade Technology Co., Ltd', country: 'CN', ctype: 'LLC', reg: '91440300MA5FXXXXX', product: 'Полупроводниковые чипы для AI-ускорителей', tnved: '8542 31 900 0', dual: 'yes', enduse: 'Промышленное применение — центры обработки данных', ubo: 'Чен Вэй', uboCountry: 'CN', ownership: '70', currency: 'CNY', val: '4 700 000', bank: 'Bank of China', payMethod: 'SWIFT', transit: 'Гонконг → Китай', finalDest: 'CN' },
    sanctionsHits: {
      counterparty: { searched: 'Shenzhen TechTrade Technology Co', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: daysAgo(10).toISOString() }
    },
    result: {
      overall: 'HIGH', score: 74, verdict: 'CAUTION',
      summary: 'Контрагент не обнаружен в санкционных списках. Однако товар (AI-чипы, код 8542) входит в перечень Common High Priority Items и требует лицензии для экспорта. Конечное использование в HPC-инфраструктуре Китая сопряжено с высоким риском отказа при проверке EAR.',
      red_flags: ['Код 8542 — ECCN 3A090 (HPC chips), Export License Required', 'Common High Priority Items BIS/OFAC 2023', 'Конечное использование в AI/HPC — военный потенциал', 'Транзит через Гонконг — юрисдикция с history of re-export'],
      norms: ['EAR Part 742.6', 'ФЗ-183 (двойное назначение)', 'BIS Export Administration Regulations', 'EU Dual-Use Reg 2021/821'],
      modules: {
        sanctions: { risk: 'LOW', score: 18, findings: ['Совпадений в санкционных списках не найдено', 'Проверено: OFAC SDN, EU, UN, UK, BIS'] },
        exportControl: { risk: 'HIGH', score: 88, findings: ['ECCN 3A090 — AI chips требуют BIS лицензии для CN', 'ФСТЭК: включён в перечень ПП РФ № 312'] },
        ubo: { risk: 'LOW', score: 22, findings: ['UBO Чен Вэй — не в санкционных списках', 'Структура владения прозрачна'] },
        payment: { risk: 'MEDIUM', score: 52, findings: ['CNY расчёт исключает USD риск', 'Bank of China — под наблюдением OFAC CAPTA'] },
        route: { risk: 'MEDIUM', score: 58, findings: ['HK транзит — известный канал для chip smuggling', 'Требуется End-User Certificate'] },
      },
      recs: ['Запросить лицензию BIS до заключения контракта', 'Получить End-User Statement от покупателя', 'Верифицировать конечное использование через site visit или third-party audit', 'Проконсультироваться с экспортным адвокатом по EAR Part 742.6'],
    },
  },

  // 4. CAUTION – Turkey, chemicals (8 days ago)
  {
    counterparty: 'Ankara Chemicals & Industrial Supply Ltd',
    country: 'TR',
    product: 'Промышленные химические прекурсоры',
    currency: 'USD',
    riskScore: 62,
    daysAgo: 8,
    formData: { cp: 'Ankara Chemicals & Industrial Supply Ltd', country: 'TR', ctype: 'LTD', product: 'Химические прекурсоры (толуол, ацетон)', tnved: '2902 30 000 0', dual: 'unknown', enduse: 'Промышленное производство', currency: 'USD', val: '890 000', bank: 'İşbank', payMethod: 'Аккредитив', transit: 'Турция', finalDest: 'TR' },
    sanctionsHits: {
      counterparty: { searched: 'Ankara Chemicals Industrial Supply', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: daysAgo(8).toISOString() }
    },
    result: {
      overall: 'MEDIUM', score: 62, verdict: 'CAUTION',
      summary: 'Прямых санкционных рисков не выявлено. Химические прекурсоры требуют проверки на предмет двойного назначения. Турция находится под мониторингом как юрисдикция с риском реэкспорта в подсанкционные страны.',
      red_flags: ['Толуол/ацетон — возможные прекурсоры синтеза, проверить dual-use', 'Турция — в списке юрисдикций повышенного внимания EU', 'Конечное использование не верифицировано'],
      norms: ['ФЗ-183', 'EU Dual-Use Reg 2021/821', 'Конвенция о химическом оружии (КХО)', 'FATF рекомендации'],
      modules: {
        sanctions: { risk: 'LOW', score: 15, findings: ['Контрагент не обнаружен в санкционных базах', 'Турция — не под прямыми санкциями'] },
        exportControl: { risk: 'MEDIUM', score: 62, findings: ['Прекурсоры требуют dual-use верификации', 'Код 2902 — возможен Schedule 2 by CWC'] },
        ubo: { risk: 'LOW', score: 28, findings: ['Структура владения не раскрыта', 'Рекомендуется KYC-запрос'] },
        payment: { risk: 'MEDIUM', score: 55, findings: ['USD через İşbank — умеренный риск', 'Аккредитив снижает риск по сравнению с авансом'] },
        route: { risk: 'MEDIUM', score: 60, findings: ['Турция — транзитный хаб в направлении РФ/ИРН', 'Требуется EUC (End-User Certificate)'] },
      },
      recs: ['Запросить подтверждение конечного использования (EUC)', 'Провести KYC-верификацию UBO', 'Добавить в контракт Anti-Diversion Clause', 'Провести проверку по Chemical Weapons Convention списку'],
    },
  },

  // 5. APPROVED – India, textile machinery (6 days ago)
  {
    counterparty: 'Mumbai Textile Machinery Exports Pvt. Ltd',
    country: 'IN',
    product: 'Текстильное оборудование (ткацкие станки)',
    currency: 'USD',
    riskScore: 21,
    daysAgo: 6,
    formData: { cp: 'Mumbai Textile Machinery Exports Pvt. Ltd', country: 'IN', ctype: 'LLC', reg: 'L17110MH1995PLC088144', product: 'Ткацкие станки и текстильное оборудование', tnved: '8446 21 000 0', dual: 'no', enduse: 'Производство текстиля — гражданское применение', currency: 'USD', val: '340 000', bank: 'HDFC Bank', payMethod: 'SWIFT', transit: 'Прямая поставка Мумбаи → Москва', finalDest: 'RU' },
    sanctionsHits: {
      counterparty: { searched: 'Mumbai Textile Machinery Exports', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: daysAgo(6).toISOString() }
    },
    result: {
      overall: 'LOW', score: 21, verdict: 'APPROVED',
      summary: 'Сделка соответствует требованиям санкционного и экспортного законодательства. Контрагент отсутствует в санкционных списках. Товар не имеет статуса двойного назначения. Рекомендуется стандартная документация.',
      red_flags: [],
      norms: ['ФЗ-173 (валютный контроль)', 'ТН ВЭД гл. 84'],
      modules: {
        sanctions: { risk: 'LOW', score: 10, findings: ['Совпадений не найдено во всех базах', 'Индия — не подсанкционная юрисдикция'] },
        exportControl: { risk: 'LOW', score: 12, findings: ['Код 8446 — EAR99, лицензия не требуется', 'Гражданское применение подтверждено'] },
        ubo: { risk: 'LOW', score: 18, findings: ['UBO не раскрыт, но риск низкий', 'Индийская юрисдикция — стандартный KYC'] },
        payment: { risk: 'LOW', score: 25, findings: ['USD/SWIFT через HDFC — надёжный коридор', 'Банк-корреспондент без санкций'] },
        route: { risk: 'LOW', score: 22, findings: ['Прямая поставка без транзита', 'Маршрут не вызывает вопросов'] },
      },
      recs: ['Стандартная документация для таможни (инвойс, CMR, сертификат происхождения)', 'Валютный контроль по ФЗ-173: паспорт сделки при сумме >200 тыс. руб.', 'Рекомендуется запросить business registration документы для KYC'],
    },
  },

  // 6. APPROVED – Georgia, food (5 days ago)
  {
    counterparty: 'Tbilisi Trading House LLC',
    country: 'GE',
    product: 'Продукты питания (фрукты, овощи)',
    currency: 'USD',
    riskScore: 14,
    daysAgo: 5,
    formData: { cp: 'Tbilisi Trading House LLC', country: 'GE', ctype: 'LLC', product: 'Свежие фрукты и овощи', tnved: '0804 50 000 0', dual: 'no', currency: 'USD', val: '125 000', bank: 'TBC Bank', payMethod: 'SWIFT', transit: 'Прямая поставка', finalDest: 'RU' },
    sanctionsHits: {
      counterparty: { searched: 'Tbilisi Trading House LLC', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: daysAgo(5).toISOString() }
    },
    result: {
      overall: 'LOW', score: 14, verdict: 'APPROVED',
      summary: 'Минимальный уровень риска. Продовольственные товары освобождены от большинства экспортных ограничений. Грузия не является подсанкционной юрисдикцией.',
      red_flags: [],
      norms: ['ФЗ-173', 'Технический регламент ЕАЭС на продовольствие'],
      modules: {
        sanctions: { risk: 'LOW', score: 8, findings: ['Нет совпадений во всех базах', 'Грузия — незатронутая юрисдикция'] },
        exportControl: { risk: 'LOW', score: 5, findings: ['Продовольствие — EAR99, без ограничений', 'Не является товаром двойного назначения'] },
        ubo: { risk: 'LOW', score: 12, findings: ['Стандартный KYC достаточен'] },
        payment: { risk: 'LOW', score: 20, findings: ['TBC Bank — надёжный грузинский банк', 'USD-коридор функционирует'] },
        route: { risk: 'LOW', score: 15, findings: ['Прямая поставка без транзитных рисков'] },
      },
      recs: ['Стандартная таможенная декларация', 'Фитосанитарный сертификат для продовольствия', 'Паспорт сделки при сумме >200 тыс. руб. (ФЗ-173)'],
    },
  },

  // 7. CAUTION – UAE, electronics (4 days ago)
  {
    counterparty: 'Dubai Tech Components FZE',
    country: 'AE',
    product: 'Электронные компоненты и платы',
    currency: 'AED',
    riskScore: 58,
    daysAgo: 4,
    formData: { cp: 'Dubai Tech Components FZE', country: 'AE', ctype: 'FZE', product: 'Электронные платы и компоненты (PCB)', tnved: '8534 00 900 0', dual: 'unknown', enduse: 'Промышленная электроника', ubo: 'Mohammed Al-Rasheed', uboCountry: 'AE', ownership: '100', currency: 'AED', val: '650 000', bank: 'Emirates NBD', payMethod: 'SWIFT', transit: 'ОАЭ (Дубай)', finalDest: 'AE' },
    sanctionsHits: {
      counterparty: { searched: 'Dubai Tech Components FZE', isSanctioned: false, isHighRisk: true, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [{ id: 'NK-OFAC-7732', caption: 'Dubai Tech Components LLC', schema: 'Organization', score: 0.67, datasets: ['us_ofac_cons'], sanctionedBy: ['OFAC SSI'], isSanctioned: false, isHighConfidence: false, topics: ['sanction'], aliases: [], countries: ['ae'] }], topHit: { id: 'NK-OFAC-7732', caption: 'Dubai Tech Components LLC', schema: 'Organization', score: 0.67, sanctionedBy: ['OFAC SSI'], isSanctioned: false, isHighConfidence: false }, screendAt: daysAgo(4).toISOString() }
    },
    result: {
      overall: 'MEDIUM', score: 58, verdict: 'CAUTION',
      summary: 'Возможное совпадение в OFAC SSI (score 67%) — требует верификации. ОАЭ являются юрисдикцией с повышенным риском реэкспорта в Иран и Россию. Рекомендуется углублённая проверка UBO и конечного использования.',
      red_flags: ['Возможное совпадение в OFAC SSI (67%) — необходима верификация', 'ОАЭ — в списке FATF юрисдикций повышенного внимания', 'FZE-структура — распространённый инструмент для обхода санкций', 'Статус dual-use не установлен'],
      norms: ['OFAC SSI', 'ФЗ-183', 'FATF Recommendation 24', 'EU Dual-Use Reg 2021/821'],
      modules: {
        sanctions: { risk: 'MEDIUM', score: 65, findings: ['Возможное совпадение OFAC SSI (67%)', 'Требуется ручная верификация имени'] },
        exportControl: { risk: 'MEDIUM', score: 55, findings: ['PCB могут иметь dual-use статус', 'Статус ECCN не установлен — необходима классификация'] },
        ubo: { risk: 'MEDIUM', score: 48, findings: ['Mohammed Al-Rasheed — не в базах', 'FZE без публичного раскрытия UBO'] },
        payment: { risk: 'MEDIUM', score: 52, findings: ['Emirates NBD — под наблюдением OFAC CAPTA', 'AED-расчёт снижает USD риск'] },
        route: { risk: 'MEDIUM', score: 60, findings: ['Дубай — транзитный хаб для реэкспорта', 'Требуется конечный пользовательский сертификат'] },
      },
      recs: ['Провести верификацию наименования по OFAC SDN вручную', 'Запросить Certificate of Incorporation и UBO disclosure', 'Получить End-User Certificate с указанием конечного получателя', 'Добавить Anti-Diversion Clause в контракт'],
    },
  },

  // 8. APPROVED – Serbia, auto parts (3 days ago)
  {
    counterparty: 'Beograd Auto Parts d.o.o.',
    country: 'RS',
    product: 'Автомобильные запчасти и комплектующие',
    currency: 'EUR',
    riskScore: 28,
    daysAgo: 3,
    formData: { cp: 'Beograd Auto Parts d.o.o.', country: 'RS', ctype: 'LLC', product: 'Запчасти для легковых автомобилей', tnved: '8708 99 970 9', dual: 'no', currency: 'EUR', val: '210 000', bank: 'Banca Intesa Serbia', payMethod: 'SWIFT', finalDest: 'RS' },
    sanctionsHits: {
      counterparty: { searched: 'Beograd Auto Parts', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: daysAgo(3).toISOString() }
    },
    result: {
      overall: 'LOW', score: 28, verdict: 'APPROVED',
      summary: 'Сделка соответствует санкционному и экспортному законодательству. Сербия — кандидат в ЕС, автомобильные запчасти не имеют ограничений двойного назначения.',
      red_flags: [],
      norms: ['ФЗ-173', 'Соглашение РФ-Сербия о свободной торговле'],
      modules: {
        sanctions: { risk: 'LOW', score: 12, findings: ['Нет совпадений в санкционных базах', 'Сербия — не подсанкционная юрисдикция'] },
        exportControl: { risk: 'LOW', score: 20, findings: ['Автозапчасти — EAR99, без ограничений', 'Не являются товаром двойного назначения'] },
        ubo: { risk: 'LOW', score: 15, findings: ['Структура д.о.о. — прозрачная юрисдикция'] },
        payment: { risk: 'LOW', score: 30, findings: ['EUR через Banca Intesa — надёжный коридор'] },
        route: { risk: 'LOW', score: 28, findings: ['Прямая поставка', 'Стандартный таможенный режим'] },
      },
      recs: ['Стандартная таможенная декларация ФТС', 'Сертификат соответствия ЕАЭС при необходимости'],
    },
  },

  // 9. HIGH – Vietnam, strategic metals (2 days ago)
  {
    counterparty: 'Hanoi Strategic Materials Corp.',
    country: 'VN',
    product: 'Редкоземельные металлы (неодим, диспрозий)',
    currency: 'USD',
    riskScore: 71,
    daysAgo: 2,
    formData: { cp: 'Hanoi Strategic Materials Corp.', country: 'VN', ctype: 'CORP', product: 'Редкоземельные металлы — неодим, диспрозий', tnved: '2805 30 900 0', dual: 'yes', enduse: 'Производство постоянных магнитов для электромоторов', currency: 'USD', val: '1 200 000', bank: 'Vietcombank', payMethod: 'Аккредитив', transit: 'Вьетнам → Россия (прямо)', finalDest: 'RU' },
    sanctionsHits: {
      counterparty: { searched: 'Hanoi Strategic Materials Corp', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: daysAgo(2).toISOString() }
    },
    result: {
      overall: 'HIGH', score: 71, verdict: 'CAUTION',
      summary: 'Редкоземельные металлы входят в список стратегических материалов и могут квалифицироваться как товары двойного назначения (производство постоянных магнитов для ВПК). Конечное использование в электромоторах требует верификации — не допускается применение в оборонной промышленности.',
      red_flags: ['Редкоземельные металлы — стратегическое сырьё для магнитов ВПК', 'Двойное назначение: гражданские электромоторы vs военная техника', 'Сумма >$1M требует паспорта сделки и пристального валютного контроля'],
      norms: ['ФЗ-183 ст.6 (стратегические материалы)', 'EAR Part 774 ECCN 1C234', 'Вассенаарские договорённости Kat.1', 'ФЗ-173 (валютный контроль)'],
      modules: {
        sanctions: { risk: 'LOW', score: 15, findings: ['Контрагент не в санкционных базах', 'Вьетнам — нейтральная юрисдикция'] },
        exportControl: { risk: 'HIGH', score: 80, findings: ['ECCN 1C234 — редкоземельные металлы', 'Конечное использование требует EUC'] },
        ubo: { risk: 'LOW', score: 20, findings: ['Нет данных об аффилированности с ВПК'] },
        payment: { risk: 'MEDIUM', score: 50, findings: ['USD-аккредитив через Vietcombank', 'Vietcombank — без санкций'] },
        route: { risk: 'MEDIUM', score: 65, findings: ['Прямая поставка позитивна', 'Конечное использование критично для compliance'] },
      },
      recs: ['Запросить детальный End-User Statement с указанием применения', 'Верифицировать через ФСТЭК наличие лицензии на экспорт', 'Включить в контракт запрет на перепродажу без согласования', 'Провести site-visit или третьесторонний аудит конечного пользователя'],
    },
  },

  // 10. APPROVED – Armenia, standard goods (today)
  {
    counterparty: 'Yerevan Import Export LLC',
    country: 'AM',
    product: 'Строительные материалы (металлопрокат)',
    currency: 'RUB',
    riskScore: 19,
    daysAgo: 0,
    formData: { cp: 'Yerevan Import Export LLC', country: 'AM', ctype: 'LLC', product: 'Металлопрокат — листовая сталь, арматура', tnved: '7208 10 000 0', dual: 'no', currency: 'RUB', val: '4 800 000', bank: 'Ameriabank', payMethod: 'SWIFT', finalDest: 'AM' },
    sanctionsHits: {
      counterparty: { searched: 'Yerevan Import Export LLC', isSanctioned: false, isHighRisk: false, datasetsChecked: ['OFAC SDN', 'OFAC SSI', 'EU Consolidated', 'UN Security Council', 'UK OFSI', 'BIS Entity List'], hits: [], topHit: null, screendAt: new Date().toISOString() }
    },
    result: {
      overall: 'LOW', score: 19, verdict: 'APPROVED',
      summary: 'Сделка соответствует требованиям. Металлопрокат не является товаром двойного назначения. Армения — дружественная юрисдикция, член ЕАЭС.',
      red_flags: [],
      norms: ['ФЗ-173', 'Таможенный кодекс ЕАЭС', 'Договор о ЕАЭС 2014 г.'],
      modules: {
        sanctions: { risk: 'LOW', score: 10, findings: ['Нет совпадений', 'Армения — не подсанкционная юрисдикция'] },
        exportControl: { risk: 'LOW', score: 8, findings: ['Стальной прокат — без экспортных ограничений', 'EAR99, лицензия не требуется'] },
        ubo: { risk: 'LOW', score: 12, findings: ['Стандартный KYC достаточен'] },
        payment: { risk: 'LOW', score: 22, findings: ['RUB через ЕАЭС — стандартный режим'] },
        route: { risk: 'LOW', score: 18, findings: ['Прямая поставка в ЕАЭС'] },
      },
      recs: ['Стандартная таможенная декларация', 'Транзитная декларация ЕАЭС при перемещении через третьи страны'],
    },
  },
];

// ── Monitoring entries ──────────────────────────────────────────────────────
const MONITORS = [
  { entityName: 'KazTransit Resource LLP', entityCountry: 'KZ', alertLevel: 'high', hasUnreadAlert: true, lastRiskScore: 89, alertMessage: 'Обнаружен в EU Consolidated (возможное совпадение 71%)' },
  { entityName: 'Shenzhen TechTrade Technology Co., Ltd', entityCountry: 'CN', alertLevel: 'medium', hasUnreadAlert: false, lastRiskScore: 42, alertMessage: null },
  { entityName: 'Dubai Tech Components FZE', entityCountry: 'AE', alertLevel: 'medium', hasUnreadAlert: true, lastRiskScore: 58, alertMessage: 'Возможное совпадение OFAC SSI (67%) — требует верификации' },
];

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Aegis Comply — Seed Script\n');

  // Demo user
  const hash = await bcrypt.hash(DEMO_USER.password, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER.email },
    update: {},
    create: {
      email: DEMO_USER.email,
      passwordHash: hash,
      name: DEMO_USER.name,
      company: DEMO_USER.company,
      inn: DEMO_USER.inn,
      activity: DEMO_USER.activity,
      plan: DEMO_USER.plan,
      checksLeft: DEMO_USER.checksLeft,
    },
  });
  console.log(`✓ Demo user: ${user.email}`);

  // Checks
  await prisma.check.deleteMany({ where: { userId: user.id } });
  for (const c of CHECKS) {
    await prisma.check.create({
      data: {
        userId: user.id,
        counterparty: c.counterparty,
        country: c.country,
        product: c.product,
        currency: c.currency,
        riskScore: c.riskScore,
        formData: c.formData as any,
        sanctionsHits: c.sanctionsHits as any,
        result: c.result as any,
        source: 'manual',
        createdAt: daysAgo(c.daysAgo),
      },
    });
    const icon = c.result.verdict === 'BLOCKED' ? '🔴' : c.result.verdict === 'APPROVED' ? '🟢' : '🟡';
    console.log(`  ${icon} ${c.counterparty} (${c.country}) — ${c.result.verdict} score:${c.riskScore}`);
  }
  console.log(`✓ ${CHECKS.length} checks created\n`);

  // Monitoring
  await prisma.monitor.deleteMany({ where: { userId: user.id } });
  for (const m of MONITORS) {
    await prisma.monitor.create({
      data: { userId: user.id, ...m, lastCheckedAt: daysAgo(1) },
    });
  }
  console.log(`✓ ${MONITORS.length} monitoring entries created\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo credentials:');
  console.log(`  Email:    ${DEMO_USER.email}`);
  console.log(`  Password: ${DEMO_USER.password}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
