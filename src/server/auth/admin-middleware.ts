import { Context, Next } from 'hono';

export async function adminMiddleware(c: Context, next: Next) {
  const role = (c as any).get('role');
  if (role !== 'admin') {
    return c.json({ success: false, error: '需要管理员权限' }, 403);
  }
  await next();
}
