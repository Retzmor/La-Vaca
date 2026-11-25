"use client";

import { CheckCircle2, Clock, Users } from "lucide-react";
import {
  formatCOP,
  getInitials,
  type ParticipantBreakdown,
  type RoomFinancialSummary,
} from "@/lib/formatters";
import type { Participant, RoomMode } from "@/types/database";

interface ParticipantStatusProps {
  mode: RoomMode;
  participants: Participant[];
  currentParticipantId: string | null;
  breakdowns: Map<string, ParticipantBreakdown>;
  summary: RoomFinancialSummary;
}

export function ParticipantStatus({
  mode,
  participants,
  currentParticipantId,
  breakdowns,
  summary,
}: ParticipantStatusProps) {
  const progressPercent =
    summary.totalParticipants > 0
      ? Math.round((summary.paidCount / summary.totalParticipants) * 100)
      : 0;

  return (
    <section
      aria-label="Estado público de pagos"
      className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--ink-primary)]">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-[var(--ink-primary)]">
              ¿Quién ya pagó?
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              {summary.paidCount} de {summary.totalParticipants}{" "}
              {summary.totalParticipants === 1 ? "persona" : "personas"} al día
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Recaudado
          </p>
          <p className="font-money text-sm font-extrabold text-[var(--accent-primary)]">
            {formatCOP(summary.collectedAmount)}
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium text-[var(--ink-secondary)]">
          <span>{progressPercent}% completado</span>
          <span>
            Faltan{" "}
            <strong className="font-money text-[var(--ink-primary)]">
              {formatCOP(summary.pendingAmount)}
            </strong>{" "}
            de{" "}
            <strong className="font-money text-[var(--ink-primary)]">
              {formatCOP(summary.grandTotal)}
            </strong>
          </span>
        </div>
      </div>

      {/* Lista de participantes */}
      {participants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-5 text-center text-xs text-[var(--ink-muted)]">
          Aún no se ha unido nadie. Comparte el enlace por WhatsApp para empezar.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {participants.map((participant) => {
            const detail = breakdowns.get(participant.id);
            const amount = detail?.total ?? 0;
            const isMe = participant.id === currentParticipantId;
            const itemsCount = detail?.claimedItems.length ?? 0;

            return (
              <li
                key={participant.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-extrabold text-white ring-1 ring-white/20 shadow-xs"
                    style={{ backgroundColor: participant.avatar_color }}
                  >
                    {getInitials(participant.name)}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-[var(--ink-primary)] truncate">
                        {participant.name}
                      </span>
                      {isMe && (
                        <span className="shrink-0 rounded-md bg-[var(--pill-active-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--pill-active-ink)]">
                          Tú
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-secondary)]">
                      {mode === "fixed"
                        ? "Cuota igualitaria"
                        : itemsCount > 0
                        ? `${itemsCount} ${itemsCount === 1 ? "ítem" : "ítems"} elegidos`
                        : "Sin ítems seleccionados aún"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="font-money text-sm font-extrabold text-[var(--ink-primary)]">
                    {formatCOP(amount)}
                  </span>

                  {participant.has_paid ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-primary)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pagado
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--badge-amber-ink)]">
                      <Clock className="h-3.5 w-3.5" />
                      Pendiente
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
