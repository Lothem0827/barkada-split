"use client"

import { useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"

export function CopyAction({
  children,
  copiedLabel,
  onCopy,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
  copiedLabel: string
  onCopy: () => boolean | void | Promise<boolean | void>
}) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      {...props}
      onClick={async () => {
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
        const result = await onCopy()
        if (result === false) return
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? copiedLabel : children}
    </Button>
  )
}
