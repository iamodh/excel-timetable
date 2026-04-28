import { Redis } from "@upstash/redis"
import { unstable_cache } from "next/cache"

const NOTICE_KEY = "notice"

let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

export const getNotice = unstable_cache(
  async (): Promise<string | null> => {
    const notice = await getRedis().get<string>(NOTICE_KEY)
    return notice !== null ? String(notice) : null
  },
  ["notice"],
  { tags: ["notice"], revalidate: false },
)

export async function setNotice(message: string): Promise<void> {
  await getRedis().set(NOTICE_KEY, message)
}

export async function deleteNotice(): Promise<void> {
  await getRedis().del(NOTICE_KEY)
}
