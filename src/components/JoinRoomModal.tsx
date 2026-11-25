"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { getInitials } from "@/lib/formatters";
import type { Participant } from "@/types/database";

interface JoinRoomModalProps {
  roomTitle: string;
  existingParticipants: Participant[];
  onJoinNew: (name: string) => Promise<void>;
  onSelectExisting: (participant: Participant) => void;
}

export function JoinRoomModal({
  roomTitle,
  existingParticipants,
  onJoinNew,
  onSelectExisting,
}: JoinRoomModalProps) {
  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Escribe tu nombre o apodo para entrar a la sala.");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    setIsJoining(true);
    try {
      await onJoinNew(clean);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos unirte a la sala. Intenta de nuevo."
      );
      setIsJoining(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 pb-8 sm:pb-6 shadow-2xl animate-fade-up">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <UserPlus className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Sin contraseñas ni registros
            </p>
            <h2
              id="join-modal-title"
              className="text-lg font-extrabold text-[var(--ink-primary)] truncate"
            >
              Únete a &ldquo;{roomTitle}&rdquo;
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="guest-name-input"
              className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1.5"
            >
              ¿Cómo te conocen en el grupo?
            </label>
            <input
              ref={inputRef}
              id="guest-name-input"
              type="text"
              maxLength={40}
              autoComplete="given-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ej: Andrés, Laura, Pipe..."
              className="w-full rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3.5 text-base font-semibold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-4 focus:ring-[#10B981]/15 transition-all"
            />
            {error && (
              <p
                role="alert"
                className="mt-1.5 text-xs font-medium text-[var(--badge-danger-ink)]"
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isJoining}
            className="w-full min-h-[54px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-5 py-3.5 text-base font-extrabold text-[var(--accent-on-primary)] shadow-md shadow-[#10B981]/20 hover:bg-[var(--accent-primary-hover)] active:scale-[0.985] disabled:opacity-60 transition-all"
          >
            {isJoining ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Entrando...
              </>
            ) : (
              <>
                Entrar a la sala
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        {/* Acceso rápido si ya existía en la lista desde otro dispositivo */}
        {existingParticipants.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
            <p className="text-xs font-semibold text-[var(--ink-secondary)] mb-2.5">
              ¿Ya estabas en la lista? Toca tu nombre:
            </p>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {existingParticipants.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectExisting(p)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-border)] bg-[var(--chip-bg)] pl-1.5 pr-3 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--accent-soft)] transition-colors"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white/20"
                    style={{ backgroundColor: p.avatar_color }}
                  >
                    {getInitials(p.name)}
                  </span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
