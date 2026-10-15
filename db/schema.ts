import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const shops = sqliteTable('shops', { owner: text('owner').primaryKey(), data: text('data').notNull(), revision: integer('revision').notNull().default(1) });
