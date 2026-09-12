import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, subscriptionPackages, userSubscriptions, balanceLogs } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { signBalanceLog } from './hmac.js';

export const orderRoutes = new Hono();

// 生成订单号
function generateOrderNo(): string {
  return `PKG${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

// 计算过期时间
function calculateExpireAt(validityDays: number): number {
  if (validityDays === 0) {
    return new Date('2056-01-01').getTime();
  }
  return Date.now() + validityDays * 24 * 60 * 60 * 1000;
}

// 应用套餐到用户
async function applyPackageToUser(userId: number, pkg: any, orderId: number) {
  const user = db.query.users.findFirst({
    where: eq(sql`id`, userId),
  }).sync();
  
  if (!user) throw new Error('用户不存在');
  
  // 撤销现有活跃订阅
  const activeSubs = db.query.userSubscriptions.findMany({
    where: and(
      eq(userSubscriptions.userId, userId),
      eq(userSubscriptions.status, 1)
    ),
  }).sync();
  
  for (const sub of activeSubs) {
    db.update(userSubscriptions)
      .set({ status: 0, updatedAt: new Date().toISOString() })
      .where(eq(userSubscriptions.id, sub.id))
      .run();
  }
  
  // 计算应用值
  const appliedFlow = pkg.trafficLimitGb > 0 ? pkg.trafficLimitGb : (user.totalFlowGb || 0);
  const appliedMaxRules = pkg.maxRules > 0 ? pkg.maxRules : (user.maxRules || 0);
  const appliedMaxNodes = pkg.maxNodes > 0 ? pkg.maxNodes : (user.maxNodes ?? 0);
  const appliedExpireAt = calculateExpireAt(pkg.validityDays);
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
  db.run(sql`UPDATE users SET total_flow_gb = ${appliedFlow}, max_rules = ${appliedMaxRules}, max_nodes = ${appliedMaxNodes}, expired_at = ${appliedExpireAt}, speed_limit_mbps = ${appliedSpeedLimit}, max_connections = ${appliedMaxConnections}, max_ip_access = ${appliedMaxIpAccess} WHERE id = ${userId}`);
}

// 创建订单
orderRoutes.post('/orders', async (c) => {
  try {
    const userId = (c as any).get('userId') as number;
    const body = await c.req.json<{ packageId: number; payCurrency: string }>();
    
    const pkg = db.query.subscriptionPackages.findFirst({
      where: and(
        eq(subscriptionPackages.id, body.packageId),
        eq(subscriptionPackages.enabled, 1),
        eq(subscriptionPackages.shopVisible, 1)
      ),
    }).sync();
    
    if (!pkg) {
      return c.json({ success: false, error: '套餐不存在或已下架' }, 404);
    }
    
    if (pkg.stock === 0) {
      return c.json({ success: false, error: '库存不足' }, 400);
    }
    
    const orderNo = generateOrderNo();
    const now = Date.now();
    
    if (body.payCurrency === 'BALANCE') {
      // 余额支付：立即完成
      const user = db.query.users.findFirst({
        where: eq(sql`id`, userId),
      }).sync();
      
      if (!user || (user.balance || 0) < pkg.price) {
        return c.json({ success: false, error: '余额不足' }, 400);
      }
      
      const balanceBefore = user.balance || 0;
      const balanceAfter = balanceBefore - pkg.price;
      
      // 扣减余额
      db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${userId}`);
      
      // 创建余额日志
      db.insert(balanceLogs).values({
        userId,
        userName: user.username,
        amount: -pkg.price,
        balanceBefore,
        balanceAfter,
        reason: `购买套餐：${pkg.name}`,
        signature: signBalanceLog(userId, -pkg.price, balanceBefore, balanceAfter, `购买套餐：${pkg.name}`),
        createdAt: new Date().toISOString(),
      }).run();
      
      // 创建订单（已完成）
      const result = db.insert(orders).values({
        orderNo,
        userId,
        userName: user.username,
        packageId: pkg.id,
        packageName: pkg.name,
        packageType: pkg.type,
        packageMeta: JSON.stringify(pkg),
        amount: pkg.price,
        payCurrency: 'BALANCE',
        status: 1,
        payTime: now,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();
      
      // 应用套餐
      await applyPackageToUser(userId, pkg, result.lastInsertRowid as number);
      
      return c.json({ success: true, data: { orderId: result.lastInsertRowid, orderNo, status: 1 } }, 201);
    }
    
    // 外部支付：创建待支付订单
    const user = db.query.users.findFirst({
      where: eq(sql`id`, userId),
    }).sync();
    
    const result = db.insert(orders).values({
      orderNo,
      userId,
      userName: user?.username,
      packageId: pkg.id,
      packageName: pkg.name,
      packageType: pkg.type,
      packageMeta: JSON.stringify(pkg),
      amount: pkg.price,
      payCurrency: body.payCurrency,
      status: 0,
      payExpiresAt: now + 30 * 60 * 1000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    
    // 扣减库存
    if (pkg.stock > 0) {
      db.run(sql`UPDATE subscription_packages SET stock = stock - 1, updated_at = ${new Date().toISOString()} WHERE id = ${pkg.id}`);
    }
    
    return c.json({ success: true, data: { orderId: result.lastInsertRowid, orderNo, status: 0 } }, 201);
  } catch (error: any) {
    console.error('Create order error:', error);
    return c.json({ success: false, error: '创建订单失败' }, 500);
  }
});

