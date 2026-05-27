// Файл: src/config.d.ts

// Импортируем основной тип Config, чтобы дополнить его
import { Config } from './config';

// Эта декларация говорит TypeScript, что экспортируемый объект 'config'
// имеет все свойства типа Config ПЛЮС дополнительное свойство CORS_ORIGIN.
declare module './config' {
  const config: Config & {
    CORS_ORIGIN: string; // Объявляем новое свойство
  };
  export default config;
}