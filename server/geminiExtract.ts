/**
 * Server-side Gemini call. Mounted by vite.config.ts as /api/extract and /api/health
 * (dev and preview servers), so GEMINI_API_KEY never reaches the browser bundle.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { GoogleGenAI } from "@google/genai";
import { EXTRACTION_PROMPT, policyResponseSchema } from "./schema.ts";

/**
 * Current stable Flash model (GA 2 Sep 2026). gemini-2.5-flash shuts down on 1 Dec 2026.
 * When a model is busy (503 "high demand"), rate-limited, slow or retired, extraction moves
 * down DEFAULT_FALLBACK_MODELS (override with GEMINI_FALLBACK_MODELS, comma-separated).
 */
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const DEFAULT_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
/** Per-model time limit. A healthy Flash model reads a policy in well under a minute. */
const ATTEMPT_TIMEOUT_MS = 75_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // Gemini inline-data request limit
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export interface ExtractConfig {
  apiKey: string | undefined;
  model: string;
  /** Tried in order after `model` fails for a reason another model might not share. */
  fallbackModels?: string[];
}

/** The configured model followed by its fallbacks, without duplicates. */
export function modelChain(config: ExtractConfig): string[] {
  return [...new Set([config.model, ...(config.fallbackModels ?? DEFAULT_FALLBACK_MODELS)].filter(Boolean))];
}

interface ExtractRequestBody {
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES * 1.4) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Errors every model would hit the same way (bad or restricted key), so trying another model is pointless. */
export function isKeyProblem(message: string): boolean {
  return /api key|api_key|permission|unauthori[sz]ed|unauthenticated|"code":\s*40[13]|\b40[13]\b|billing/i.test(message);
}

/** Short, human reason for the upload report. */
export function describeFailure(message: string): string {
  if (/503|high demand|overloaded/i.test(message)) return "was busy (high demand)";
  if (/429|resource.?exhausted|quota|rate/i.test(message)) return "was rate-limited";
  if (/504|deadline|timed? ?out|timeout|abort/i.test(message)) return "was too slow";
  if (/not found|404|is not supported|deprecated|no longer available|retired|shut ?down|unavailable/i.test(message)) return "is unavailable";
  return "failed";
}

/** Gemini 1.x/2.x still accept temperature; 3.x deprecates sampling params. */
function isLegacyModel(model: string): boolean {
  return /^gemini-[12]\./.test(model);
}

async function callGemini(ai: GoogleGenAI, model: string, mimeType: string, dataBase64: string): Promise<unknown> {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType, data: dataBase64 } }, { text: EXTRACTION_PROMPT }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: policyResponseSchema,
      // Determinism comes from the strict schema + normalizeRules; 3.x models ignore/deprecate temperature.
      ...(isLegacyModel(model) ? { temperature: 0 } : {}),
      // Fail fast and let the fallback chain handle it, instead of the SDK's silent 5x backoff.
      httpOptions: { timeout: ATTEMPT_TIMEOUT_MS, retryOptions: { attempts: 1 } },
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return JSON.parse(text);
}

export interface ExtractResult {
  rules: unknown;
  /** The model that actually read the policy. */
  model: string;
  /** Models tried before it, and why each was skipped. */
  skipped: Array<{ model: string; reason: string }>;
}

/** Tries each model in the chain until one returns rules. */
export async function extractPolicyRules(config: ExtractConfig, mimeType: string, dataBase64: string): Promise<ExtractResult> {
  if (!config.apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const skipped: ExtractResult["skipped"] = [];
  let lastError: unknown;
  for (const model of modelChain(config)) {
    try {
      return { rules: await callGemini(ai, model, mimeType, dataBase64), model, skipped };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (isKeyProblem(message)) throw err;
      const reason = describeFailure(message);
      skipped.push({ model, reason });
      console.warn(`[policy-autopsy] ${model} ${reason}: ${message.slice(0, 200)}`);
    }
  }
  const tried = skipped.map((s) => `${s.model} ${s.reason}`).join("; ");
  throw new Error(`Every Gemini model failed (${tried}). Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export function createApiMiddleware(config: ExtractConfig) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (url.startsWith("/api/health")) {
      sendJson(res, 200, { geminiConfigured: Boolean(config.apiKey), model: config.model, fallbackModels: modelChain(config).slice(1) });
      return;
    }
    if (!url.startsWith("/api/extract")) {
      next();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Use POST" });
      return;
    }
    if (!config.apiKey) {
      sendJson(res, 503, { error: "GEMINI_API_KEY is not configured on the server. Add it to .env and restart `npm run dev`." });
      return;
    }
    const started = Date.now();
    try {
      const body = JSON.parse(await readBody(req)) as ExtractRequestBody;
      const mimeType = body.mimeType ?? "application/pdf";
      if (!ALLOWED_MIME.has(mimeType)) {
        sendJson(res, 415, { error: `Unsupported file type ${mimeType}. Upload a PDF or PNG/JPEG/WebP image.` });
        return;
      }
      if (!body.dataBase64) {
        sendJson(res, 400, { error: "Missing dataBase64" });
        return;
      }
      if (body.dataBase64.length * 0.75 > MAX_BODY_BYTES) {
        sendJson(res, 413, { error: "File is larger than 20 MB, the Gemini inline-upload limit." });
        return;
      }
      const result = await extractPolicyRules(config, mimeType, body.dataBase64);
      sendJson(res, 200, {
        rules: result.rules,
        model: result.model,
        latencyMs: Date.now() - started,
        ...(result.skipped.length
          ? {
              notice: `${result.skipped.map((s) => `${s.model} ${s.reason}`).join("; ")}, so ${result.model} read this policy.`,
            }
          : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "PAYLOAD_TOO_LARGE") {
        sendJson(res, 413, { error: "File is larger than 20 MB, the Gemini inline-upload limit." });
        return;
      }
      console.error("[policy-autopsy] extraction failed:", message);
      sendJson(res, 502, {
        error: isKeyProblem(message)
          ? `Gemini rejected the API key (${message}). Check GEMINI_API_KEY in .env and restart the server.`
          : `${message} Try again in a minute, or set GEMINI_MODEL in .env to another current model.`,
      });
    }
  };
}
