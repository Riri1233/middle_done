import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // ...другие обязательные поля
  PORT: z.coerce.number().default(3001),
  
  // Добавляем ALLOWED_ORIGINS в схему как необязательное поле
  ALLOWED_ORIGINS: z.string().optional(), 
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Используем значение из проверенного объекта parsed.data
export const config = {
  ...parsed.data,
  CORS_ORIGIN: parsed.data.ALLOWED_ORIGINS ?? '*', // используем nullish coalescing для ясности
};