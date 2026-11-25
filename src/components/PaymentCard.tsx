"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  CheckCircle2,
  RotateCcw,
  Wallet,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { formatCOP, type ParticipantBreakdown } from "@/lib/formatters";
import { getPaymentMethodMeta } from "@/lib/payment-methods";
import type { Participant, Room } from "@/types/database";

interface PaymentCardProps {
  room: Room;
  currentParticipant: Participant | null;
  breakdown: ParticipantBreakdown | null;
  totalParticipants: number;
  isUpdatingPaid: boolean;
  onTogglePaid: (nextPaid: boolean) => Promise<void>;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback abajo
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function PaymentCard({
  room,
  currentParticipant,
  breakdown,
  totalParticipants,
  isUpdatingPaid,
  onTogglePaid,
}: PaymentCardProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const method = getPaymentMethodMeta(room.payment_method);
  const totalToPay = breakdown?.total ?? 0;
  const hasPaid = currentParticipant?.has_paid ?? false;

  async function handleCopyKey() {
    const ok = await copyToClipboard(room.payment_key);
    if (ok) {
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2200);
    }
  }

  async function handleCopyAmount() {
    const numericAmount = String(Math.max(0, Math.round(totalToPay)));
    const ok = await copyToClipboard(numericAmount);
    if (ok) {
      setCopiedAmount(true);
      window.setTimeout(() => setCopiedAmount(false), 2200);
    }
  }

  return (
    <section
      aria-label="Tarjeta de liquidación personal"
      className="receipt-ticket rounded-3xl border border-[var(--border-subtle)] p-5 pb-7"
    >
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
            <ReceiptText className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            Tu liquidación
          </span>
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--ink-primary)] mt-0.5">
            {currentParticipant
              ? `Cuenta de ${currentParticipant.name}`
              : "Tu parte de la cuenta"}
          </h2>
        </div>

        {hasPaid ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-extrabold text-[var(--accent-ink)]">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            Pagado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] px-3 py-1 text-xs font-bold text-[var(--badge-amber-ink)]">
            Pendiente
          </span>
        )}
      </div>

      {/* Desglose matemático */}
      <div className="mt-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4 space-y-2 text-sm">
        {room.mode === "receipt" ? (
          <>
            <div className="flex items-center justify-between text-[var(--ink-secondary)]">
              <span>
                Tu consumo{" "}
                {breakdown && breakdown.claimedItems.length > 0 && (
                  <span className="text-xs text-[var(--ink-muted)]">
                    ({breakdown.claimedItems.length}{" "}
                    {breakdown.claimedItems.length === 1 ? "ítem" : "ítems"})
                  </span>
                )}
              </span>
              <span className="font-money font-semibold text-[var(--ink-primary)]">
                {formatCOP(breakdown?.consumption ?? 0)}
              </span>
            </div>

            {room.tax_amount > 0 && (
              <div className="flex items-center justify-between text-[var(--ink-secondary)]">
                <span>Impoconsumo / IVA proporcional</span>
                <span className="font-money font-semibold text-[var(--ink-primary)]">
                  {formatCOP(breakdown?.tax ?? 0)}
                </span>
              </div>
            )}

            {room.tip_amount > 0 && (
              <div className="flex items-center justify-between text-[var(--ink-secondary)]">
                <span>Propina proporcional</span>
                <span className="font-money font-semibold text-[var(--ink-primary)]">
                  {formatCOP(breakdown?.tip ?? 0)}
                </span>
              </div>
            )}

            {room.tax_amount === 0 && room.tip_amount === 0 && (
              <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                <span>Impuesto / Propina</span>
                <span className="font-money">$ 0</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between text-[var(--ink-secondary)]">
            <span>
              Cuota fija ({formatCOP(room.total_amount)} ÷{" "}
              {Math.max(totalParticipants, 1)}{" "}
              {Math.max(totalParticipants, 1) === 1 ? "persona" : "personas"})
            </span>
            <span className="font-money font-semibold text-[var(--ink-primary)]">
              {formatCOP(totalToPay)}
            </span>
          </div>
        )}

        <div className="receipt-divider pt-3 mt-2 flex items-baseline justify-between">
          <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--ink-primary)]">
            Total a transferir
          </span>
          <span className="font-money text-2xl sm:text-[28px] font-extrabold text-[var(--accent-primary)]">
            {formatCOP(totalToPay)}
          </span>
        </div>

        {room.mode === "receipt" && totalToPay === 0 && (
          <p className="text-xs text-[var(--ink-muted)] pt-1">
            Toca arriba los platos o bebidas que consumiste para calcular tu
            total al instante.
          </p>
        )}
      </div>

      {/* Destino de transferencia */}
      <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-white/15"
              style={{ backgroundColor: method.dotColor }}
            />
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${method.badgeClass}`}
            >
              {method.label}
            </span>
          </div>
          {room.organizer_name && (
            <span className="text-xs text-[var(--ink-secondary)] truncate">
              A nombre de{" "}
              <strong className="font-semibold text-[var(--ink-primary)]">
                {room.organizer_name}
              </strong>
            </span>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5">
          <Wallet className="h-4 w-4 shrink-0 text-[var(--ink-secondary)]" />
          <span className="font-money text-base font-bold text-[var(--ink-primary)] break-all select-all">
            {room.payment_key}
          </span>
        </div>

        {/* Botones de 1 toque para copiar llave y valor exacto */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopyKey}
            className={`min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
              copiedKey
                ? "bg-[var(--accent-primary)] text-[var(--accent-on-primary)]"
                : "bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-ink)] hover:bg-[var(--btn-secondary-hover)] border border-[var(--border-strong)]"
            }`}
          >
            {copiedKey ? (
              <>
                <Check className="h-4 w-4 shrink-0" />
                ¡Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 shrink-0" />
                <span className="truncate">{method.copyLabel}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyAmount}
            disabled={totalToPay <= 0}
            className={`min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
              copiedAmount
                ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-[var(--border-strong)]"
            }`}
          >
            {copiedAmount ? (
              <>
                <Check className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                ¡Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 shrink-0" />
                <span className="truncate">Copiar Valor Exacto</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Botón grande: Ya transferí / Marcar como pagado */}
      {currentParticipant && (
        <div className="mt-4">
          {!hasPaid ? (
            <button
              type="button"
              disabled={isUpdatingPaid}
              onClick={() => onTogglePaid(true)}
              className="w-full min-h-[56px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-5 py-3.5 text-base font-extrabold text-[var(--accent-on-primary)] shadow-lg shadow-[#10B981]/20 hover:bg-[var(--accent-primary-hover)] active:scale-[0.985] disabled:opacity-60 transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[#10B981]/30"
            >
              {isUpdatingPaid ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Actualizando estado...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Ya transferí · Marcar como pagado
                </>
              )}
            </button>
          ) : (
            <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-on-primary)]">
                  <Check className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-[var(--accent-ink)]">
                    ¡Crack! Tu pago ya aparece en la lista
                  </p>
                  <p className="text-xs text-[var(--ink-secondary)]">
                    Todos en la sala ya ven tu estado al día.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isUpdatingPaid}
                onClick={() => onTogglePaid(false)}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 text-xs font-bold text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors"
                title="Marcar nuevamente como pendiente"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Deshacer
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
