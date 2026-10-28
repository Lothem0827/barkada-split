"use client"

import { useMemo, useState, type ComponentType } from "react"
import {
  BanknoteIcon,
  CircleCheckIcon,
  CopyIcon,
  CrownIcon,
  EyeIcon,
  HandIcon,
  HashIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  ReceiptIcon,
  SirenIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  UnlockIcon,
  UsersIcon,
  type LucideProps,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { activityAgo, activityResiboText, isDramaticActivity, tripActivityLog } from "@/lib/activity"
import { peso } from "@/lib/calc"
import { t } from "@/lib/i18n"
import { type ActivityCategory, type ActivityLogItem, type Lang, type Trip } from "@/lib/types"

const PILL =
  "min-h-[36px] shrink-0 rounded-full px-3 text-xs font-bold transition active:scale-95"

type LucideIcon = ComponentType<LucideProps>

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  "🧾": ReceiptIcon,
  "✓": CircleCheckIcon,
  "✅": CircleCheckIcon,
  "↩️": Undo2Icon,
  "✏️": PencilIcon,
  "🗑️": Trash2Icon,
  "🙋‍♂️": HandIcon,
  "👀": EyeIcon,
  "➕": PlusIcon,
  "👋": HandIcon,
  "🔓": UnlockIcon,
  "🔒": LockIcon,
  "🔢": HashIcon,
  "👑": CrownIcon,
  "🚨": SirenIcon,
}

const FILTERS: {
  id: "all" | ActivityCategory
  label: "activityAll" | "activityGastos" | "activityBayad" | "activityAdmin"
  empty: "activityEmpty" | "activityEmptyGastos" | "activityEmptyBayad" | "activityEmptyAdmin"
  icon: LucideIcon
}[] = [
  { id: "all", label: "activityAll", empty: "activityEmpty", icon: SparklesIcon },
  { id: "gastos", label: "activityGastos", empty: "activityEmptyGastos", icon: ReceiptIcon },
  { id: "bayad", label: "activityBayad", empty: "activityEmptyBayad", icon: BanknoteIcon },
  { id: "admin", label: "activityAdmin", empty: "activityEmptyAdmin", icon: UsersIcon },
]

function ActivityIcon({ icon }: { icon: string }) {
  const Icon = ACTIVITY_ICONS[icon] ?? ACTIVITY_ICONS[icon.replace(/\uFE0F/g, "")]
  if (!Icon) return icon
  return <Icon className="size-4" />
}

function ActivityMessage({ item }: { item: ActivityLogItem }) {
  const name = item.actorName
  const index = name ? item.message.indexOf(name) : -1
  if (index < 0) return item.message
  return (
    <>
      {item.message.slice(0, index)}
      <span className="font-semibold text-foreground">{name}</span>
      {item.message.slice(index + name.length)}
    </>
  )
}

export function ActivityLogCard({
  trip,
  now,
  lang,
  onCopy,
}: {
  trip: Trip
  now: number
  lang: Lang
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
}) {
  const [filter, setFilter] = useState<"all" | ActivityCategory>("all")
  const items = useMemo(() => tripActivityLog(trip), [trip])
  const counts = useMemo(
    () => ({
      all: items.length,
      gastos: items.filter((item) => item.category === "gastos").length,
      bayad: items.filter((item) => item.category === "bayad").length,
      admin: items.filter((item) => item.category === "admin").length,
    }),
    [items]
  )
  const active = FILTERS.find((pill) => pill.id === filter) ?? FILTERS[0]
  const filtered = filter === "all" ? items : items.filter((item) => item.category === filter)
  const EmptyIcon = active.empty === "activityEmptyBayad" ? EyeIcon : active.icon

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-1">
        <ToggleGroup
          variant="outline"
          spacing={0}
          className="no-scrollbar flex w-full items-center gap-1.5 overflow-x-auto py-1"
          value={[filter]}
          onValueChange={(next) => {
            const picked = next[next.length - 1]
            if (picked === "all" || picked === "gastos" || picked === "bayad" || picked === "admin") {
              setFilter(picked)
            }
          }}
        >
          {FILTERS.map((pill) => {
            const Icon = pill.icon
            return (
              <ToggleGroupItem key={pill.id} value={pill.id} className={PILL}>
                <Icon data-icon="inline-start" />
                {t(lang, pill.label)} ({counts[pill.id]})
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
      {filtered.length ? (
        <ol className="relative flex flex-col gap-3 pl-1">
          <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-border" />
          {filtered.map((item) => (
            <li key={item.id} className="relative flex gap-3">
              <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm ring-2 ring-background">
                <ActivityIcon icon={item.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug text-muted-foreground">
                    <ActivityMessage item={item} />
                  </p>
                  {isDramaticActivity(item) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[36px] shrink-0 px-2 text-xs"
                      onClick={() => void onCopy(activityResiboText(item, trip, now), t(lang, "resiboCopied"))}
                    >
                      <CopyIcon data-icon="inline-start" />
                      {t(lang, "copyResibo")}
                    </Button>
                  ) : (
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(item.ts).toISOString()}>
                      {activityAgo(item.ts, now)}
                    </time>
                  )}
                </div>
                {isDramaticActivity(item) ? (
                  <time className="text-xs text-muted-foreground" dateTime={new Date(item.ts).toISOString()}>
                    {activityAgo(item.ts, now)}
                  </time>
                ) : null}
                {item.amount != null ? (
                  <Badge variant="secondary" className="mt-1 font-mono">
                    {peso(item.amount)}
                  </Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <EmptyIcon className="size-3.5 shrink-0" />
          {t(lang, active.empty)}
        </p>
      )}
    </div>
  )
}
