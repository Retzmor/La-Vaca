import { NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { parseCOPInput } from "@/lib/formatters";
import type { ScannedReceiptResult } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 45;

const PRIMARY_MODEL = "gemini-3.8-flash";
const STATIC_FALLBACK_MODELS = ["gemini-3.8-flash-lite", "gemini-3.5-flash"] as const;
const ATTEMPT_TIMEOUT_MS = 12_000;
const OVERALL_DEADLINE_MS = 20_000;
const LIST_MODELS_TIMEOUT_MS = 3_500;
const MAX_MODEL_ATTEMPTS = 4;

const CONGESTED_ERROR_MESSAGE =
  "Los servidores de IA están congestionados en este momento, intenta de nuevo en unos segundos o ingresa los ítems abajo";

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
        "Lista de productos o platos consumidos en la factura. Excluye subtotales, totales, impuestos y propina.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Nombre claro y limpio del producto o plato.",
          },
          price: {
            type: Type.INTEGER,
            description:
              "Valor TOTAL de esa línea en pesos colombianos enteros sin decimales ni puntos (ej: 32000). Si quantity > 1, price DEBE ser el valor total de la línea completa.",
          },
          quantity: {
            type: Type.INTEGER,
            description: "Cantidad de unidades en esa línea (entero >= 1).",
          },
        },
        required: ["name", "price", "quantity"],
      },
    },
    tax_amount: {
      type: Type.INTEGER,
      description:
        "Valor total de impoconsumo (IPOCONSUMO / INC) o IVA si aparece desglosado aparte del subtotal. Si los precios ya incluyen impuesto o no aparece desglosado, devuelve 0.",
    },
    tip_amount: {
      type: Type.INTEGER,
      description:
        "Valor de la propina voluntaria / servicio si aparece en la factura. Si no aparece, devuelve 0.",
    },
  },
  required: ["items", "tax_amount", "tip_amount"],
};

const SYSTEM_PROMPT = `Eres un experto leyendo facturas y tirillas de restaurantes, bares y domicilios de Colombia (pesos colombianos COP).

Instrucciones estrictas:
1. Extrae únicamente los ítems consumidos (platos, bebidas, entradas, postres, domicilios). NO incluyas líneas de "Subtotal", "Total", "IVA", "Impoconsumo", "Propina", "Servicio", "Cambio", "Efectivo" ni "Datáfono" dentro de "items".
2. Convierte TODOS los precios colombianos con puntos de miles (ej: "32.000", "$ 45.500", "12.000,00") a números enteros en COP sin decimales (ej: 32000, 45500, 12000).
3. Para cada ítem:
   - "quantity" es la cantidad de unidades (por defecto 1).
   - "price" SIEMPRE debe ser el valor TOTAL de esa línea (si dice "2 Cerveza Club Colombia 10.000 c/u = 20.000", devuelve quantity: 2 y price: 20000; si solo muestra el precio unitario 10.000 con cantidad 2, multiplica y devuelve price: 20000).
4. En "tax_amount": incluye el valor entero de Impoconsumo (INC/IPO) o IVA SOLO si se suma adicionalmente sobre el subtotal de los ítems. Si los precios de los ítems ya tienen impuestos incluidos (el subtotal de ítems ya suma igual al total antes de propina), devuelve 0 para evitar cobrar el impuesto doble.
5. En "tip_amount": incluye el valor entero de propina voluntaria / servicio sugerido si figura en la factura; si no aparece, devuelve 0.
6. Si la imagen está borrosa, ilegible o no corresponde a una factura, devuelve items: [], tax_amount: 0, tip_amount: 0.`;

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
  retryable: boolean;
  congested: boolean;
  thinkingUnsupported: boolean;
  statusCode: number | null;
}

