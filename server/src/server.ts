import { buildServer } from "./app.js";

const app = buildServer();
const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`Intelligent Bistro server listening on ${host}:${port}`);
  })
  .catch(async (error) => {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  });
