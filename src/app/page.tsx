import { ShieldCheck, Zap, Share2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { CreateRoomForm } from "@/components/CreateRoomForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-lg px-4 pt-5 pb-10 sm:px-5 sm:pt-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-2 mb-6">
          <BrandMark />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-bold text-[var(--accent-ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
              Sin registro
            </span>
            <ThemeToggle />
          </div>
        </header>

        {/* Hero compacto mobile-first */}
        <section className="mb-6 animate-fade-up">
          <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-tight text-[var(--ink-primary)] leading-[1.12]">
            Divide la cuenta en segundos y cobra sin pena.
          </h1>
          <p className="mt-2.5 text-sm sm:text-[15px] text-[var(--ink-secondary)] leading-relaxed">
            Escanea la factura con IA o arma una vaca. Comparte el enlace por
            WhatsApp y recibe por{" "}
            <strong className="font-semibold text-[var(--ink-primary)]">
              Bre-B
            </strong>
            ,{" "}
            <strong className="font-semibold text-[var(--ink-primary)]">
              Nequi
            </strong>{" "}
            o{" "}
            <strong className="font-semibold text-[var(--ink-primary)]">
              Daviplata
            </strong>
            .
          </p>

          {/* Indicadores rápidos de valor */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 text-[11px] font-semibold text-[var(--ink-secondary)]">
              <Zap className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
              <span>Escaneo IA</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 text-[11px] font-semibold text-[var(--ink-secondary)]">
              <Share2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
              <span>Link WhatsApp</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 text-[11px] font-semibold text-[var(--ink-secondary)]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
              <span>En vivo</span>
            </div>
          </div>
        </section>

        {/* Formulario principal */}
        <main>
          <CreateRoomForm />
        </main>
      </div>
    </div>
  );
}