function classifyGeminiError(error: unknown): ErrorClassification {
  const errObj =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;

  const statusCode =
    typeof errObj?.status === "number"
      ? errObj.status
      : typeof errObj?.code === "number"
      ? errObj.code
      : null;

  const name = typeof errObj?.name === "string" ? errObj.name : "";
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
  const combined = `${name} ${causeCode} ${message}`.toLowerCase();

  const isTimeout =
    name === "TimeoutError" ||
    name === "AbortError" ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "ETIMEDOUT" ||
    combined.includes("timeout") ||
    combined.includes("aborted");

  const isOverloaded =
    statusCode === 503 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 504 ||
    combined.includes("503") ||
    combined.includes("429") ||
    combined.includes("unavailable") ||
    combined.includes("resource_exhausted") ||
    combined.includes("high demand") ||
    combined.includes("overloaded") ||
    combined.includes("rate limit");

  const isNotFound =
    statusCode === 404 ||
    combined.includes("404") ||
    combined.includes("not found") ||
    combined.includes("not supported for generatecontent");

  const thinkingUnsupported =
    (statusCode === 400 || combined.includes("400") || combined.includes("invalid_argument")) &&
    (combined.includes("thinking") ||
      combined.includes("thinkingbudget") ||
      combined.includes("thinkinglevel"));

  return {
    retryable: isTimeout || isOverloaded || isNotFound,
    congested: isTimeout || isOverloaded,
    thinkingUnsupported,
    statusCode,
  };
}

function getThinkingConfigForModel(model: string) {
  if (model.includes("gemini-3")) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  return { thinkingBudget: 0 };
}

