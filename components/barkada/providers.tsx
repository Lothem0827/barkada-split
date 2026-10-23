"use client"

import { useEffect, useState, type ReactNode } from "react"

import { AppShellSkeleton } from "@/components/barkada/app-shell-skeleton"
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

  if (!ready) return <AppShellSkeleton />

  return <>{children}</>
}
