import { cookies } from "next/headers"
import { getStoredPin } from "@/lib/pin"
import { PinRedirect } from "@/components/PinRedirect"

export async function AuthGate() {
  const pin = (await cookies()).get("student_pin")?.value
  const storedPin = await getStoredPin()
  if (!storedPin || pin !== storedPin) {
    return <PinRedirect />
  }
  return null
}
