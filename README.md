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
npm run dev
```

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
