import { NextResponse } from "next/server";
import { parseCOPInput } from "@/lib/formatters";
import type { ScannedReceiptResult } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

const ATTEMPT_TIMEOUT_MS = 14_000;
const OVERALL_DEADLINE_MS = 28_000;
const MAX_IMAGE_BYTES = Math.round(3.5 * 1024 * 1024);

interface ModelCandidate {
  id: string;
  thinkingLevel?: "MINIMAL";
}

const MODEL_CHAIN: readonly ModelCandidate[] = [
  { id: "gemini-3.8-flash", thinkingLevel: "MINIMAL" },
  { id: "gemini-3.5-flash-lite", thinkingLevel: "MINIMAL" },
];

const CONGESTED_ERROR_MESSAGE =
  "Los servidores de IA están congestionados o tardaron demasiado. Intenta de nuevo en unos segundos o ingresa los ítems abajo.";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

interface ScanReceiptRequestBody {
  imageBase64?: string;
  mimeType?: string;
}

interface GeminiRestResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

const SYSTEM_PROMPT = `Eres un extractor rápido de facturas colombianas (COP).
Devuelve ÚNICAMENTE un JSON válido con esta forma exacta:
{"items":[{"name":"Nombre producto","price":32000,"quantity":1}],"tax_amount":0,"tip_amount":0}
Reglas:
- Convierte miles con punto ("32.000") a entero sin decimales (32000).
- price debe ser el valor TOTAL de esa línea (si son 2 unidades de 10.000, price=20000 y quantity=2).
- Excluye líneas de Subtotal, Total, IVA, Impoconsumo, Propina o Cambio de "items".
- tax_amount = impoconsumo/IVA solo si se suma aparte del subtotal; si no, 0.
- tip_amount = propina voluntaria/servicio si aparece; si no, 0.
- Si la foto está borrosa o no es factura, devuelve {"items":[],"tax_amount":0,"tip_amount":0}.`;

function normalizeBase64Payload(raw: string, fallbackMime?: string): {
  data: string;
  mimeType: string;
} {
  const trimmed = raw.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1].toLowerCase(),
      data: dataUrlMatch[2].replace(/\s+/g, ""),
    };
  }
  return {
    mimeType: (fallbackMime ?? "image/jpeg").toLowerCase(),
    data: trimmed.replace(/^data:[^,]+,/, "").replace(/\s+/g, ""),
  };
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function sanitizeScannedResult(raw: unknown): ScannedReceiptResult {
  if (!raw || typeof raw !== "object") {
    return { items: [], tax_amount: 0, tip_amount: 0 };
  }

  const record = raw as Record<string, unknown>;
  const rawItems = Array.isArray(record.items) ? record.items : [];

  const items = rawItems
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const price =
        typeof item.price === "number"
          ? Math.max(0, Math.round(item.price))
          : parseCOPInput(String(item.price ?? ""));
      const rawQty =
        typeof item.quantity === "number"
          ? Math.round(item.quantity)
          : Number.parseInt(String(item.quantity ?? "1"), 10);
      const quantity = Number.isFinite(rawQty) && rawQty >= 1 ? rawQty : 1;

      if (!name || price <= 0) return null;
      return { name, price, quantity };
    })
    .filter(
      (item): item is { name: string; price: number; quantity: number } =>
        item !== null
    );

  const tax_amount =
    typeof record.tax_amount === "number"
      ? Math.max(0, Math.round(record.tax_amount))
      : parseCOPInput(String(record.tax_amount ?? ""));

  const tip_amount =
    typeof record.tip_amount === "number"
      ? Math.max(0, Math.round(record.tip_amount))
      : parseCOPInput(String(record.tip_amount ?? ""));

  return { items, tax_amount, tip_amount };
}

function sanitizeDetailText(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]+/g, "[KEY]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

