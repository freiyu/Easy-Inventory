import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "./env";
import { Prisma, PrismaClient } from "./generated/prisma/client";

// The MariaDB driver speaks MySQL 8; it wants its own URL scheme, and the key exchange for MySQL 8 passwords
// on a localhost connection without TLS.
const url = new URL(env.databaseUrl.replace(/^mysql:/, "mariadb:"));
url.searchParams.set("allowPublicKeyRetrieval", "true");

export const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url.toString()) });
export type Tx = Prisma.TransactionClient;
export { Prisma };

/** Database connection details for mysqldump (backup). */
export const dbConfig = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
};
