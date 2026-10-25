import { createApp } from "./app";
import { prisma } from "./db";
import { env } from "./env";
import { startDailyBackup } from "./services/backup";

const server = createApp().listen(env.port, env.host, () => {
  console.log(`EZI listening on http://${env.host}:${env.port}`);
});
const timer = startDailyBackup();

const stop = () => {
  clearInterval(timer);
  server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