// 获取我的订单列表
orderRoutes.get('/orders', (c) => {
  const userId = (c as any).get('userId') as number;
  
  const userOrders = db.query.orders.findMany({
    where: eq(orders.userId, userId),
    orderBy: [desc(orders.createdAt)],
    limit: 50,
  }).sync();
  
  return c.json({ success: true, data: userOrders });
});

// 获取订单详情
orderRoutes.get('/orders/:id', (c) => {
  const userId = (c as any).get('userId') as number;
  const id = parseInt(c.req.param('id'));
  
  const order = db.query.orders.findFirst({
    where: and(
      eq(orders.id, id),
      eq(orders.userId, userId)
    ),
  }).sync();
  
  if (!order) {
    return c.json({ success: false, error: '订单不存在' }, 404);
  }
  
  return c.json({ success: true, data: order });
});

// 取消订单
orderRoutes.post('/orders/:id/cancel', (c) => {
  const userId = (c as any).get('userId') as number;
  const id = parseInt(c.req.param('id'));
  
  const order = db.query.orders.findFirst({
    where: and(
      eq(orders.id, id),
      eq(orders.userId, userId),
      eq(orders.status, 0)
    ),
  }).sync();
  
  if (!order) {
    return c.json({ success: false, error: '订单不存在或已处理' }, 404);
  }
  
  db.update(orders)
    .set({ status: 2, updatedAt: new Date().toISOString() })
    .where(eq(orders.id, id))
    .run();
  
  // 恢复库存
  if (order.payCurrency !== 'BALANCE') {
    db.run(sql`UPDATE subscription_packages SET stock = stock + 1 WHERE id = ${order.packageId} AND stock >= 0`);
  }
  
  return c.json({ success: true });
});

// 获取支付信息（外部支付）
orderRoutes.post('/orders/:id/pay', async (c) => {
  const userId = (c as any).get('userId') as number;
  const id = parseInt(c.req.param('id'));

  const order = db.query.orders.findFirst({
    where: and(
      eq(orders.id, id),
      eq(orders.userId, userId),
      eq(orders.status, 0)
    ),
  }).sync();

  if (!order) {
    return c.json({ success: false, error: '订单不存在或已处理' }, 404);
  }

  const { getPaymentGateway } = await import('./payment-gateway.js');
  const gateway = getPaymentGateway(order.payCurrency);

  if (!gateway) {
    return c.json({ success: false, error: '支付渠道未配置或已禁用' }, 400);
  }

  try {
    const payType = order.payCurrency === 'USDT' ? (c.req.query('network') || 'tron') : undefined;
    const result = await gateway.createInvoice(order.orderNo, order.amount, order.packageName, payType);
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Create invoice error:', error);
    return c.json({ success: false, error: error.message || '创建支付单失败' }, 500);
  }
});

