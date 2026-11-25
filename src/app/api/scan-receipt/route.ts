import { NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { parseCOPInput } from "@/lib/formatters";
import type { ScannedReceiptResult } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.8-flash-lite";
const ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_IMAGE_BYTES = Math.round(3.5 * 1024 * 1024);

const CONGESTED_ERROR_MESSAGE =
  "Los servidores de IA están congestionados en este momento, intenta de nuevo en unos segundos o ingresa los ítems abajo";

const TIMEOUT_ERROR_MESSAGE =
  "La lectura de la factura tardó más de 25 segundos. Intenta con una foto más nítida o ingresa los ítems abajo.";

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

const receiptResponseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description:
        "Productos consumidos. Excluye subtotales, totales, impuestos y propina.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          price: {
            type: Type.INTEGER,
            description: "Valor TOTAL de la línea en pesos COP enteros.",
          },
          quantity: { type: Type.INTEGER },
        },
        required: ["name", "price", "quantity"],
      },
    },
    tax_amount: {
      type: Type.INTEGER,
      description: "Impoconsumo o IVA si se suma aparte, si no 0.",
    },
    tip_amount: {
      type: Type.INTEGER,
      description: "Propina voluntaria si aparece, si no 0.",
    },
  },
  required: ["items", "tax_amount", "tip_amount"],
};

const SYSTEM_PROMPT =
  "Extrae ítems de facturas colombianas (COP). Convierte miles con punto (32.000) a entero (32000). price = total de la línea. Excluye subtotales/totales de items. tax_amount = impoconsumo/IVA si se suma aparte, si no 0. tip_amount = propina si aparece, si no 0. Si es ilegible, devuelve items: [].";

function normalizeBase64Payload(raw: string, fallbackMime?: string): {
  data: string;
  mimeType: string;
} {
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1].toLowerCase(),
      data: dataUrlMatch[2].trim(),
    };
  }
  return {
    mimeType: (fallbackMime ?? "image/jpeg").toLowerCase(),
    data: raw.trim(),
  };
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

interface ErrorClassification {
  isTimeout: boolean;
  isRateOrUnavailable: boolean;
  isAuthError: boolean;
  thinkingUnsupported: boolean;
  httpStatus: number | null;
  errorName: string;
  rawMessage: string;
}

function sanitizeDetailText(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]+/g, "[KEY]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function classifyGeminiError(error: unknown): ErrorClassification {
  const errObj =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;

  const rawStatus =
    typeof errObj?.status === "number"
      ? errObj.status
      : typeof errObj?.statusCode === "number"
      ? errObj.statusCode
      : null;

  // Evita confundir DOMException.code (ej: 20 = ABORT_ERR) con códigos HTTP
  const httpStatus =
    rawStatus !== null && rawStatus >= 100 && rawStatus <= 599
      ? rawStatus
      : null;

  const errorName =
    error instanceof Error
      ? error.name
      : typeof errObj?.name === "string"
      ? errObj.name
      : "Error";

  const message =
    error instanceof Error
      ? error.message
      : typeof errObj?.message === "string"
      ? errObj.message
      : String(error ?? "");

  const cause =
    errObj?.cause && typeof errObj.cause === "object"
      ? (errObj.cause as Record<string, unknown>)
      : null;
  const causeCode = typeof cause?.code === "string" ? cause.code : "";
  const combined = `${errorName} ${causeCode} ${message}`.toLowerCase();

  const isTimeout =
    errorName === "TimeoutError" ||
    errorName === "AbortError" ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "ETIMEDOUT" ||
    combined.includes("timeout") ||
    combined.includes("aborted");

  // Solo 429 o 503 explícitos habilitan fallback a gemini-3.8-flash-lite
  const isRateOrUnavailable =
    !isTimeout &&
    (httpStatus === 429 ||
      httpStatus === 503 ||
      combined.includes("429") ||
      combined.includes("503") ||
      combined.includes("resource_exhausted") ||
      combined.includes("unavailable"));

  const isAuthError =
    httpStatus === 401 ||
    httpStatus === 403 ||
    combined.includes("api_key_invalid") ||
    combined.includes("api key not valid") ||
    combined.includes("permission_denied");

  const thinkingUnsupported =
    httpStatus === 400 &&
    (combined.includes("thinking") || combined.includes("thinkinglevel"));

  const rawMessage = sanitizeDetailText(
    causeCode && !message.includes(causeCode)
      ? `${causeCode}: ${message}`
      : message || "Sin detalle adicional"
  );

  return {
    isTimeout,
    isRateOrUnavailable,
    isAuthError,
    thinkingUnsupported,
    httpStatus,
    errorName,
    rawMessage,
  };
}

function formatDiagnosticDetail(
  model: string,
  info: ErrorClassification
): string {
  if (info.isTimeout) {
    return `Timeout (${info.errorName}) · ${model}: ${info.rawMessage}`;
  }
  const statusLabel = info.httpStatus ? `HTTP ${info.httpStatus}` : "API Error";
  return `${info.errorName} · ${statusLabel} · ${model}: ${info.rawMessage}`;
}

