/**
 * 认证中间件
 */

import { Context, Next } from 'hono';
import { verifyToken } from './jwt.js';
import { getUser } from './user-store.js';

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

  const user = await getUser(payload.username);
  if (!user) {
    return c.json({ success: false, error: '用户不存在' }, 401);
  }
  
  c.set('username', user.username);
  c.set('userId', user.id);
  c.set('role', user.role);
  await next();
}
