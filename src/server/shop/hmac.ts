import { createHmac } from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || 'sockstoall-hmac-secret-change-in-production';

export function signBalanceLog(
  userId: number,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  reason: string
): string {
  const payload = `${userId}:${amount}:${balanceBefore}:${balanceAfter}:${Date.now()}:${reason}`;
  return createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
}

export function verifyBalanceLog(
  userId: number,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  timestamp: number,
  reason: string,
  signature: string
): boolean {
  const payload = `${userId}:${amount}:${balanceBefore}:${balanceAfter}:${timestamp}:${reason}`;
  const expected = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return expected === signature;
}