interface ModelAttemptOutcome {
  ok: boolean;
  text?: string;
  httpStatus?: number;
  retryNext: boolean;
  isAuthError: boolean;
  attemptError: string;
}

async function callGeminiRest(
  apiKey: string,
  candidate: ModelCandidate,
  imageBase64: string,
  mimeType: string,
  timeoutMs: number,
  includeThinking = true
): Promise<ModelAttemptOutcome> {
  const effectiveTimeout = Math.max(2_000, Math.min(ATTEMPT_TIMEOUT_MS, timeoutMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  const generationConfig: Record<string, unknown> = {
    temperature: 0.1,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
    ...(includeThinking && candidate.thinkingLevel
      ? { thinkingConfig: { thinkingLevel: candidate.thinkingLevel } }
      : {}),
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    candidate.id
  )}:generateContent`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: "Extrae items, tax_amount y tip_amount en JSON.",
              },
            ],
          },
        ],
        generationConfig,
      }),
    });

    const rawBody = await response.text();
    let parsedBody: GeminiRestResponse | null = null;
    try {
      parsedBody = rawBody ? (JSON.parse(rawBody) as GeminiRestResponse) : null;
    } catch {
      parsedBody = null;
    }

    if (!response.ok) {
      const apiMsg = sanitizeDetailText(
        parsedBody?.error?.message || rawBody || response.statusText
      );

      // Si algún modelo rechaza thinkingConfig con 400, reintenta ese modelo sin thinkingConfig
      if (
        includeThinking &&
        response.status === 400 &&
        /thinking/i.test(apiMsg)
      ) {
        clearTimeout(timer);
        return await callGeminiRest(
          apiKey,
          candidate,
          imageBase64,
          mimeType,
          timeoutMs,
          false
        );
      }

      const isAuth = response.status === 401 || response.status === 403;
      const shouldRetry =
        response.status === 404 ||
        response.status === 429 ||
        response.status === 503 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 504;

      return {
        ok: false,
        httpStatus: response.status,
        retryNext: shouldRetry,
        isAuthError: isAuth,
        attemptError: `${candidate.id} -> HTTP ${response.status}: ${apiMsg}`,
      };
    }

    const parts = parsedBody?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const reason = parsedBody?.candidates?.[0]?.finishReason ?? "EMPTY";
      return {
        ok: false,
        httpStatus: 422,
        retryNext: false,
        isAuthError: false,
        attemptError: `${candidate.id} -> Respuesta vacía (${reason})`,
      };
    }

    return {
      ok: true,
      text,
      retryNext: false,
      isAuthError: false,
      attemptError: "",
    };
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    const msg = sanitizeDetailText(
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    );

    return {
      ok: false,
      httpStatus: isAbort ? 504 : 500,
      retryNext: true,
      isAuthError: false,
      attemptError: isAbort
        ? `${candidate.id} -> Timeout (${Math.round(effectiveTimeout / 1000)}s)`
        : `${candidate.id} -> Red: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  let payloadKb = 0;

  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Falta configurar GEMINI_API_KEY en las variables de entorno del servidor. Mientras tanto, puedes ingresar los ítems manualmente.",
          statusCode: 500,
          detail: "ConfigError · GEMINI_API_KEY ausente o vacía",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as ScanReceiptRequestBody;
    if (!body?.imageBase64 || typeof body.imageBase64 !== "string") {
      return NextResponse.json(
        {
          error: "No recibimos ninguna imagen de la factura.",
          statusCode: 400,
          detail: "ValidationError · HTTP 400: imageBase64 faltante",
        },
        { status: 400 }
      );
    }

    const { data, mimeType } = normalizeBase64Payload(
      body.imageBase64,
      body.mimeType
    );

    if (!data || data.length < 100) {
      return NextResponse.json(
        {
          error: "La imagen enviada parece estar vacía o dañada.",
          statusCode: 400,
          detail: "ValidationError · HTTP 400: Payload de imagen vacío",
        },
        { status: 400 }
      );
    }

    const approximateBytes = Math.round((data.length * 3) / 4);
    payloadKb = Math.round(approximateBytes / 1024);

    if (approximateBytes > MAX_IMAGE_BYTES) {
      const sizeMb = (approximateBytes / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error:
            "La foto pesa más de 3.5 MB. Toma una foto más ligera o desde un poco más lejos para continuar.",
          statusCode: 413,
          detail: `PayloadTooLarge · ${payloadKb} KB (${sizeMb} MB > 3.5 MB)`,
        },
        { status: 413 }
      );
    }

    const safeMimeType = ALLOWED_MIME_TYPES.has(mimeType)
      ? mimeType === "image/jpg"
        ? "image/jpeg"
        : mimeType
      : "image/jpeg";

    const deadlineAt = Date.now() + OVERALL_DEADLINE_MS;
    const attemptErrors: string[] = [];
    let winnerModel = "";
    let winnerText = "";
    let lastHttpStatus = 503;

    for (const candidate of MODEL_CHAIN) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs < 2_000) {
        attemptErrors.push(`${candidate.id} -> Omitido (sin tiempo restante)`);
        break;
      }

      const outcome = await callGeminiRest(
        apiKey,
        candidate,
        data,
        safeMimeType,
        remainingMs
      );

      if (outcome.ok && outcome.text) {
        winnerModel = candidate.id;
        winnerText = outcome.text;
        break;
      }

      if (outcome.httpStatus) {
        lastHttpStatus = outcome.httpStatus;
      }
      attemptErrors.push(outcome.attemptError);
      console.warn(`[scan-receipt] (${payloadKb} KB) ${outcome.attemptError}`);

      if (outcome.isAuthError) {
        const authStatus = outcome.httpStatus ?? 403;
        return NextResponse.json(
          {
            error:
              "La clave de Gemini API fue rechazada o no tiene permisos activos. Revisa GEMINI_API_KEY en Vercel.",
            statusCode: authStatus,
            detail: `Imagen: ${payloadKb} KB | ${attemptErrors.join(" | ")}`,
          },
          { status: authStatus }
        );
      }

      if (!outcome.retryNext) {
        break;
      }
    }

    if (!winnerText) {
      const finalStatus =
        lastHttpStatus === 422 || lastHttpStatus === 400 ? lastHttpStatus : 503;
      return NextResponse.json(
        {
          error: CONGESTED_ERROR_MESSAGE,
          statusCode: finalStatus,
          detail: `Imagen: ${payloadKb} KB | ${attemptErrors.join(" | ")}`,
        },
        { status: finalStatus }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonCodeFences(winnerText));
    } catch {
      return NextResponse.json(
        {
          error:
            "La IA devolvió una respuesta inesperada al leer la foto. Puedes reintentar o agregar los ítems a mano.",
          statusCode: 422,
          detail: `Imagen: ${payloadKb} KB | ${winnerModel} -> JSON inválido`,
        },
        { status: 422 }
      );
    }

    const result = sanitizeScannedResult(parsed);

    if (result.items.length === 0) {
      return NextResponse.json(
        {
          error:
            "No encontramos ítems legibles en esta foto. Puede estar borrosa o con poca luz; intenta tomarla de nuevo o agrégalos manualmente.",
          statusCode: 422,
          detail: `Imagen: ${payloadKb} KB | ${winnerModel} -> 0 ítems detectados`,
          result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const msg = sanitizeDetailText(
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    );
    console.error("[scan-receipt] Error inesperado:", error);

    return NextResponse.json(
      {
        error:
          "Hubo un problema conectando con la IA para leer la factura. Intenta de nuevo o ingresa los ítems manualmente.",
        statusCode: 500,
        detail: `Imagen: ${payloadKb} KB | ${msg}`,
      },
      { status: 500 }
    );
  }
}
