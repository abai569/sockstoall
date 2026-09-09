/**
 * 认证中间件
 */

import { Context, Next } from 'hono';
import { verifyToken } from './jwt.js';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '未授权' }, 401);
  }
  
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  
  if (!payload) {
    return c.json({ success: false, error: 'Token 无效或已过期' }, 401);
  }
  
  c.set('username', payload.username);
  await next();
}
