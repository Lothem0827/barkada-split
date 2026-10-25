export function AppShellSkeleton() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <header className="flex items-start justify-between gap-3 border-b px-4 pt-[max(12px,env(safe-area-inset-top))] pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-[38px] w-24 animate-pulse rounded-full bg-muted" />
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-24">
        <div className="flex flex-col gap-3 rounded-xl bg-card p-4">
          <div className="h-3 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded-md bg-muted" />
        </div>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-auto w-full grid-cols-4 border-t bg-background pb-[max(12px,env(safe-area-inset-bottom))]">
        {[0, 1, 2, 3].map((tab) => (
          <div key={tab} className="flex min-h-12 flex-col items-center justify-center gap-1 py-1">
            <div className="size-5 animate-pulse rounded-md bg-muted" />
            <div className="h-2 w-10 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </nav>
    </div>
  )
}
