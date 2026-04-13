import { revalidateTag } from "next/cache"
import { verifyAdminToken } from "@/lib/admin-auth"
import { setNotice, deleteNotice } from "@/lib/notice"

export async function POST(request: Request) {
  if (!verifyAdminToken(request)) {
    return Response.json(
      { message: "관리자 인증이 필요합니다." },
      { status: 401 }
    )
  }

  const body = (await request.json()) as { message?: unknown }
  const message = typeof body.message === "string" ? body.message : ""

  if (!message) {
    return Response.json(
      { message: "공지 내용을 입력해주세요." },
      { status: 400 }
    )
  }

  await setNotice(message)
  revalidateTag("notice", "max")

  return Response.json({ message: "공지가 등록되었습니다." })
}

export async function DELETE(request: Request) {
  if (!verifyAdminToken(request)) {
    return Response.json(
      { message: "관리자 인증이 필요합니다." },
      { status: 401 }
    )
  }

  await deleteNotice()
  revalidateTag("notice", "max")

  return Response.json({ message: "공지가 삭제되었습니다." })
}
