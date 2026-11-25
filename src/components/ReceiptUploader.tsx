"use client";

import { useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Sparkles,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  RefreshCw,
  Split,
  CheckCircle2,
  PencilLine,
} from "lucide-react";
import { compressReceiptImage } from "@/lib/image-compression";
import {
  formatCOP,
  formatCOPNumber,
  parseCOPInput,
} from "@/lib/formatters";
import type { DraftReceiptItem, ScannedReceiptResult } from "@/types/database";

interface ReceiptUploaderProps {
  items: DraftReceiptItem[];
  taxAmount: number;
  tipAmount: number;
  onItemsChange: (items: DraftReceiptItem[]) => void;
  onTaxChange: (tax: number) => void;
  onTipChange: (tip: number) => void;
}

const MAX_UPLOAD_BYTES = Math.round(3.5 * 1024 * 1024);

const TIP_PRESETS = [
  { label: "Sin propina", percent: 0 },
  { label: "5%", percent: 5 },
  { label: "10% sugerida", percent: 10 },
  { label: "15%", percent: 15 },
] as const;

function createDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeQuantity(value: number | ""): number {
  if (value === "") return 1;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(99, parsed);
}

export function ReceiptUploader({
  items,
  taxAmount,
  tipAmount,
  onItemsChange,
  onTaxChange,
  onTipChange,
}: ReceiptUploaderProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanDetail, setScanDetail] = useState<string | null>(null);
  const [scanSucceeded, setScanSucceeded] = useState(false);
  const [manualModeOpened, setManualModeOpened] = useState(false);

  const subtotal = items.reduce((sum, item) => sum + Math.max(0, item.price), 0);
  const grandTotal = subtotal + Math.max(0, taxAmount) + Math.max(0, tipAmount);

  function ensureManualFallbackRow() {
    setManualModeOpened(true);
    if (items.length === 0) {
      onItemsChange([
        { id: createDraftId(), name: "", price: 0, quantity: 1 },
      ]);
    }
  }

  async function handleFileSelected(file: File | null | undefined) {
    if (!file) return;

    setScanError(null);
    setScanDetail(null);
    setScanSucceeded(false);
    setIsScanning(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 29_000);

    try {
      const compressed = await compressReceiptImage(file, 1024, 0.72);
      setPreviewUrl(compressed.dataUrl);

      if (compressed.approximateBytes > MAX_UPLOAD_BYTES) {
        const mb = (compressed.approximateBytes / (1024 * 1024)).toFixed(2);
        setScanError(
          "Esta foto es muy pesada incluso después de comprimirla (supera 3.5 MB). Toma una foto más ligera o desde un poco más lejos."
        );
        setScanDetail(`HTTP 413 (cliente) · Tamaño comprimido: ${mb} MB`);
        ensureManualFallbackRow();
        return;
      }

      const response = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
        }),
      });

      const rawResponseText = await response.text();
      let payload:
        | ScannedReceiptResult
        | {
            error?: string;
            detail?: string;
            statusCode?: number;
            result?: ScannedReceiptResult;
          }
        | null = null;

      try {
        payload = rawResponseText ? JSON.parse(rawResponseText) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const errorMessage =
          payload && "error" in payload && payload.error
            ? payload.error
            : response.status === 413
            ? "La foto superó el límite de tamaño del servidor (413). Toma una foto más ligera."
            : "No pudimos leer la factura. Revisa la foto o ingresa los ítems a mano.";

        const detailText =
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : `HTTP ${response.status}${
                rawResponseText ? ` · ${rawResponseText.slice(0, 140)}` : ""
              }`;

        setScanError(errorMessage);
        setScanDetail(detailText);
        ensureManualFallbackRow();
        return;
      }

      const data = payload as ScannedReceiptResult;
      const mappedItems: DraftReceiptItem[] = data.items.map((item) => ({
        id: createDraftId(),
        name: item.name,
        price: item.price,
        quantity: normalizeQuantity(item.quantity),
      }));

      onItemsChange(mappedItems);
      onTaxChange(data.tax_amount);
      onTipChange(data.tip_amount);
      setScanSucceeded(true);
      setManualModeOpened(true);
    } catch (error) {
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      const message = isAbort
        ? "Los servidores de IA están tardando más de lo normal. Intenta de nuevo en unos segundos o ingresa los ítems abajo."
        : error instanceof Error
        ? error.message
        : "Ocurrió un error procesando la imagen. Puedes agregar los ítems manualmente.";

      setScanError(message);
      setScanDetail(
        isAbort
          ? "Timeout en cliente (29s)"
          : error instanceof Error
          ? error.message.slice(0, 140)
          : "Error de red inesperado"
      );
      ensureManualFallbackRow();
    } finally {
      window.clearTimeout(timeoutId);
      setIsScanning(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  function handleOpenManual() {
    setManualModeOpened(true);
    setScanError(null);
    setScanDetail(null);
    if (items.length === 0) {
      onItemsChange([
        { id: createDraftId(), name: "", price: 0, quantity: 1 },
      ]);
    }
  }

  function handleAddItem() {
    setManualModeOpened(true);
    onItemsChange([
      ...items,
      { id: createDraftId(), name: "", price: 0, quantity: 1 },
    ]);
  }

  function handleUpdateItem(
    id: string,
    patch: Partial<Omit<DraftReceiptItem, "id">>
  ) {
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function handleDeleteItem(id: string) {
    onItemsChange(items.filter((item) => item.id !== id));
  }

  /**
   * Permite desglosar una línea con quantity > 1 (ej. "3x Cerveza $ 36.000")
   * en unidades individuales ("Cerveza $ 12.000") con 1 toque.
   */
  function handleSplitQuantity(target: DraftReceiptItem) {
    const qty = normalizeQuantity(target.quantity);
    if (qty <= 1) return;
    const unitBase = Math.floor(target.price / qty);
    const remainder = target.price - unitBase * qty;

    const expanded: DraftReceiptItem[] = Array.from(
      { length: qty },
      (_, idx) => ({
        id: createDraftId(),
        name: target.name,
        price: unitBase + (idx === 0 ? remainder : 0),
        quantity: 1,
      })
    );

    const nextItems: DraftReceiptItem[] = [];
    for (const item of items) {
      if (item.id === target.id) {
        nextItems.push(...expanded);
      } else {
        nextItems.push(item);
      }
    }
    onItemsChange(nextItems);
  }

  function applyTipPercentage(percent: number) {
    if (percent === 0) {
      onTipChange(0);
      return;
    }
    onTipChange(Math.round((subtotal * percent) / 100));
  }

  const showEditor = manualModeOpened || items.length > 0;

  return (
    <div className="space-y-4">
      {/* Inputs ocultos: uno directo a cámara y otro a galería/archivos */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />

      {/* Zona de carga / escaneo IA */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent-ink)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Escáner IA con Gemini
            </div>
            <p className="text-sm text-[var(--ink-secondary)] mt-0.5">
              Toma foto a la tirilla o sube pantallazo del pedido. Comprimimos la
              imagen automáticamente.
            </p>
          </div>
          {previewUrl && !isScanning && (
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Otra foto
            </button>
          )}
        </div>

        {/* Estado de escaneo activo */}
        {isScanning ? (
          <div
            role="status"
            aria-live="polite"
            className="relative overflow-hidden rounded-2xl border-2 border-[var(--accent-border)] bg-[#080B0A] text-[#F2F5F3] p-5"
          >
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Factura en proceso de lectura"
                className="absolute inset-0 h-full w-full object-cover opacity-20"
              />
            )}
            <div
              aria-hidden="true"
              className="animate-scan-beam absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-[#10B981]/50 to-transparent pointer-events-none"
            />
            <div className="relative z-10 flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981] text-[#041F15] shadow-lg shadow-[#10B981]/30">
                <Sparkles className="h-6 w-6 animate-pulse" />
              </div>
              <p className="text-base font-bold tracking-tight">
                Leyendo factura con IA...
              </p>
              <p className="mt-1 text-xs text-[#94A39D] max-w-xs">
                Extrayendo platos, precios en pesos colombianos, impoconsumo y
                propina.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-5 text-center transition-all hover:border-[var(--accent-primary)] hover:bg-[var(--accent-soft-hover)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-on-primary)] shadow-xs">
                <Camera className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold text-[var(--accent-ink)]">
                Tomar foto
              </span>
              <span className="text-[11px] text-[var(--ink-secondary)]">
                Cámara del celular
              </span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-5 text-center transition-all hover:border-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-ink)] shadow-xs">
                <ImagePlus className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold text-[var(--ink-primary)]">
                Subir imagen
              </span>
              <span className="text-[11px] text-[var(--ink-secondary)]">
                Galería o captura
              </span>
            </button>
          </div>
        )}

        {/* Acción directa para llenar a mano sin foto */}
        {!showEditor && !isScanning && (
          <button
            type="button"
            onClick={handleOpenManual}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--ink-primary)] transition-colors"
          >
            <PencilLine className="h-3.5 w-3.5" />
            ¿Sin foto a la mano? Ingresar ítems manualmente
          </button>
        )}

        {/* Banner de éxito al escanear */}
        {scanSucceeded && !scanError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs font-medium text-[var(--accent-ink)]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
            <span>
              ¡Listo! Detectamos <strong>{items.length}</strong>{" "}
              {items.length === 1 ? "ítem" : "ítems"}. Revisa o ajusta lo que
              necesites antes de crear la sala.
            </span>
          </div>
        )}

        {/* Banner de error amigable + detalle técnico discreto */}
        {scanError && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] p-3.5 text-xs text-[var(--badge-amber-ink)]"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="font-bold">No pudimos leer bien la factura</p>
                <p className="opacity-90 leading-relaxed">{scanError}</p>
                <p className="font-semibold pt-0.5">
                  Puedes volver a intentar con mejor luz o llenar los ítems aquí
                  abajo.
                </p>
                {scanDetail && (
                  <p className="pt-1 font-mono text-[10px] opacity-70 break-words">
                    Detalle: {scanDetail}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editor interactivo tipo tirilla de factura */}
      {showEditor && (
        <div className="receipt-ticket rounded-2xl border border-[var(--border-subtle)] p-4 pb-6 animate-fade-up">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h3 className="text-sm font-bold text-[var(--ink-primary)]">
                Detalle de la factura
              </h3>
              <p className="text-xs text-[var(--ink-secondary)]">
                Edita nombres, precios o separa ítems repetidos
              </p>
            </div>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-secondary)]">
              {items.length} {items.length === 1 ? "ítem" : "ítems"}
            </span>
          </div>

          {/* Lista editable de ítems */}
          <div className="mt-3 space-y-2.5">
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4 text-center text-xs text-[var(--ink-muted)]">
                Aún no hay ítems. Toca &ldquo;Agregar ítem&rdquo; para comenzar.
              </div>
            ) : (
              items.map((item, idx) => {
                const qtyNumber = normalizeQuantity(item.quantity);

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--bg-subtle)] text-[11px] font-bold text-[var(--ink-secondary)]">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          handleUpdateItem(item.id, { name: e.target.value })
                        }
                        placeholder="Ej: Bandeja paisa, Club Colombia..."
                        aria-label={`Nombre del ítem ${idx + 1}`}
                        className="min-w-0 flex-1 rounded-lg border border-transparent bg-[var(--bg-surface)] px-2.5 py-2 text-sm font-medium text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        aria-label={`Eliminar ítem ${item.name || idx + 1}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--badge-danger-bg)] hover:text-[var(--badge-danger-ink)] transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-8">
                      {/* Cantidad con - / + táctil y borrado libre en móvil */}
                      <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs text-[var(--ink-secondary)]">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateItem(item.id, {
                              quantity: Math.max(1, qtyNumber - 1),
                            })
                          }
                          disabled={item.quantity !== "" && qtyNumber <= 1}
                          aria-label={`Disminuir cantidad del ítem ${idx + 1}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-primary)] hover:bg-[var(--bg-elevated)] active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={item.quantity}
                          onChange={(e) => {
                            const digits = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 2);
                            if (digits === "") {
                              handleUpdateItem(item.id, { quantity: "" });
                              return;
                            }
                            const parsed = Number.parseInt(digits, 10);
                            handleUpdateItem(item.id, {
                              quantity: Math.min(99, parsed),
                            });
                          }}
                          onBlur={() =>
                            handleUpdateItem(item.id, {
                              quantity: normalizeQuantity(item.quantity),
                            })
                          }
                          aria-label={`Cantidad del ítem ${idx + 1}`}
                          className="w-8 bg-transparent text-center font-money text-sm font-bold text-[var(--ink-primary)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const base = item.quantity === "" ? 0 : qtyNumber;
                            handleUpdateItem(item.id, {
                              quantity: Math.min(99, base + 1),
                            });
                          }}
                          aria-label={`Aumentar cantidad del ítem ${idx + 1}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-primary)] hover:bg-[var(--bg-elevated)] active:scale-95 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Precio total de la línea en COP */}
                      <label className="relative flex-1 min-w-[130px] flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 focus-within:border-[var(--accent-primary)]">
                        <span className="font-money text-xs font-semibold text-[var(--ink-muted)] mr-1.5">
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCOPNumber(item.price)}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              price: parseCOPInput(e.target.value),
                            })
                          }
                          placeholder="0"
                          aria-label={`Precio total del ítem ${idx + 1} en pesos`}
                          className="w-full bg-transparent font-money text-sm font-bold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none text-right"
                        />
                      </label>

                      {/* Botón inteligente para separar líneas con cantidad > 1 */}
                      {qtyNumber > 1 && item.price > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSplitQuantity(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 py-2 text-[11px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-soft-hover)] transition-colors"
                          title="Desglosa esta línea en ítems individuales por unidad"
                        >
                          <Split className="h-3.5 w-3.5" />
                          Separar en {qtyNumber}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] py-3 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-soft-hover)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar ítem
          </button>

          {/* Impuesto (Impoconsumo / IVA) y Propina */}
          <div className="receipt-divider mt-4 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="receipt-tax"
                  className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                >
                  Impoconsumo / IVA
                </label>
                <div className="flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 focus-within:border-[var(--accent-primary)]">
                  <span className="font-money text-xs font-semibold text-[var(--ink-muted)] mr-1">
                    $
                  </span>
                  <input
                    id="receipt-tax"
                    type="text"
                    inputMode="numeric"
                    value={formatCOPNumber(taxAmount)}
                    onChange={(e) => onTaxChange(parseCOPInput(e.target.value))}
                    placeholder="0"
                    className="w-full bg-transparent font-money text-sm font-bold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] text-right focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="receipt-tip"
                  className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                >
                  Propina voluntaria
                </label>
                <div className="flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 focus-within:border-[var(--accent-primary)]">
                  <span className="font-money text-xs font-semibold text-[var(--ink-muted)] mr-1">
                    $
                  </span>
                  <input
                    id="receipt-tip"
                    type="text"
                    inputMode="numeric"
                    value={formatCOPNumber(tipAmount)}
                    onChange={(e) => onTipChange(parseCOPInput(e.target.value))}
                    placeholder="0"
                    className="w-full bg-transparent font-money text-sm font-bold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] text-right focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Chips rápidos de propina */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-[var(--ink-muted)] mr-1">
                Propina rápida:
              </span>
              {TIP_PRESETS.map((preset) => {
                const expectedValue =
                  preset.percent === 0
                    ? 0
                    : Math.round((subtotal * preset.percent) / 100);
                const isActive =
                  subtotal > 0
                    ? tipAmount === expectedValue
                    : preset.percent === 0 && tipAmount === 0;

                return (
                  <button
                    key={preset.percent}
                    type="button"
                    onClick={() => applyTipPercentage(preset.percent)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-[var(--pill-active-bg)] text-[var(--pill-active-ink)]"
                        : "bg-[var(--bg-elevated)] text-[var(--ink-secondary)] border border-[var(--border-subtle)] hover:text-[var(--ink-primary)]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Totales tipo tirilla */}
            <div className="receipt-divider pt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-[var(--ink-secondary)]">
                <span>Subtotal ítems</span>
                <span className="font-money font-semibold text-[var(--ink-primary)]">
                  {formatCOP(subtotal)}
                </span>
              </div>
              {taxAmount > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-secondary)]">
                  <span>Impoconsumo / IVA</span>
                  <span className="font-money font-semibold text-[var(--ink-primary)]">
                    {formatCOP(taxAmount)}
                  </span>
                </div>
              )}
              {tipAmount > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-secondary)]">
                  <span>Propina</span>
                  <span className="font-money font-semibold text-[var(--ink-primary)]">
                    {formatCOP(tipAmount)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 text-base font-extrabold text-[var(--ink-primary)]">
                <span>Total factura</span>
                <span className="font-money text-lg text-[var(--accent-primary)]">
                  {formatCOP(grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
