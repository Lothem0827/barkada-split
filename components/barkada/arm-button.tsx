"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "cn"

export function ArmButton({
  label,
  armedLabel,
  cancelLabel,
  onConfirm,
  className,
}: {
  label: string
  armedLabel: string
  cancelLabel: string
  onConfirm: () => void
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <Button variant="destructive" className={cn("min-h-[40px] px-3.5", className)} onClick={() => setArmed(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="destructive"
        className="min-h-[40px] px-3.5"
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {armedLabel}
      </Button>
      <Button variant="outline" className="min-h-[40px] px-3.5" onClick={() => setArmed(false)}>
        {cancelLabel}
      </Button>
    </div>
  )
}
