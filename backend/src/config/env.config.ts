import { DEFAULT_PORT } from "../common/app.constants";

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const name = process.env.DB_NAME ?? "app";
  const user = process.env.DB_USER ?? "app";
  const password = process.env.DB_PASSWORD ?? "app_pwd";
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

export const envConfig = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  databaseUrl: buildDatabaseUrl(),
  jwtSecret: process.env.JWT_SECRET ?? "change_me",
};
