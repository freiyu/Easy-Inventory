// Response envelopes and errors (PRD 6.6). Business errors are thrown as AppError; the error middleware
// turns every error into `{ success: false, error }` and never leaks stack traces or SQL (PRD 7.2).
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ErrorRequestHandler, Response } from "express";
import { z } from "zod";
import { env } from "./env";
import { Prisma } from "./generated/prisma/client";
import { t, type ApiError } from "./shared";

export type ErrorCode = ApiError["code"];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 422,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const fail = (code: ErrorCode, message: string, fields?: Record<string, string>) => new AppError(code, message, fields);
export const notFound = () => fail("NOT_FOUND", t.errors.notFound);
export const forbidden = () => fail("FORBIDDEN", t.errors.forbidden);

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}
export interface Paged<T> {
  rows: T[];
  meta: ListMeta;
}

export const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data: data ?? null });
export const sendList = <T>(res: Response, p: Paged<T>) => res.json({ success: true, data: p.rows, meta: p.meta });

/** Parses input with Zod; the first message per field path becomes `fields` ("lines.0.quantity"). */
export function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_form";
    fields[key] ??= issue.message;
  }
  throw fail("VALIDATION_ERROR", t.errors.fix, fields);
}

/** Writes unexpected errors to the data folder log (PRD 7.2). */
export async function logError(context: string, err: unknown) {
  const line = `${new Date().toISOString()} ${context} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`;
  try {
    const dir = path.join(env.dataDir, "logs");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "ezi-error.log"), line);
  } catch {
    console.error(line);
  }
}

/** A deadlock or write conflict: MySQL rolled the transaction back. Raw queries (row locks) report it as P2010
 *  with the driver's kind, model queries as P2034. */
export function isWriteConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const kind = (err.meta as { driverAdapterError?: { cause?: { kind?: string } } } | undefined)?.driverAdapterError?.cause?.kind;
  return err.code === "P2034" || kind === "TransactionWriteConflict";
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    // Malformed or oversized JSON body.
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: t.errors.fix } });
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    e = fail("CONFLICT", t.errors.nameTaken); // a database unique constraint caught a duplicate (BR-01)
  } else if (isWriteConflict(err)) {
    e = fail("CONFLICT", t.errors.server); // deadlock or write conflict: nothing was saved, the user can retry
  } else {
    void logError(`${req.method} ${req.path}`, err);
    e = fail("INTERNAL_ERROR", t.errors.server);
  }
  res.status(STATUS[e.code]).json({ success: false, error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } });
};
