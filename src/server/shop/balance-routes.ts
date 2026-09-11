import { Hono } from 'hono';
import { db } from '../db/index.js';
import { balanceLogs } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { signBalanceLog } from './hmac.js';

export const balanceRoutes = new Hono();

// 获取我的余额
balanceRoutes.get('/balance', (c) => {
  const userId = (c as any).get('userId') as number;
  
  const user = db.query.users.findFirst({
    where: eq(sql`id`, userId),
  });
  
  if (!user) {
    return c.json({ success: false, error: '用户不存在' }, 404);
  }
  
  return c.json({ success: true, data: { balance: user.balance || 0 } });
});

// 获取我的余额日志
balanceRoutes.get('/balance/logs', (c) => {
  const userId = (c as any).get('userId') as number;
  
  const logs = db.query.balanceLogs.findMany({
    where: eq(balanceLogs.userId, userId),
    orderBy: [desc(balanceLogs.createdAt)],
    limit: 100,
  });
  
  return c.json({ success: true, data: logs });
});

// ==================== 管理员接口 ====================

// 手动充值/扣款
balanceRoutes.post('/admin/users/:userId/balance', async (c) => {
  try {
    const targetUserId = parseInt(c.req.param('userId'));
    const body = await c.req.json<{ amount: number; reason: string }>();
    
    const user = db.query.users.findFirst({
      where: eq(sql`id`, targetUserId),
    });
    
    if (!user) {
      return c.json({ success: false, error: '用户不存在' }, 404);
    }
    
    const balanceBefore = user.balance || 0;
    const balanceAfter = balanceBefore + body.amount;
    
    db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${targetUserId}`);
    
    db.insert(balanceLogs).values({
      userId: targetUserId,
      userName: user.username,
      amount: body.amount,
      balanceBefore,
      balanceAfter,
      reason: body.reason,
      signature: signBalanceLog(targetUserId, body.amount, balanceBefore, balanceAfter, body.reason),
      createdAt: new Date().toISOString(),
    }).run();
    
    return c.json({ success: true, data: { balance: balanceAfter } });
  } catch (error: any) {
    console.error('Admin balance update error:', error);
    return c.json({ success: false, error: '操作失败' }, 500);
  }
});

// 获取所有余额日志
balanceRoutes.get('/admin/balance/logs', (c) => {
  const logs = db.query.balanceLogs.findMany({
    orderBy: [desc(balanceLogs.createdAt)],
    limit: 200,
  });
  
  return c.json({ success: true, data: logs });
});
