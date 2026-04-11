import { getStoredPin } from "@/lib/pin"

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30일

export async function POST(request: Request) {
  const body = (await request.json()) as { pin?: unknown }
  const submitted = typeof body.pin === "string" ? body.pin : ""

  const stored = await getStoredPin()
  if (!stored || submitted !== stored) {
    return Response.json(
      { message: "PIN이 올바르지 않습니다." },
      { status: 401 }
    )
  }

  const cookie = [
    `student_pin=${submitted}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ].join("; ")

  return new Response(JSON.stringify({ message: "인증되었습니다." }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookie,
    },
  })
}
