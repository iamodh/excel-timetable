import { revalidateTag } from "next/cache"
import { verifyAdminToken } from "@/lib/admin-auth"

export async function POST(request: Request) {
  console.log("[revalidate] POST received")
  if (!verifyAdminToken(request)) {
    console.log("[revalidate] auth FAILED")
    return Response.json(
      { message: "관리자 인증이 필요합니다." },
      { status: 401 }
    )
  }
  console.log("[revalidate] auth ok → revalidateTag('timetable', 'max')")
  revalidateTag("timetable", "max")
  console.log("[revalidate] done")

  return Response.json({ message: "시간표가 최신화되었습니다." })
}
