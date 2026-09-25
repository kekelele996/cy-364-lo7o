import { DEFAULT_PORT } from "../common/app.constants";

export const envConfig = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "change_me",
};
