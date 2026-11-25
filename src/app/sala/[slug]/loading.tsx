export default function RoomLoading() {
  return (
    <div className="min-h-dvh pb-14">
      <div className="mx-auto max-w-lg px-4 pt-5 sm:px-5 space-y-5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-[var(--bg-elevated)]" />
            <div className="h-5 w-24 rounded-lg bg-[var(--bg-elevated)]" />
          </div>
          <div className="h-7 w-20 rounded-full bg-[var(--bg-elevated)]" />
        </div>

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="h-5 w-32 rounded-full bg-[var(--bg-elevated)]" />
          <div className="h-8 w-3/4 rounded-xl bg-[var(--bg-elevated)]" />
          <div className="h-12 w-full rounded-2xl bg-[var(--accent-soft)]" />
        </div>

        <div className="space-y-2.5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-20 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>

        <div className="h-64 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
      </div>
    </div>
  );
}
