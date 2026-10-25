// The only place that knows how a request reaches the "server".
// Stage 2: the in-browser mock adapter. Stage 4: replace this file's body with a fetch to /api (same cookie session).
import { handle } from "../mock/adapter";
import type { ApiRequest, Envelope } from "./types";

export const send = (req: ApiRequest): Promise<Envelope<unknown>> => handle(req);
