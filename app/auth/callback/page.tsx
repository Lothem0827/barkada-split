"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { toast } from "@/components/ui/toast"
import { t } from "@/lib/i18n"
import { useBarkadaStore } from "@/lib/store"
import { getSupabase, oauthErrorFromUrl } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const router = useRouter()
  const lang = useBarkadaStore((store) => store.state.lang)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const oauthError = oauthErrorFromUrl(window.location.search, window.location.hash)
    if (oauthError) {
      toast.add({
        title: t(useBarkadaStore.getState().state.lang, "googleCallbackFailed"),
        description: oauthError,
        timeout: 4200,
        type: "error",
      })
      router.replace("/")
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      router.replace("/")
      return
    }
    void supabase.auth.getSession().then(() => {
      router.replace("/")
    })
  }, [router])

  return (
    <div className="flex min-h-dvh w-full items-center px-4">
      <p className="text-sm text-muted-foreground">{t(lang, "loading")}</p>
    </div>
  )
}
