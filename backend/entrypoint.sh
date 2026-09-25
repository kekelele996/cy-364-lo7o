#!/bin/sh
set -e

# 等待数据库就绪并执行迁移 + 种子数据（幂等）
echo "[entrypoint] 执行数据库迁移..."
npx prisma migrate deploy

echo "[entrypoint] 执行种子数据（幂等）..."
node prisma/seed.cjs || echo "[entrypoint] 种子数据跳过/失败，继续启动"

echo "[entrypoint] 启动后端服务..."
exec node dist/main.js
