import dotenv from 'dotenv';
import { z } from 'zod';

// ... весь ваш код до этого момента остается без изменений ...

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // ...другие обязательные поля
  PORT: z.coerce.number().default(3001),
  
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// --- НАЧАЛО ИЗМЕНЕНИЙ ---

// 1. Выводим тип из схемы и экспортируем его
export type Config = z.infer<typeof schema>;

// 2. Явно указываем, что наш объект `config` имеет этот новый тип
export const config: Config = {
  ...parsed.data,
  CORS_ORIGIN: parsed.data.ALLOWED_ORIGINS ?? '*',
};

// --- КОНЕЦ ИЗМЕНЕНИЙ ---

export interface JwtPayload {
    sub: string;
    email: string;
    iat?: number;
    exp?: number;
}

// ... остальные интерфейсы и декларации остаются без изменений ...