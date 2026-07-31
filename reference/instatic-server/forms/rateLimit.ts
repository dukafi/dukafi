import { RateLimiter } from '../auth/rateLimit'

export const publicFormPerIpRateLimit = new RateLimiter({
  limit: 60,
  windowMs: 10 * 60 * 1000,
})

export const publicFormPerFormRateLimit = new RateLimiter({
  limit: 30,
  windowMs: 10 * 60 * 1000,
})

export const publicFormChallengePerIpRateLimit = new RateLimiter({
  limit: 60,
  windowMs: 10 * 60 * 1000,
})

export const publicFormChallengePerFormRateLimit = new RateLimiter({
  limit: 60,
  windowMs: 10 * 60 * 1000,
})