async function generateWithTimeout(
  ai: GoogleGenAI,
  model: string,
  imageBase64: string,
  mimeType: string,
  timeoutMs: number,
  useThinkingConfig = true
) {
  const effectiveTimeout = Math.max(1_000, Math.min(ATTEMPT_TIMEOUT_MS, timeoutMs));
  const abortSignal = AbortSignal.timeout(effectiveTimeout);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DOMException("La solicitud a Gemini superó el tiempo límite", "TimeoutError"));
    }, effectiveTimeout + 100);
  });

  try {
    const requestPromise = ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType,
          },
        },
        {
          text: "Extrae todos los ítems, el impoconsumo/IVA desglosado (tax_amount) y la propina (tip_amount) de esta factura colombiana en formato JSON estricto.",
        },
      ],
      config: {
        abortSignal,
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: receiptResponseSchema,
        ...(useThinkingConfig
          ? { thinkingConfig: getThinkingConfigForModel(model) }
          : {}),
      },
    });

    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function discoverAvailableFlashModels(
  ai: GoogleGenAI,
  alreadyTried: Set<string>
): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<string[]>((resolve) => {
    timer = setTimeout(() => resolve([]), LIST_MODELS_TIMEOUT_MS);
  });

  const listPromise = (async () => {
    try {
      const pager = await ai.models.list({
        config: {
          pageSize: 50,
          httpOptions: { timeout: LIST_MODELS_TIMEOUT_MS },
        },
      });

      const candidates: string[] = [];
      for await (const model of pager) {
        const rawName = model.name ?? "";
        const normalized = rawName.replace(/^models\//, "");
        const lower = normalized.toLowerCase();

        if (!normalized || alreadyTried.has(normalized)) continue;
        if (!lower.includes("flash")) continue;
        if (
          lower.includes("image") ||
          lower.includes("audio") ||
          lower.includes("tts") ||
          lower.includes("live") ||
          lower.includes("embedding") ||
          lower.includes("aqa")
        ) {
          continue;
        }

        const actions = model.supportedActions;
        if (Array.isArray(actions) && !actions.includes("generateContent")) {
          continue;
        }

        candidates.push(normalized);
      }

      // Priorizar modelos más recientes o estables
      candidates.sort((a, b) => b.localeCompare(a));
      return candidates;
    } catch {
      return [];
    }
  })();

  try {
    return await Promise.race([listPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Falta configurar GEMINI_API_KEY en las variables de entorno del servidor. Mientras tanto, puedes ingresar los ítems manualmente.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as ScanReceiptRequestBody;
    if (!body?.imageBase64 || typeof body.imageBase64 !== "string") {
      return NextResponse.json(
        { error: "No recibimos ninguna imagen de la factura." },
        { status: 400 }
      );
    }

    const { data, mimeType } = normalizeBase64Payload(
      body.imageBase64,
      body.mimeType
    );

    if (!data || data.length < 100) {
      return NextResponse.json(
        { error: "La imagen enviada parece estar vacía o dañada." },
        { status: 400 }
      );
    }

    // Límite razonable ~8MB en base64 (~6MB imagen)
    if (data.length > 8 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "La foto es demasiado pesada. Intenta tomarla de nuevo o agregar los ítems manualmente.",
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

    const queue: string[] = [PRIMARY_MODEL, ...STATIC_FALLBACK_MODELS];
    const triedModels = new Set<string>();
    const deadlineAt = Date.now() + OVERALL_DEADLINE_MS;
    let discoveredModelsLoaded = false;
    let sawCongestion = false;
    let lastError: unknown = null;
    let responseText: string | undefined;

    while (triedModels.size < MAX_MODEL_ATTEMPTS) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs < 2_500) {
        sawCongestion = true;
        break;
      }

      if (queue.length === 0) {
        if (discoveredModelsLoaded) break;
        discoveredModelsLoaded = true;
        const discovered = await discoverAvailableFlashModels(ai, triedModels);
        if (discovered.length === 0) break;
        queue.push(...discovered);
      }

      const model = queue.shift();
      if (!model || triedModels.has(model)) continue;
      triedModels.add(model);

      try {
        const res = await generateWithTimeout(
          ai,
          model,
          data,
          safeMimeType,
          deadlineAt - Date.now(),
          true
        );
        responseText = res.text?.trim();
        break;
      } catch (err) {
        lastError = err;
        const info = classifyGeminiError(err);

        // Si el modelo concreto no acepta thinkingBudget/thinkingLevel, reintenta ese mismo sin thinkingConfig
        if (info.thinkingUnsupported && deadlineAt - Date.now() >= 2_500) {
          try {
            const res = await generateWithTimeout(
              ai,
              model,
              data,
              safeMimeType,
              deadlineAt - Date.now(),
              false
            );
            responseText = res.text?.trim();
            break;
          } catch (retryErr) {
            lastError = retryErr;
            const retryInfo = classifyGeminiError(retryErr);
            if (retryInfo.congested) sawCongestion = true;
            if (!retryInfo.retryable) throw retryErr;
            continue;
          }
        }

        if (info.congested) {
          sawCongestion = true;
        }

        console.warn(
          `[scan-receipt] Falló modelo "${model}" (status=${info.statusCode ?? "timeout"}):`,
          err instanceof Error ? err.message : err
        );

        if (!info.retryable) {
          throw err;
        }
      }
    }

    if (responseText === undefined) {
      if (sawCongestion) {
        return NextResponse.json(
          { error: CONGESTED_ERROR_MESSAGE },
          { status: 503 }
        );
      }
      throw lastError ?? new Error("No hubo respuesta de ningún modelo Flash.");
    }

    const rawText = responseText;
    if (!rawText) {
      return NextResponse.json(
        {
          error:
            "No pudimos leer los datos de la factura. Revisa que la foto esté enfocada o agrega los ítems manualmente.",
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
          result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const info = classifyGeminiError(error);
    console.error("[scan-receipt] Error analizando factura:", error);

    if (info.congested) {
      return NextResponse.json(
        { error: CONGESTED_ERROR_MESSAGE },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Hubo un problema conectando con la IA para leer la factura. Intenta de nuevo o ingresa los ítems manualmente.",
      },
      { status: 500 }
    );
  }
}
