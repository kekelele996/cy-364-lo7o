-- 连锁门店库存调配系统 - 基础表结构参考脚本
-- 实际部署由后端 Prisma 迁移（prisma/migrations）自动建表，
-- 本文件仅作为脱离 Prisma 时的建表参考。

CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  manager TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  spec TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '件',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_inventories (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  safety_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (store_id, product_id)
);

DO $$ BEGIN
  CREATE TYPE "StocktakeStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CountStatus" AS ENUM ('PENDING', 'COUNTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stocktakes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  status "StocktakeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  remark TEXT,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP(3),
  created_by TEXT NOT NULL DEFAULT '店长',
  completed_by TEXT
);
CREATE INDEX IF NOT EXISTS stocktakes_store_status_idx ON stocktakes (store_id, status);

CREATE TABLE IF NOT EXISTS stocktake_items (
  id SERIAL PRIMARY KEY,
  stocktake_id INTEGER NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  book_quantity INTEGER NOT NULL,
  counted_qty INTEGER,
  count_status "CountStatus" NOT NULL DEFAULT 'PENDING',
  variance INTEGER,
  counted_at TIMESTAMP(3),
  UNIQUE (stocktake_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,
  change_qty INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_code TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL DEFAULT '系统'
);
CREATE INDEX IF NOT EXISTS inventory_tx_store_created_idx
  ON inventory_transactions (store_id, created_at);
