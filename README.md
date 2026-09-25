# 连锁门店库存调配系统

面向连锁零售企业，提供多门店库存统一管理、智能调拨和出入库追踪，解决门店间库存不均与缺货问题。

## Docker Compose 快速启动

首次启动前复制环境变量文件：

```bash
cp .env.example .env
docker compose up -d
```

访问地址：

- 前端：http://localhost:28504
- 后端健康检查：http://localhost:29504/health
- API 示例：http://localhost:28504/api/overview

## 项目主要功能

- 多门店SKU统一管理：总部维护商品SKU主数据（名称、规格、条码、分类），各门店关联本地库存，支持批量导入和修改。
- 库存实时同步与预警：各门店库存变动实时同步，设置安全库存阈值，低于阈值时自动触发补货预警通知店长。
- 调拨申请与审批：门店间发起库存调拨申请，填写调拨数量和原因，目标门店确认收货后完成调拨，全程留痕可追溯。
- 出入库记录与盘点：记录每次入库（采购/调拨）和出库（销售/损耗）明细，支持周期性库存盘点，自动计算盘盈盘亏。
- 滞销品分析与补货建议：按销量排名分析各门店滞销商品，生成智能补货建议报表，辅助采购决策。

## 门店盘点（总览页直接使用）

总览页内置「门店盘点」面板，店长选择门店后即可开盘点单：

1. **开盘点单**：勾选要盘点的商品并开始，系统按当前账面数生成快照，同时暂停这些商品在本门店的库存变动（入库/出库会被拒绝并提示），其他门店与其他商品不受影响。
2. **录入实盘数**：按开始时的账面数实时算出盘盈/盘亏；中途关闭窗口会自动暂存，再次进入可继续录入。
3. **提交盘点**：确认后在一个数据库事务内完成库存校准、盘点单归档和盘点调整流水生成；任一步失败整体回滚，不留半成品；网络重试或重复点击提交只会看到首次的结果，不会产生重复流水。
4. **取消盘点**：立即解除所选商品的冻结，库存不做任何变更。
5. **盘点列表**：页面分别列出进行中的盘点单和最近完成/取消的盘点单，可查看盈亏明细与调整流水。

面板下方的「库存出入库」表单可用于验证冻结效果：盘点中的商品提交变动会被拒绝。

主要接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/inventory/stores` | 门店列表 |
| GET | `/inventory/stores/:id/catalog` | 门店商品目录（含库存与冻结状态） |
| POST | `/inventory/movements` | 库存出入库（冻结商品返回 409） |
| GET | `/stocktake/orders?storeId=` | 进行中 + 最近完成的盘点单 |
| POST | `/stocktake/orders` | 开盘点单（`requestKey` 幂等去重） |
| GET | `/stocktake/orders/:id` | 盘点单详情（含明细与调整流水） |
| PATCH | `/stocktake/orders/:id/lines` | 暂存实盘数 |
| POST | `/stocktake/orders/:id/complete` | 提交盘点（事务 + 幂等） |
| POST | `/stocktake/orders/:id/cancel` | 取消盘点并解除冻结 |

前端通过 `/api/...` 访问以上接口（Nginx / Vite 代理会去掉 `/api` 前缀）。


## 本地开发方式

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
npm install
# 本地开发需要一个 PostgreSQL，并设置连接串（与 .env.example 保持一致即可）
export DATABASE_URL="postgresql://app:app_pwd@localhost:5432/app?schema=public"
npx prisma generate
npm run dev
```

数据库表结构由 `database/init.sql` 提供（Docker 部署时自动执行）；本地开发可手动执行：
`psql "$DATABASE_URL" -f ../database/init.sql`

## 技术栈

| 分层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + TypeScript、Element Plus、Vite |
| 后端 | NestJS + TypeScript |
| 数据库 | PostgreSQL |
| 认证 | JWT |
| 依赖 | Prisma、class-validator |

## 项目目录结构

```text
.
├── backend/              # 后端服务
├── database/             # 数据库脚本
├── frontend/             # 前端应用
├── docker-compose.yml    # 一键部署编排
├── .env.example          # 环境变量示例
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
- `docker-compose.yml` 顶层已声明 `name: ldstoreinventory`，并且 `.env` 包含 `COMPOSE_PROJECT_NAME=ldstoreinventory`，可在中文目录名下启动。
- 数据库数据保存在命名卷 `db_data` 中，不依赖当前目录名。
- 数据库首次启动（空数据卷）时自动执行 `database/init.sql` 建表并写入示例门店/商品/库存数据；若需重置，执行 `docker compose down -v` 后重新启动。
- 前端容器由 Nginx 托管静态资源，并把 `/api/` 反向代理到 `backend:29504`。
- 若本地端口冲突，可修改 `.env` 中的 `FRONTEND_PORT`、`BACKEND_PORT`、`DB_PORT`。

常用命令：

```bash
docker compose config --quiet
docker compose ps
docker compose down
```

## License

MIT
