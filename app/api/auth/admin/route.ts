const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7일

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: unknown }
  const submitted = typeof body.password === "string" ? body.password : ""

  if (submitted !== process.env.ADMIN_PASSWORD) {
    return Response.json(
      { message: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    )
  }

  const cookie = [
    `admin_token=${submitted}`,
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
