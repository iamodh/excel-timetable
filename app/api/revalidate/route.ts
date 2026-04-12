import { revalidatePath } from "next/cache"
import { verifyAdminToken } from "@/lib/admin-auth"

export async function POST(request: Request) {
  if (!verifyAdminToken(request)) {
    return Response.json(
      { message: "관리자 인증이 필요합니다." },
      { status: 401 }
    )
  }

  revalidatePath("/")

  return Response.json({ message: "시간표가 최신화되었습니다." })
}