async function generateWithTimeout(
  ai: GoogleGenAI,
  model: string,
  imageBase64: string,
  mimeType: string,
  timeoutMs: number,
  includeThinkingConfig = true
) {
  const effectiveTimeout = Math.max(2_000, Math.min(ATTEMPT_TIMEOUT_MS, timeoutMs));
  const abortSignal = AbortSignal.timeout(effectiveTimeout);

  return await ai.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          data: imageBase64,
          mimeType,
        },
      },
      {
        text: "Extrae ítems, tax_amount y tip_amount en JSON.",
      },
    ],
    config: {
      abortSignal,
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: receiptResponseSchema,
      ...(includeThinkingConfig
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
        : {}),
    },
  });
}

async function callModelSafe(
  ai: GoogleGenAI,
  model: string,
  imageBase64: string,
  mimeType: string,
  timeoutMs: number
) {
  try {
    return await generateWithTimeout(
      ai,
      model,
      imageBase64,
      mimeType,
      timeoutMs,
      true
    );
  } catch (err) {
    const info = classifyGeminiError(err);
    if (info.thinkingUnsupported) {
      return await generateWithTimeout(
        ai,
        model,
        imageBase64,
        mimeType,
        timeoutMs,
        false
      );
    }
    throw err;
  }
}

export async function POST(request: Request) {
  let activeModel = PRIMARY_MODEL;

  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Falta configurar GEMINI_API_KEY en las variables de entorno del servidor. Mientras tanto, puedes ingresar los ítems manualmente.",
          statusCode: 500,
          detail: "ConfigError · HTTP 500: GEMINI_API_KEY ausente o vacía",
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
    if (approximateBytes > MAX_IMAGE_BYTES) {
      const sizeMb = (approximateBytes / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error:
            "La foto pesa más de 3.5 MB. Toma una foto más ligera o desde un poco más lejos para continuar.",
          statusCode: 413,
          detail: `PayloadTooLarge · HTTP 413: Imagen de ${sizeMb} MB (> 3.5 MB)`,
        },
        { status: 413 }
      );
    }

    const safeMimeType = ALLOWED_MIME_TYPES.has(mimeType)
      ? mimeType === "image/jpg"
        ? "image/jpeg"
        : mimeType
      : "image/jpeg";

    const ai = new GoogleGenAI({ apiKey });
    const startedAt = Date.now();

    let response;
    try {
      activeModel = PRIMARY_MODEL;
      response = await callModelSafe(
        ai,
        PRIMARY_MODEL,
        data,
        safeMimeType,
        ATTEMPT_TIMEOUT_MS
      );
    } catch (primaryErr) {
      const primaryInfo = classifyGeminiError(primaryErr);

      // Reintentar con gemini-3.8-flash-lite ÚNICAMENTE si Google devolvió 429 o 503 explícito
      if (primaryInfo.isRateOrUnavailable) {
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = Math.max(5_000, ATTEMPT_TIMEOUT_MS - elapsedMs);
        console.warn(
          `[scan-receipt] ${PRIMARY_MODEL} devolvió ${primaryInfo.httpStatus ?? "429/503"}, intentando respaldo ${FALLBACK_MODEL}`
        );
        activeModel = FALLBACK_MODEL;
        response = await callModelSafe(
          ai,
          FALLBACK_MODEL,
          data,
          safeMimeType,
          remainingMs
        );
      } else {
        throw primaryErr;
      }
    }

    const rawText = response.text?.trim();
    if (!rawText) {
      return NextResponse.json(
        {
          error:
            "No pudimos leer los datos de la factura. Revisa que la foto esté enfocada o agrega los ítems manualmente.",
          statusCode: 422,
          detail: `EmptyResponse · HTTP 422 · ${activeModel}: respuesta vacía`,
        },
        { status: 422 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error:
            "La IA devolvió una respuesta inesperada al leer la foto. Puedes reintentar o agregar los ítems a mano.",
          statusCode: 422,
          detail: `SyntaxError · HTTP 422 · ${activeModel}: JSON inválido`,
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
          detail: `UnreadableReceipt · HTTP 422 · ${activeModel}: 0 ítems detectados`,
          result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const info = classifyGeminiError(error);
    const detail = formatDiagnosticDetail(activeModel, info);
    console.error("[scan-receipt] Error analizando factura:", detail, error);

    if (info.isTimeout) {
      return NextResponse.json(
        {
          error: TIMEOUT_ERROR_MESSAGE,
          statusCode: 504,
          detail,
        },
        { status: 504 }
      );
    }

    if (info.isRateOrUnavailable) {
      const status = info.httpStatus === 429 ? 429 : 503;
      return NextResponse.json(
        {
          error: CONGESTED_ERROR_MESSAGE,
          statusCode: status,
          detail,
        },
        { status }
      );
    }

    if (info.isAuthError) {
      const status = info.httpStatus ?? 403;
      return NextResponse.json(
        {
          error:
            "La clave de Gemini API fue rechazada o no tiene permisos activos. Revisa GEMINI_API_KEY en Vercel.",
          statusCode: status,
          detail,
        },
        { status }
      );
    }

    const httpStatus = info.httpStatus ?? 500;
    return NextResponse.json(
      {
        error:
          "Hubo un problema conectando con la IA para leer la factura. Intenta de nuevo o ingresa los ítems manualmente.",
        statusCode: httpStatus,
        detail,
      },
      { status: httpStatus }
    );
  }
}
