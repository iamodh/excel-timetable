import { NextRequest, NextResponse } from "next/server"
import { getStoredPin } from "@/lib/pin"

export async function proxy(request: NextRequest) {
  const pin = request.cookies.get("student_pin")?.value
  const storedPin = await getStoredPin()
  if (!storedPin || pin !== storedPin) {
    return NextResponse.redirect(new URL("/pin", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/",
  ],
}
