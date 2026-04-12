export function verifyAdminToken(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? ""
  const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]*)/)
  const token = match?.[1]
  return token !== undefined && token === process.env.ADMIN_PASSWORD
}
