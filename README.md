# 连锁门店库存调配系统

面向连锁零售企业，提供多门店库存统一管理、智能调拨和出入库追踪，解决门店间库存不均与缺货问题。总览页可直接发起门店盘点：选择商品开始盘点后自动暂停这些商品的库存变动，录入实盘数并确认后一次性更新库存、生成盘点与调整流水。

## Docker Compose 快速启动

首次启动前复制环境变量文件：

```bash
cp .env.example .env
docker compose up -d
```

访问地址：

- 前端：http://localhost:28504
- 后端健康检查：http://localhost:29504/health
- API 示例：http://localhost:28504/api/stores

后端容器启动时会自动执行数据库迁移（`prisma migrate deploy`）和幂等的种子数据（3 家门店、8 个 SKU 及初始库存）。

## 门店盘点能力（总览页直接发起）

在总览页选择门店、勾选要盘点的商品后点击「开始盘点」，即可在一张盘点单里完成整个闭环：

- **开始即冻结账面**：以开始时刻的账面库存作为快照，盘盈盘亏始终按快照计算；
- **库存定向暂停**：盘点期间该门店被勾选商品的出入库一律拒绝（返回 409），其他商品与其他门店完全不受影响；
- **中途退出可继续**：实盘数可随时暂存，关闭页面后从总览盘点列表点「继续」回到原单据；
- **确认一次生效**：库存更新、调整流水、盘点完结在同一个数据库事务中完成，任一步失败整体回滚，不留半成品；
- **重复提交幂等**：网络重试或重复点击确认，只会看到同一份结果，不会二次调整库存或重复生成流水；
- **取消即解除暂停**：取消盘点后商品库存立即恢复变动，已录入数据保留留痕；
- **盘点列表**：总览页列出所有进行中的盘点（置顶）和最近完成/取消的盘点。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stores` | 门店列表 |
| GET | `/api/stores/:id/products` | 门店商品、库存及盘点暂停状态 |
| POST | `/api/stocktakes` | 开始盘点（`storeId` + `productIds`） |
| GET | `/api/stocktakes` | 盘点单列表（进行中在前） |
| GET | `/api/stocktakes/:id` | 盘点单详情（含账面快照、实盘、差异） |
| POST | `/api/stocktakes/:id/counts` | 暂存实盘数 |
| POST | `/api/stocktakes/:id/confirm` | 确认盘点（幂等） |
| POST | `/api/stocktakes/:id/cancel` | 取消盘点（解除暂停） |
| POST | `/api/stores/:id/transactions` | 入库/出库（盘点暂停时返回 409） |
| GET | `/api/stores/:id/transactions` | 出入库及盘点调整流水 |

## 项目主要功能

- 多门店SKU统一管理：总部维护商品SKU主数据（名称、规格、条码、分类），各门店关联本地库存。
- 库存实时同步与预警：各门店库存变动留痕，按安全库存阈值提示补货。
- 出入库记录与盘点：记录入库（采购/期初）和出库（销售）明细，支持门店盘点，自动计算盘盈盘亏并生成调整流水。
- 库存变动暂停：盘点进行中对指定门店、指定商品冻结出入库，互不干扰。

## 本地开发方式

前端：

```bash
cd frontend
npm install
npm run dev
```

后端（需要 PostgreSQL，连接串取 `DATABASE_URL` 或 `DB_*` 环境变量）：

```bash
cd backend
npm install
npx prisma migrate deploy
npm run dev
```

无本地 PostgreSQL 时，可使用内置的 PGlite（WASM 版 Postgres）联调模式，数据与种子自动就绪：

```bash
cd backend
npm run dev:pglite
```

### 自动化测试

后端自带两套无需外部数据库的测试（基于 PGlite）：

```bash
cd backend
npm test
```

- `test:int`：服务层集成测试（41 项断言，覆盖快照、暂停、事务回滚、幂等、取消、排序等）；
- `test:http`：启动真实 Nest HTTP 服务的接口冒烟测试，覆盖校验、409 守卫与完整盘点闭环。

## 技术栈

| 分层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + TypeScript、Element Plus、Vite |
| 后端 | NestJS + TypeScript |
| 数据库 | PostgreSQL |
| ORM | Prisma 6（迁移 + 驱动适配器） |
| 校验 | class-validator / class-transformer |
| 测试 | PGlite（WASM Postgres）+ 自实现 Prisma 驱动适配器 |

## 项目目录结构

```text
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # 门店/商品/库存/盘点/流水 数据模型
│   │   ├── migrations/          # 数据库迁移
│   │   └── seed.cjs             # 幂等种子数据
│   ├── src/
│   │   ├── stocktake/           # 盘点单：开始/录入/确认/取消
│   │   ├── inventory/           # 出入库（含盘点暂停守卫）
│   │   ├── prisma/              # Prisma 服务与全局模块
│   │   └── overview/            # 总览
│   ├── test/                    # PGlite 适配器、集成与 HTTP 测试
│   └── entrypoint.sh            # 容器内迁移 + 种子 + 启动
├── database/init.sql            # 建表参考脚本
├── frontend/
│   └── src/
│       ├── api/stocktake.ts     # 盘点相关 API
│       ├── components/stocktake/  # 开始/录入对话框、盘点列表、流水抽屉
│       └── App.vue              # 总览页
├── docker-compose.yml
└── README.md
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名，避免中文目录名导致项目名为空 | ldstoreinventory |
| DB_NAME | 数据库名称 | app |
| DB_USER | 数据库用户 | app |
| DB_PASSWORD | 数据库密码 | app_pwd |
| DB_ROOT_PASSWORD | 数据库 root 密码 | root_pwd |
| JWT_SECRET | JWT 签名密钥 | change_me_to_a_long_random_string |
| FRONTEND_PORT | 前端宿主机端口 | 28504 |
| BACKEND_PORT | 后端宿主机端口 | 29504 |
| DB_PORT | 数据库宿主机端口 | 5432 |

## Docker 部署说明

- 使用 `docker compose up -d` 启动，不需要额外传入 `-p`。
- `docker-compose.yml` 顶层已声明 `name: ldstoreinventory`，并且 `.env` 包含 `COMPOSE_PROJECT_NAME=ldstoreinventory`，在中文目录名下也可启动。
- 数据库数据保存在命名卷 `db_data` 中，不依赖当前目录名。
- 前端容器由 Nginx 托管静态资源，并把 `/api/` 反向代理到 `backend:29504`（代理时去掉 `/api` 前缀）。
- 后端容器启动自动执行迁移与幂等种子；若本地端口冲突，可修改 `.env` 中的端口变量。

## License

MIT
