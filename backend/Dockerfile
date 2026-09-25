FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# 生产依赖中已包含 prisma（供容器启动时执行 migrate deploy）
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 29504
CMD ["./entrypoint.sh"]
