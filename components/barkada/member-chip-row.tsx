"use client"

import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { initial } from "@/lib/types"
import { cn } from "cn"

export function MemberChipRow({
  members,
  selected,
  onToggle,
  disabled,
  label,
  className,
}: {
  members: { id: string; name: string }[]
  selected: string[]
  onToggle: (id: string) => void
  disabled?: (id: string) => boolean
  label?: (member: { id: string; name: string }) => string
  className?: string
}) {
  return (
    <div className={cn("no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory px-4", className)}>
      {members.map((member) => {
        const on = selected.includes(member.id)
        return (
          <Button
            key={member.id}
            type="button"
            variant="outline"
            aria-pressed={on}
            disabled={disabled?.(member.id) ?? false}
            className={cn(
              "min-h-[42px] shrink-0 snap-start gap-2 px-3.5",
              on && "bg-white text-neutral-950 hover:bg-white"
            )}
            onClick={() => onToggle(member.id)}
          >
            {on ? <CheckIcon className="size-3.5" /> : null}
            <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-bold text-foreground">
              {initial(member.name)}
            </span>
            <span className="max-w-[140px] truncate">{label ? label(member) : member.name}</span>
          </Button>
        )
      })}
    </div>
  )
}
