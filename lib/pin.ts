import { Redis } from "@upstash/redis"

const STUDENT_PIN_KEY = "student_pin"

let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

export async function getStoredPin(): Promise<string | null> {
  const pin = await getRedis().get<string>(STUDENT_PIN_KEY)
  return pin !== null ? String(pin) : null
}

export async function setStoredPin(pin: string): Promise<void> {
  await getRedis().set(STUDENT_PIN_KEY, pin)
}
