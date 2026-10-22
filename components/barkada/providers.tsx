"use client"

import { useEffect, useState, type ReactNode } from "react"

import { t } from "@/lib/i18n"
import { useBarkadaStore } from "@/lib/store"
import { useSyncEngine } from "@/lib/sync"

export function BarkadaProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsub = useBarkadaStore.persist.onFinishHydration(() => setReady(true))
    if (useBarkadaStore.persist.hasHydrated()) setReady(true)
    return unsub
  }, [])

  useSyncEngine()

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-background px-4 py-6">
        <p className="text-sm text-muted-foreground">{t("en", "loading")}</p>
      </div>
    )
  }

  return <>{children}</>
}
