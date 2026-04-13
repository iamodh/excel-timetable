import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getStoredPin } from "@/lib/pin"

export async function AuthGate() {
  const pin = (await cookies()).get("student_pin")?.value
  const storedPin = await getStoredPin()
  if (!storedPin || pin !== storedPin) {
    redirect("/pin")
  }
  return null
}
