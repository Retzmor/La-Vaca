import Link from "next/link";

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] rounded-xl"
      aria-label="La Vaca — Ir al inicio"
    >
      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-primary)] shadow-sm shadow-[#10B981]/20 transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-95">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 3.5h14v17l-2.3-1.6-2.3 1.6-2.4-1.6-2.4 1.6-2.3-1.6L5 20.5v-17z"
            fill="#0B0E0D"
          />
          <rect x="8" y="7" width="8" height="1.7" rx="0.85" fill="#F2F5F3" />
          <rect x="8" y="10.4" width="5.2" height="1.7" rx="0.85" fill="#10B981" />
          <rect
            x="8"
            y="13.8"
            width="6.8"
            height="1.7"
            rx="0.85"
            fill="#F2F5F3"
            fillOpacity="0.38"
          />
        </svg>
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-[19px] font-extrabold tracking-tight text-[var(--ink-primary)]">
          La Vaca
        </span>
        {!compact && (
          <span className="text-[11px] font-medium text-[var(--ink-secondary)] mt-0.5">
            Cuentas claras, amistad larga
          </span>
        )}
      </div>
    </Link>
  );
}
