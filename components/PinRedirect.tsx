"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function PinRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/pin")
  }, [router])

  return null
}
