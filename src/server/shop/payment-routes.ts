import { Hono } from 'hono';
import { db } from '../db/index.js';
import { paymentConfigs, orders, userSubscriptions, balanceLogs } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { signBalanceLog } from './hmac.js';

export const paymentRoutes = new Hono();

// 获取支付配置列表（公开，仅返回启用且非敏感字段）
paymentRoutes.get('/configs', (c) => {
  const configs = db.query.paymentConfigs.findMany({
    where: eq(paymentConfigs.enabled, 1),
  });
  
  // 过滤敏感信息
  const safeConfigs = configs.map(cfg => ({
    id: cfg.id,
    channel: cfg.channel,
    enabled: cfg.enabled,
  }));
  
  return c.json({ success: true, data: safeConfigs });
});

// 保存支付配置（管理员）
paymentRoutes.post('/configs', async (c) => {
  try {
    const body = await c.req.json<{ channel: string; config: string; enabled: number }>();
    const now = new Date().toISOString();
    
    const existing = db.query.paymentConfigs.findFirst({
      where: eq(paymentConfigs.channel, body.channel),
    });
    
    if (existing) {
      db.update(paymentConfigs)
        .set({ config: body.config, enabled: body.enabled, updatedAt: now })
        .where(eq(paymentConfigs.channel, body.channel))
        .run();
    } else {
      db.insert(paymentConfigs).values({
        channel: body.channel,
        config: body.config,
        enabled: body.enabled,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Save payment config error:', error);
    return c.json({ success: false, error: '保存配置失败' }, 500);
  }
});

// 获取所有支付配置（管理员）
paymentRoutes.get('/admin/configs', (c) => {
  const configs = db.query.paymentConfigs.findMany({
    orderBy: [paymentConfigs.id],
  });
  
  return c.json({ success: true, data: configs });
});

// 删除支付配置（管理员）
paymentRoutes.delete('/configs/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const result = db.delete(paymentConfigs)
    .where(eq(paymentConfigs.id, id))
    .run();
  
  if (result.changes === 0) {
    return c.json({ success: false, error: '配置不存在' }, 404);
  }
  
  return c.json({ success: true });
});

// 易支付回调
paymentRoutes.post('/callback/yipay', async (c) => {
  try {
    const body = await c.req.formData();
    const params: any = {};
    body.forEach((value, key) => { params[key] = value; });
    
    // 验证签名（简化版，实际需要根据易支付文档实现）
    const orderNo = params.out_trade_no;
    const tradeStatus = params.trade_status;
    
    if (tradeStatus !== 'TRADE_SUCCESS') {
      return c.text('fail');
    }
    
    const order = db.query.orders.findFirst({
      where: eq(orders.orderNo, orderNo),
    });
    
    if (!order || order.status !== 0) {
      return c.text('fail');
    }
    
    // 标记为处理中
    db.update(orders)
      .set({ status: 4, updatedAt: new Date().toISOString() })
      .where(eq(orders.id, order.id))
      .run();
    
    // 交付商品
    const pkg = JSON.parse(order.packageMeta);
    
    if (pkg.type === 'balance') {
      const user = db.query.users.findFirst({
        where: eq(sql`id`, order.userId),
      });
      const balanceBefore = user?.balance || 0;
      const balanceAfter = balanceBefore + pkg.price;
      
      db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${order.userId}`);
      
      db.insert(balanceLogs).values({
        userId: order.userId,
        userName: order.userName,
        amount: pkg.price,
        balanceBefore,
        balanceAfter,
        reason: `易支付充值：${order.orderNo}`,
        signature: signBalanceLog(order.userId, pkg.price, balanceBefore, balanceAfter, `易支付充值：${order.orderNo}`),
        createdAt: new Date().toISOString(),
      }).run();
    } else if (pkg.type === 'traffic') {
      db.run(sql`UPDATE users SET traffic_flow = traffic_flow + ${pkg.trafficLimitGb}, total_flow_gb = total_flow_gb + ${pkg.trafficLimitGb} WHERE id = ${order.userId}`);
    } else {
      // 应用套餐
      await applyPackageToUser(order.userId, pkg, order.id);
    }
    
    // 标记为已完成
    db.update(orders)
      .set({ status: 1, payTime: Date.now(), txHash: params.trade_no, updatedAt: new Date().toISOString() })
      .where(eq(orders.id, order.id))
      .run();
    
    return c.text('success');
  } catch (error) {
    console.error('YiPay callback error:', error);
    return c.text('fail');
  }
});

// USDT 支付回调
paymentRoutes.post('/callback/usdt', async (c) => {
  try {
    const body = await c.req.json();
    
    const orderNo = body.order_no;
    const status = body.status;
    
    if (status !== 'paid') {
      return c.json({ code: 1, msg: 'fail' });
    }
    
    const order = db.query.orders.findFirst({
      where: eq(orders.orderNo, orderNo),
    });
    
    if (!order || order.status !== 0) {
      return c.json({ code: 1, msg: 'order not found' });
    }
    
    // 标记为处理中
    db.update(orders)
      .set({ status: 4, updatedAt: new Date().toISOString() })
      .where(eq(orders.id, order.id))
      .run();
    
    // 交付商品（同易支付）
    const pkg = JSON.parse(order.packageMeta);
    
    if (pkg.type === 'balance') {
      const user = db.query.users.findFirst({
        where: eq(sql`id`, order.userId),
      });
      const balanceBefore = user?.balance || 0;
      const balanceAfter = balanceBefore + pkg.price;
      
      db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${order.userId}`);
      
      db.insert(balanceLogs).values({
        userId: order.userId,
        userName: order.userName,
        amount: pkg.price,
        balanceBefore,
        balanceAfter,
        reason: `USDT 充值：${order.orderNo}`,
        signature: signBalanceLog(order.userId, pkg.price, balanceBefore, balanceAfter, `USDT 充值：${order.orderNo}`),
        createdAt: new Date().toISOString(),
      }).run();
    } else if (pkg.type === 'traffic') {
      db.run(sql`UPDATE users SET traffic_flow = traffic_flow + ${pkg.trafficLimitGb}, total_flow_gb = total_flow_gb + ${pkg.trafficLimitGb} WHERE id = ${order.userId}`);
    } else {
      await applyPackageToUser(order.userId, pkg, order.id);
    }
    
    // 标记为已完成
    db.update(orders)
      .set({ status: 1, payTime: Date.now(), txHash: body.tx_hash, updatedAt: new Date().toISOString() })
      .where(eq(orders.id, order.id))
      .run();
    
    return c.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('USDT callback error:', error);
    return c.json({ code: 1, msg: 'fail' });
  }
});

// 辅助函数
import { sql } from 'drizzle-orm';

async function applyPackageToUser(userId: number, pkg: any, orderId: number) {
  const user = db.query.users.findFirst({
    where: eq(sql`id`, userId),
  });
  
  if (!user) throw new Error('用户不存在');
  
  // 撤销现有活跃订阅
  const activeSubs = db.query.userSubscriptions.findMany({
    where: and(
      eq(userSubscriptions.userId, userId),
      eq(userSubscriptions.status, 1)
    ),
  });
  
  for (const sub of activeSubs) {
    db.update(userSubscriptions)
      .set({ status: 0, updatedAt: new Date().toISOString() })
      .where(eq(userSubscriptions.id, sub.id))
      .run();
  }
  
  // 计算应用值
  const appliedFlow = pkg.trafficLimitGb > 0 ? pkg.trafficLimitGb : (user.totalFlowGb || 0);
  const appliedMaxRules = pkg.maxRules > 0 ? pkg.maxRules : (user.maxRules || 0);
  const appliedExpireAt = pkg.validityDays === 0 ? new Date('2056-01-01').getTime() : Date.now() + pkg.validityDays * 24 * 60 * 60 * 1000;
  const appliedSpeedLimit = Math.max(user.speedLimitMbps || 0, pkg.speedLimitMbps || 0);
  const appliedMaxConnections = Math.max(user.maxConnections || 0, pkg.maxConnections || 0);
  const appliedMaxIpAccess = Math.max(user.maxIpAccess || 0, pkg.maxIpAccess || 0);
  
  // 创建订阅记录
  db.insert(userSubscriptions).values({
    userId,
    packageId: pkg.id,
    startAt: Date.now(),
    expireAt: appliedExpireAt,
    autoRenew: pkg.autoRenew,
    renewalValidityDays: pkg.validityDays,
    renewalAmount: pkg.price,
    status: 1,
    orderId,
    baselineFlow: user.totalFlowGb || 0,
    baselineMaxRules: user.maxRules || 0,
    baselineExpireAt: user.expiredAt || 0,
    baselineSpeedLimit: user.speedLimitMbps || 0,
    baselineMaxConnections: user.maxConnections || 0,
    baselineMaxIpAccess: user.maxIpAccess || 0,
    appliedFlow,
    appliedMaxRules,
    appliedExpireAt,
    appliedSpeedLimit,
    appliedMaxConnections,
    appliedMaxIpAccess,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();
  
  // 更新用户字段
  db.run(sql`UPDATE users SET total_flow_gb = ${appliedFlow}, max_rules = ${appliedMaxRules}, expired_at = ${appliedExpireAt}, speed_limit_mbps = ${appliedSpeedLimit}, max_connections = ${appliedMaxConnections}, max_ip_access = ${appliedMaxIpAccess} WHERE id = ${userId}`);
}
