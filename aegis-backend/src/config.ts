import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Убираем CORS_ORIGIN из схемы Zod, чтобы он не вызывал ошибку типа.
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Определяем CORS_ORIGIN после парсинга схемы, используя проверенные данные из process.env.
export const config = {
  ...parsed.data,
  // Значение читается из переменной окружения ALLOWED_ORIGINS. Если её нет, то устанавливается "*".
  CORS_ORIGIN: process.env.ALLOWED_ORIGINS || '*',
};