// ==================== 管理员接口 ====================

// 获取所有订单
orderRoutes.get('/admin/orders', (c) => {
  const allOrders = db.query.orders.findMany({
    orderBy: [desc(orders.createdAt)],
    limit: 100,
  }).sync();
  
  return c.json({ success: true, data: allOrders });
});

// 手动完成订单
orderRoutes.post('/admin/orders/:id/complete', async (c) => {
  const id = parseInt(c.req.param('id'));
  
  const order = db.query.orders.findFirst({
    where: eq(orders.id, id),
  }).sync();
  
  if (!order) {
    return c.json({ success: false, error: '订单不存在' }, 404);
  }
  
  if (order.status !== 0) {
    return c.json({ success: false, error: '订单状态不正确' }, 400);
  }
  
  const pkg = JSON.parse(order.packageMeta);
  
  db.update(orders)
    .set({ status: 1, payTime: Date.now(), updatedAt: new Date().toISOString() })
    .where(eq(orders.id, id))
    .run();
  
  // 交付商品
  if (pkg.type === 'balance') {
    const user = db.query.users.findFirst({
      where: eq(sql`id`, order.userId),
    }).sync();
    const balanceBefore = user?.balance || 0;
    const balanceAfter = balanceBefore + pkg.price;
    
    db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${order.userId}`);
    
    db.insert(balanceLogs).values({
      userId: order.userId,
      userName: order.userName,
      amount: pkg.price,
      balanceBefore,
      balanceAfter,
      reason: `管理员手动完成订单：${order.orderNo}`,
      signature: signBalanceLog(order.userId, pkg.price, balanceBefore, balanceAfter, `管理员手动完成订单：${order.orderNo}`),
      createdAt: new Date().toISOString(),
    }).run();
  } else if (pkg.type === 'traffic') {
    db.run(sql`UPDATE users SET traffic_flow = traffic_flow + ${pkg.trafficLimitGb}, total_flow_gb = total_flow_gb + ${pkg.trafficLimitGb} WHERE id = ${order.userId}`);
  } else {
    await applyPackageToUser(order.userId, pkg, id);
  }
  
  return c.json({ success: true });
});

// 退款
orderRoutes.post('/admin/orders/:id/refund', (c) => {
  const id = parseInt(c.req.param('id'));
  
  const order = db.query.orders.findFirst({
    where: eq(orders.id, id),
  }).sync();
  
  if (!order) {
    return c.json({ success: false, error: '订单不存在' }, 404);
  }
  
  if (order.status !== 1) {
    return c.json({ success: false, error: '订单状态不正确' }, 400);
  }
  
  db.update(orders)
    .set({ status: 3, refundTime: Date.now(), updatedAt: new Date().toISOString() })
    .where(eq(orders.id, id))
    .run();
  
  // 退还余额
  if (order.payCurrency === 'BALANCE') {
    const user = db.query.users.findFirst({
      where: eq(sql`id`, order.userId),
    }).sync();
    const balanceBefore = user?.balance || 0;
    const balanceAfter = balanceBefore + order.amount;
    
    db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${order.userId}`);
    
    db.insert(balanceLogs).values({
      userId: order.userId,
      userName: order.userName,
      amount: order.amount,
      balanceBefore,
      balanceAfter,
      reason: `订单退款：${order.orderNo}`,
      signature: signBalanceLog(order.userId, order.amount, balanceBefore, balanceAfter, `订单退款：${order.orderNo}`),
      createdAt: new Date().toISOString(),
    }).run();
  }
  
  return c.json({ success: true });
});
