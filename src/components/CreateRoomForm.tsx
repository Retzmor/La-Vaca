"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt,
  Users,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Wallet,
  Sparkles,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { generateRoomSlug } from "@/lib/slug";
import {
  PAYMENT_METHODS,
  getPaymentMethodMeta,
} from "@/lib/payment-methods";
import {
  formatCOP,
  formatCOPNumber,
  parseCOPInput,
  pickAvatarColor,
} from "@/lib/formatters";
import { ReceiptUploader } from "@/components/ReceiptUploader";
import type {
  DraftReceiptItem,
  PaymentMethod,
  RoomMode,
} from "@/types/database";

const PLAN_SUGGESTIONS = [
  "Almuerzo viernes",
  "Cervezas con parceros",
  "Asado fin de semana",
  "Pedido Rappi oficina",
] as const;

export function CreateRoomForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [mode, setMode] = useState<RoomMode>("receipt");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bre-b");
  const [paymentKey, setPaymentKey] = useState("");

  // Estado modo Factura
  const [items, setItems] = useState<DraftReceiptItem[]>([]);
  const [taxAmount, setTaxAmount] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);

  // Estado modo Cuota Fija / Vaca
  const [fixedTotalAmount, setFixedTotalAmount] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeMethod = getPaymentMethodMeta(paymentMethod);

  const receiptSubtotal = items.reduce(
    (sum, item) => sum + Math.max(0, item.price),
    0
  );
  const receiptTotal =
    receiptSubtotal + Math.max(0, taxAmount) + Math.max(0, tipAmount);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!isSupabaseConfigured) {
      setFormError(
        "Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env.local."
      );
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError("Ponle un nombre al plan (ej: Almuerzo viernes).");
      return;
    }

    const cleanKey = paymentKey.trim();
    if (!cleanKey) {
      setFormError(
        `Ingresa tu ${activeMethod.label} para que tus amigos sepan a dónde transferir.`
      );
      return;
    }

    let validItems: DraftReceiptItem[] = [];
    let finalTotal = 0;

    if (mode === "receipt") {
      validItems = items
        .map((item) => {
          const parsedQty = Number.parseInt(String(item.quantity), 10);
          return {
            ...item,
            name: item.name.trim(),
            price: Math.max(0, Math.round(item.price)),
            quantity:
              Number.isFinite(parsedQty) && parsedQty >= 1
                ? Math.min(99, parsedQty)
                : 1,
          };
        })
        .filter((item) => item.name.length > 0 && item.price > 0);

      if (validItems.length === 0) {
        setFormError(
          "Escanea una factura o agrega al menos un ítem con nombre y valor mayor a $ 0."
        );
        return;
      }

      const validSubtotal = validItems.reduce((acc, i) => acc + i.price, 0);
      finalTotal = validSubtotal + Math.max(0, taxAmount) + Math.max(0, tipAmount);
    } else {
      if (fixedTotalAmount <= 0) {
        setFormError("Ingresa el valor total de la vaca en pesos colombianos.");
        return;
      }
      finalTotal = fixedTotalAmount;
    }

    setIsSubmitting(true);

    try {
      // Intenta hasta 3 veces por si hay una colisión rarísima de slug
      let createdRoom: { id: string; slug: string } | null = null;
      let lastInsertError: string | null = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const slug = generateRoomSlug(cleanTitle);
        const { data, error } = await supabase
          .from("rooms")
          .insert({
            slug,
            title: cleanTitle,
            mode,
            payment_method: paymentMethod,
            payment_key: cleanKey,
            organizer_name: organizerName.trim() || null,
            total_amount: finalTotal,
            tax_amount: mode === "receipt" ? Math.max(0, taxAmount) : 0,
            tip_amount: mode === "receipt" ? Math.max(0, tipAmount) : 0,
          })
          .select("id, slug")
          .single();

        if (!error && data) {
          createdRoom = data;
          break;
        }

        lastInsertError = error?.message ?? "No pudimos crear la sala.";
        if (error?.code !== "23505") {
          break;
        }
      }

      if (!createdRoom) {
        throw new Error(
          lastInsertError || "No pudimos guardar la sala en este momento."
        );
      }

      // Insertar ítems en modo Factura
      if (mode === "receipt" && validItems.length > 0) {
        const { error: itemsError } = await supabase.from("items").insert(
          validItems.map((item, idx) => ({
            room_id: createdRoom.id,
            name: item.name,
            price: item.price,
            quantity: Math.max(1, Number(item.quantity) || 1),
            sort_order: idx,
          }))
        );

        if (itemsError) {
          throw new Error(
            `Creamos la sala pero falló guardar los ítems: ${itemsError.message}`
          );
        }
      }

      // Si el organizador escribió su nombre, lo unimos de una vez para que no lo repita
      const cleanOrganizer = organizerName.trim();
      if (cleanOrganizer) {
        const { data: participant } = await supabase
          .from("participants")
          .insert({
            room_id: createdRoom.id,
            name: cleanOrganizer,
            avatar_color: pickAvatarColor(cleanOrganizer),
            has_paid: false,
          })
          .select("id")
          .single();

        if (participant && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              `lavaca:participant:${createdRoom.slug}`,
              participant.id
            );
          } catch {
            // Ignora errores de storage privado
          }
        }
      }

      router.push(`/sala/${createdRoom.slug}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Algo salió mal creando la sala. Revisa tu conexión e intenta de nuevo.";
      setFormError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Alerta informativa si faltan variables de Supabase en entorno local */}
      {!isSupabaseConfigured && (
        <div
          role="status"
          className="rounded-2xl border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] p-4 text-xs text-[var(--badge-amber-ink)] flex items-start gap-2.5"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Configuración de Supabase pendiente</p>
            <p className="mt-0.5 opacity-90">
              Agrega <code className="font-mono font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
              <code className="font-mono font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
              <code className="font-mono">.env.local</code> y ejecuta{" "}
              <code className="font-mono">supabase/schema.sql</code> para crear salas en vivo.
            </p>
          </div>
        </div>
      )}

      {/* Paso 1: Nombre del plan */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-extrabold text-[var(--accent-on-primary)]">
            1
          </span>
          <h2 className="text-base font-extrabold tracking-tight text-[var(--ink-primary)]">
            ¿Qué van a dividir hoy?
          </h2>
        </div>

        <div>
          <label
            htmlFor="plan-title"
            className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
          >
            Nombre del plan *
          </label>
          <input
            id="plan-title"
            type="text"
            required
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Almuerzo viernes, Asado en Chía..."
            className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3.5 text-base font-semibold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-4 focus:ring-[#10B981]/15 transition-all"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PLAN_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setTitle(suggestion)}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--ink-secondary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)] transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="organizer-name"
            className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
          >
            Tu nombre (quien recibe la plata — opcional)
          </label>
          <input
            id="organizer-name"
            type="text"
            maxLength={40}
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            placeholder="Ej: Camila"
            className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-medium text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-4 focus:ring-[#10B981]/15 transition-all"
          />
        </div>
      </section>

      {/* Paso 2: Selector de modo */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5 px-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-extrabold text-[var(--accent-on-primary)]">
            2
          </span>
          <h2 className="text-base font-extrabold tracking-tight text-[var(--ink-primary)]">
            Elige cómo dividir la cuenta
          </h2>
        </div>

        <div
          role="radiogroup"
          aria-label="Modo de división"
          className="grid grid-cols-2 gap-3"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === "receipt"}
            onClick={() => setMode("receipt")}
            className={`relative flex flex-col items-start rounded-3xl border-2 p-4 text-left transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
              mode === "receipt"
                ? "border-[var(--accent-primary)] bg-[var(--item-selected-bg)] shadow-sm"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="flex w-full items-center justify-between mb-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                  mode === "receipt"
                    ? "bg-[var(--accent-primary)] text-[var(--accent-on-primary)]"
                    : "bg-[var(--bg-elevated)] text-[var(--ink-secondary)]"
                }`}
              >
                <Receipt className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-ink)]">
                <Sparkles className="h-2.5 w-2.5" />
                IA
              </span>
            </div>
            <span className="text-sm font-extrabold text-[var(--ink-primary)] leading-snug">
              Escanear Factura con IA
            </span>
            <span className="mt-1 text-xs text-[var(--ink-secondary)] leading-relaxed">
              Cada quien toca lo que consumió y divide lo compartido.
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={mode === "fixed"}
            onClick={() => setMode("fixed")}
            className={`relative flex flex-col items-start rounded-3xl border-2 p-4 text-left transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
              mode === "fixed"
                ? "border-[var(--accent-primary)] bg-[var(--item-selected-bg)] shadow-sm"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="flex w-full items-center justify-between mb-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                  mode === "fixed"
                    ? "bg-[var(--accent-primary)] text-[var(--accent-on-primary)]"
                    : "bg-[var(--bg-elevated)] text-[var(--ink-secondary)]"
                }`}
              >
                <Users className="h-5 w-5" />
              </span>
            </div>
            <span className="text-sm font-extrabold text-[var(--ink-primary)] leading-snug">
              Cuota Fija / Vaca
            </span>
            <span className="mt-1 text-xs text-[var(--ink-secondary)] leading-relaxed">
              Un valor total repartido en partes iguales entre todos.
            </span>
          </button>
        </div>

        {/* Contenido dinámico según modo */}
        {mode === "receipt" ? (
          <ReceiptUploader
            items={items}
            taxAmount={taxAmount}
            tipAmount={tipAmount}
            onItemsChange={setItems}
            onTaxChange={setTaxAmount}
            onTipChange={setTipAmount}
          />
        ) : (
          <div className="receipt-ticket rounded-3xl border border-[var(--border-subtle)] p-5 pb-7 animate-fade-up">
            <label
              htmlFor="fixed-total-amount"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]"
            >
              Valor total de la vaca (COP) *
            </label>
            <div className="mt-2 flex items-center rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3.5 focus-within:border-[var(--accent-primary)] transition-colors">
              <span className="font-money text-2xl font-bold text-[var(--ink-muted)] mr-2">
                $
              </span>
              <input
                id="fixed-total-amount"
                type="text"
                inputMode="numeric"
                value={formatCOPNumber(fixedTotalAmount)}
                onChange={(e) =>
                  setFixedTotalAmount(parseCOPInput(e.target.value))
                }
                placeholder="150.000"
                className="w-full bg-transparent font-money text-3xl font-bold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[50000, 100000, 150000, 200000, 300000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFixedTotalAmount(preset)}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 font-money text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)] transition-colors"
                >
                  {formatCOP(preset)}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-[var(--ink-secondary)]">
              A medida que tus amigos entren con el enlace, la cuota por persona
              se recalcula automáticamente en vivo.
            </p>
          </div>
        )}
      </section>

      {/* Paso 3: Método de pago en Colombia */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-extrabold text-[var(--accent-on-primary)]">
            3
          </span>
          <h2 className="text-base font-extrabold tracking-tight text-[var(--ink-primary)]">
            ¿A dónde te transfieren?
          </h2>
        </div>

        <div
          role="radiogroup"
          aria-label="Método de pago"
          className="grid grid-cols-2 gap-2.5"
        >
          {PAYMENT_METHODS.map((pm) => {
            const isSelected = paymentMethod === pm.id;
            return (
              <button
                key={pm.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setPaymentMethod(pm.id)}
                className={`flex items-center gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-left transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                  isSelected
                    ? "border-[var(--accent-primary)] bg-[var(--item-selected-bg)] text-[var(--ink-primary)] shadow-xs"
                    : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
                  style={{ backgroundColor: pm.dotColor }}
                />
                <span className="text-sm font-bold truncate">{pm.label}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="payment-key"
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
          >
            <Wallet className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span>{activeMethod.label} *</span>
          </label>
          <input
            id="payment-key"
            type="text"
            required
            maxLength={80}
            value={paymentKey}
            onChange={(e) => setPaymentKey(e.target.value)}
            placeholder={activeMethod.placeholder}
            className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3.5 font-money text-base font-semibold text-[var(--ink-primary)] placeholder:font-sans placeholder:font-normal placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-4 focus:ring-[#10B981]/15 transition-all"
          />
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
            {activeMethod.helperText}
          </p>
        </div>
      </section>

      {/* Error de validación / envío */}
      {formError && (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--badge-danger-border)] bg-[var(--badge-danger-bg)] px-4 py-3.5 text-sm font-medium text-[var(--badge-danger-ink)] flex items-start gap-2.5"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      {/* Botón principal de creación */}
      <div className="pt-1 pb-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[58px] inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent-primary)] px-6 py-4 text-base font-extrabold text-[var(--accent-on-primary)] shadow-lg shadow-[#10B981]/20 transition-all hover:bg-[var(--accent-primary-hover)] active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-4 focus-visible:ring-[#10B981]/30"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Creando sala...
            </>
          ) : (
            <>
              <span>
                Crear sala
                {mode === "receipt" && receiptTotal > 0
                  ? ` · ${formatCOP(receiptTotal)}`
                  : mode === "fixed" && fixedTotalAmount > 0
                  ? ` · ${formatCOP(fixedTotalAmount)}`
                  : ""}
              </span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <p className="mt-3 text-center text-xs text-[var(--ink-muted)]">
          Tus invitados no tienen que descargar nada ni crear cuenta. Solo abren
          el link y eligen lo suyo.
        </p>
      </div>
    </form>
  );
}
