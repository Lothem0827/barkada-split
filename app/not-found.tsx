"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { CompassIcon, HouseIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseJoinCodeFromInput } from "@/lib/join-code"

export default function NotFound() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")

  function join() {
    const parsed = parseJoinCodeFromInput(code)
    if (!parsed) {
      setError("6-letter code like ELYU-26")
      return
    }
    router.push("/join/" + parsed)
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="flex min-h-dvh w-full flex-col justify-center gap-6 bg-background px-6">
        <div className="flex flex-col gap-2">
          <p className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
            <CompassIcon className="mb-1 inline size-7 align-[-4px]" /> This trip isn&apos;t on the map
            (404)
          </p>
          <p className="text-sm text-muted-foreground">Enter a join code or go back home.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Input
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setError("")
            }}
            placeholder="ELYU-26"
            maxLength={16}
            className="font-mono uppercase"
            onKeyDown={(event) => {
              if (event.key === "Enter") join()
            }}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button size="cta" onClick={join}>
            Join trip
          </Button>
          <Button size="cta" variant="outline" onClick={() => router.push("/")}>
            <HouseIcon data-icon="inline-start" />
            Back home
          </Button>
        </div>
      </div>
    </div>
  )
}
