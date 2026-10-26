"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { toast } from "@/components/ui/toast"
import { t } from "@/lib/i18n"
import { useBarkadaStore } from "@/lib/store"
import { fetchMyRemoteLakads, getSupabase, oauthErrorFromUrl } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const router = useRouter()
  const lang = useBarkadaStore((store) => store.state.lang)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const go = (path: string) => router.replace(path)
    const homeOrOnboard = () => {
      const { onboarded, profile } = useBarkadaStore.getState().state
      go(onboarded || profile.name.trim() ? "/" : "/onboarding")
    }

    const oauthError = oauthErrorFromUrl(window.location.search, window.location.hash)
    if (oauthError) {
      toast.add({
        title: t(useBarkadaStore.getState().state.lang, "googleCallbackFailed"),
        description: oauthError,
        timeout: 4200,
        type: "error",
      })
      homeOrOnboard()
      return
    }

    const supabase = getSupabase()
    if (!supabase) {
      homeOrOnboard()
      return
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id || ""
      const store = useBarkadaStore.getState()
      if (uid) store.setAuthUid(uid)
      const trips = await fetchMyRemoteLakads()
      if (trips.length) useBarkadaStore.getState().restoreFromCloud(trips)
      const { profile, onboarded } = useBarkadaStore.getState().state
      if (profile.name.trim()) {
        if (!onboarded) useBarkadaStore.getState().finishOnboarding()
        go("/")
        return
      }
      go("/onboarding?step=sync")
    })
  }, [router])

  return (
    <div className="flex min-h-dvh w-full items-center px-4">
      <p className="text-sm text-muted-foreground">{t(lang, "loading")}</p>
    </div>
  )
}
