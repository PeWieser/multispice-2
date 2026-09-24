import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schematics = pgTable("schematics", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** full SchematicDoc JSON */
  doc: jsonb("doc").notNull(),
  /** simulation profile (analysis settings, instrument config) */
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const favorites = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    partId: text("part_id").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
    useCount: integer("use_count").notNull().default(1),
    pinned: integer("pinned").notNull().default(0),
  },
  (t) => ({ partUnique: uniqueIndex("favorites_part_id_unique").on(t.partId) }),
);

export const customParts = pgTable("custom_parts", {
  id: serial("id").primaryKey(),
  partId: text("part_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Eigene Bauteile"),
  spice: text("spice").notNull().default(""),
  definition: jsonb("definition").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationRuns = pgTable("simulation_runs", {
  id: serial("id").primaryKey(),
  schematicId: integer("schematic_id").references(() => schematics.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  params: jsonb("params").notNull().default({}),
  summary: jsonb("summary").notNull().default({}),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type Schematic = typeof schematics.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type SimulationRun = typeof simulationRuns.$inferSelect;
