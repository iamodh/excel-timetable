import { Redis } from "@upstash/redis"
import { cacheLife, cacheTag } from "next/cache"

const STUDENT_PIN_KEY = "student_pin"

let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

export async function getStoredPin(): Promise<string | null> {
  "use cache"
  cacheLife("max")
  cacheTag("student_pin")
  const pin = await getRedis().get<string>(STUDENT_PIN_KEY)
  return pin !== null ? String(pin) : null
}

export async function setStoredPin(pin: string): Promise<void> {
  await getRedis().set(STUDENT_PIN_KEY, pin)
}
