"use client"

import { ArrowLeftRightIcon, ReceiptIcon, ScrollTextIcon, UsersIcon, type LucideIcon } from "lucide-react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { t } from "@/lib/i18n"
import { type Lang, type Tab } from "@/lib/types"

const TABS: { id: Tab; icon: LucideIcon; key: "gastos" | "hatian" | "barkada" | "activity" }[] = [
  { id: "gastos", icon: ReceiptIcon, key: "gastos" },
  { id: "hatian", icon: ArrowLeftRightIcon, key: "hatian" },
  { id: "barkada", icon: UsersIcon, key: "barkada" },
  { id: "activity", icon: ScrollTextIcon, key: "activity" },
]

export function BottomNav({ lang, unreadActivity }: { lang: Lang; unreadActivity: number }) {
  return (
    <TabsList
      variant="line"
      className="fixed bottom-0 inset-x-0 z-30 grid h-auto! w-full grid-cols-4 rounded-none border-t bg-background select-none pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      {TABS.map((item) => {
        const Icon = item.icon
        return (
          <TabsTrigger key={item.id} value={item.id} className="h-auto min-h-[52px] flex-col gap-0 py-1">
            <span className="relative">
              <Icon />
              {item.id === "activity" && unreadActivity > 0 ? (
                <span className="absolute -top-1.5 -right-3 inline-flex min-h-4 min-w-4 animate-pulse items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {unreadActivity}
                </span>
              ) : null}
            </span>
            {t(lang, item.key)}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
