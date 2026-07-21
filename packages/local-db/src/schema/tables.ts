import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Dine-in tables for the floor plan. Position (pos_x/pos_y) and shape are part
 * of the layout the manager arranges; status/covers/seated_at are live service
 * state the till mutates through the day.
 */
export const diningTables = sqliteTable(
  'dining_tables',
  {
    id: text('id').primaryKey(),
    locationId: text('location_id').notNull(),
    area: text('area').notNull(), // 'main' | 'bar' | 'terrace'
    number: text('number').notNull(), // display label, e.g. 'T-1'
    seats: integer('seats').notNull(),
    shape: text('shape', { enum: ['round', 'square'] })
      .notNull()
      .default('square'),
    /** Canvas position in the floor map, in px. */
    posX: integer('pos_x').notNull().default(0),
    posY: integer('pos_y').notNull().default(0),
    status: text('status', {
      enum: ['available', 'occupied', 'bill_requested', 'needs_clean'],
    })
      .notNull()
      .default('available'),
    /** People currently seated. */
    covers: integer('covers').notNull().default(0),
    /** When the party sat down; null when the table is free. */
    seatedAt: text('seated_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_dining_tables_location').on(t.locationId, t.area)],
);
