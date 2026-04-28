import { revalidateTag } from "next/cache"
import { setStoredPin } from "@/lib/pin"
import { verifyAdminToken } from "@/lib/admin-auth"

export async function POST(request: Request) {
  if (!verifyAdminToken(request)) {
    return Response.json(
      { message: "관리자 인증이 필요합니다." },
      { status: 401 }
    )
  }

  const body = (await request.json()) as { pin?: unknown }
  const newPin = typeof body.pin === "string" ? body.pin : ""

  if (!newPin) {
    return Response.json(
      { message: "PIN을 입력해주세요." },
      { status: 400 }
    )
  }

  await setStoredPin(newPin)
  revalidateTag("student_pin", "max")

  return Response.json({ message: "PIN이 변경되었습니다." })
}
