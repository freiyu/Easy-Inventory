// One process, one port (PRD 0.2, 7.2): /api is the REST API, everything else is the static Next.js export.
import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import { loadSession, sameOrigin } from "./auth";
import { env } from "./env";
import { errorHandler } from "./http";
import { langOf, runInLang } from "./shared";
import { api } from "./routes";

// Basic security headers (PRD 6.7). The static export uses small inline scripts, hence 'unsafe-inline'.
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  next();
};

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders);
  // The language starts after body parsing: the parser's stream callbacks would not keep the request context.
  app.use("/api", noStore, express.json({ limit: "2mb" }), cookieParser(env.sessionSecret),
    (req, _res, next) => runInLang(langOf(req.get("x-ezi-lang")), next), sameOrigin, loadSession, api);
  if (existsSync(env.staticDir)) {
    // Next exports /login as login.html next to a login/ folder; serve the page instead of redirecting into the folder.
    app.use((req, res, next) => {
      if ((req.method !== "GET" && req.method !== "HEAD") || req.path === "/" || path.extname(req.path)) return next();
      res.sendFile(`${req.path.replace(/\/$/, "")}.html`, { root: env.staticDir }, (err) => err && !res.headersSent && next());
    });
    app.use(express.static(env.staticDir, { extensions: ["html"] }));
    app.use((_req, res) => res.status(404).sendFile(path.join(env.staticDir, "404.html")));
  }
  app.use(errorHandler);
  return app;
}
