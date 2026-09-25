FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --include=dev --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build

FROM node:20
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
EXPOSE 29504
CMD ["node", "dist/main.js"]
