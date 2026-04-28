import { Redis } from "@upstash/redis"
import { unstable_cache } from "next/cache"

const STUDENT_PIN_KEY = "student_pin"

let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

export const getStoredPin = unstable_cache(
  async (): Promise<string | null> => {
    const pin = await getRedis().get<string>(STUDENT_PIN_KEY)
    return pin !== null ? String(pin) : null
  },
  ["student_pin"],
  { tags: ["student_pin"], revalidate: false },
)

export async function setStoredPin(pin: string): Promise<void> {
  await getRedis().set(STUDENT_PIN_KEY, pin)
}
