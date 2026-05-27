import dotenv from 'dotenv';
import { z } from 'zod';

// Загружаем переменные окружения из .env файла
dotenv.config();

// 1. Определяем схему для проверки переменных окружения
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Переменная для CORS сделана необязательной
  ALLOWED_ORIGINS: z.string().optional(),
});

// Выполняем проверку всех переменных из process.env
const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1); // Останавливаем приложение, если конфиг неверный
}

// 2. Выводим тип Config из схемы Zod.
// Это автоматически создаст сложный TypeScript-тип,
// который знает обо всех полях из схемы.
export type Config = z.infer<typeof schema>;

// 3. Создаем базовый объект конфигурации строго по выведенному типу.
const configObject: Config = { ...parsed.data };

// 4. Добавляем вычисляемое поле CORS_ORIGIN к уже созданному объекту.
configObject.CORS_ORIGIN = configObject.ALLOWED_ORIGINS ?? '*';

// 5. Экспортируем готовый объект для использования в приложении.
export const config = configObject;