-- 连锁门店库存调配系统数据库初始化脚本
-- 该脚本在 postgres 容器首次启动（空数据卷）时自动执行。

CREATE TABLE IF NOT EXISTS operation_records (
  id SERIAL PRIMARY KEY,
  module_name VARCHAR(120) NOT NULL,
  owner_name VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL,
  metric VARCHAR(40) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO operation_records (module_name, owner_name, status, metric)
SELECT '多门店SKU统一管理', '运营组', 'ready', '100%'
WHERE NOT EXISTS (SELECT 1 FROM operation_records);

-- 门店
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 商品 SKU 主数据
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  spec VARCHAR(120) NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 门店库存；frozen_order_id 非空表示该商品正在盘点、库存变动已暂停
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  quantity INTEGER NOT NULL DEFAULT 0,
  frozen_order_id INTEGER,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_items_store_product_key UNIQUE (store_id, product_id)
);

-- 盘点单；request_key 用于幂等去重，重复提交返回原单
CREATE TABLE IF NOT EXISTS stocktake_orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(60) NOT NULL UNIQUE,
  request_key VARCHAR(80) NOT NULL UNIQUE,
  store_id INTEGER NOT NULL REFERENCES stores (id),
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  operator VARCHAR(80) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- 盘点明细；book_quantity 为开盘点单时的账面快照
CREATE TABLE IF NOT EXISTS stocktake_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES stocktake_orders (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  book_quantity INTEGER NOT NULL,
  actual_quantity INTEGER,
  difference INTEGER,
  CONSTRAINT stocktake_lines_order_product_key UNIQUE (order_id, product_id)
);

-- 库存流水（入库 / 出库 / 盘点调整）
CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  change_type VARCHAR(30) NOT NULL,
  quantity INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  ref_type VARCHAR(40),
  ref_id INTEGER,
  operator VARCHAR(80) NOT NULL,
  note VARCHAR(200),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_store ON inventory_items (store_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_orders_store ON stocktake_orders (store_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_store ON inventory_movements (store_id, product_id);

-- 基础数据
INSERT INTO stores (code, name)
SELECT * FROM (VALUES
  ('ST001', '旗舰店·人民广场'),
  ('ST002', '社区店·滨江路'),
  ('ST003', '商超店·高新万达')
) AS seed (code, name)
WHERE NOT EXISTS (SELECT 1 FROM stores);

INSERT INTO products (sku, name, spec, category)
SELECT * FROM (VALUES
  ('SKU-1001', '有机纯牛奶', '250ml×12盒', '乳制品'),
  ('SKU-1002', '全麦吐司面包', '400g/袋', '烘焙'),
  ('SKU-1003', '冷萃咖啡液', '300ml/瓶', '饮品'),
  ('SKU-1004', '每日坚果混合装', '750g/盒', '休闲食品'),
  ('SKU-1005', '鲜鸡蛋', '30枚/板', '生鲜'),
  ('SKU-1006', '低温酸奶', '135g×8杯', '乳制品'),
  ('SKU-1007', '矿泉水', '550ml×24瓶', '饮品'),
  ('SKU-1008', '五常大米', '5kg/袋', '粮油')
) AS seed (sku, name, spec, category)
WHERE NOT EXISTS (SELECT 1 FROM products);

-- 各门店初始库存
INSERT INTO inventory_items (store_id, product_id, quantity)
SELECT s.id, p.id, q.qty
FROM stores s
JOIN products p ON TRUE
JOIN (VALUES
  ('ST001', 'SKU-1001', 120), ('ST001', 'SKU-1002', 80), ('ST001', 'SKU-1003', 64),
  ('ST001', 'SKU-1004', 45), ('ST001', 'SKU-1005', 96), ('ST001', 'SKU-1006', 150),
  ('ST001', 'SKU-1007', 200), ('ST001', 'SKU-1008', 30),
  ('ST002', 'SKU-1001', 60), ('ST002', 'SKU-1002', 42), ('ST002', 'SKU-1003', 28),
  ('ST002', 'SKU-1004', 18), ('ST002', 'SKU-1005', 50), ('ST002', 'SKU-1006', 72),
  ('ST002', 'SKU-1007', 90), ('ST002', 'SKU-1008', 12),
  ('ST003', 'SKU-1001', 88), ('ST003', 'SKU-1002', 66), ('ST003', 'SKU-1003', 40),
  ('ST003', 'SKU-1004', 25), ('ST003', 'SKU-1005', 70), ('ST003', 'SKU-1006', 110),
  ('ST003', 'SKU-1007', 160), ('ST003', 'SKU-1008', 22)
) AS q (store_code, sku, qty) ON q.store_code = s.code AND q.sku = p.sku
WHERE NOT EXISTS (SELECT 1 FROM inventory_items);
