import { db } from '../db/index.js';
import { userSubscriptions, users, balanceLogs } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { signBalanceLog } from './hmac.js';
import { refreshUserQuota } from '../traffic/collector.js';

// 自动续费检查（每分钟运行）
export function runAutoRenewCheck() {
  console.log('[AutoRenew] Checking for renewals...');
  
  try {
    // 查找 72 小时内过期的活跃订阅
    const now = Date.now();
    const seventyTwoHours = 72 * 60 * 60 * 1000;
    
    const expiringSubs = db.query.userSubscriptions.findMany({
      where: and(
        eq(userSubscriptions.status, 1),
        eq(userSubscriptions.autoRenew, 1)
      ),
    }).sync();
    
    for (const sub of expiringSubs) {
      const hoursUntilExpiry = (sub.expireAt - now) / (1000 * 60 * 60);
      
      if (hoursUntilExpiry > 72 || hoursUntilExpiry < 0) continue;
      
      const user = db.query.users.findFirst({
        where: eq(sql`id`, sub.userId),
      }).sync();
      
      if (!user || (user.balance || 0) < sub.renewalAmount) {
        console.log(`[AutoRenew] User ${sub.userId} insufficient balance for renewal`);
        continue;
      }
      
      try {
        const balanceBefore = user.balance || 0;
        const balanceAfter = balanceBefore - sub.renewalAmount;
        
        // 扣减余额
        db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${sub.userId}`);
        
        // 延长过期时间
        const newExpireAt = sub.expireAt + sub.renewalValidityDays * 24 * 60 * 60 * 1000;
        
        db.update(userSubscriptions)
          .set({ expireAt: newExpireAt, updatedAt: new Date().toISOString() })
          .where(eq(userSubscriptions.id, sub.id))
          .run();
        
        db.run(sql`UPDATE users SET expired_at = ${newExpireAt} WHERE id = ${sub.userId}`);

        // 续费后如因到期被暂停，尝试恢复
        refreshUserQuota(sub.userId);
        
        // 记录余额日志
        db.insert(balanceLogs).values({
          userId: sub.userId,
          userName: user.username,
          amount: -sub.renewalAmount,
          balanceBefore,
          balanceAfter,
          reason: `自动续费：套餐 ${sub.packageId}`,
          signature: signBalanceLog(sub.userId, -sub.renewalAmount, balanceBefore, balanceAfter, `自动续费：套餐 ${sub.packageId}`),
          createdAt: new Date().toISOString(),
        }).run();
        
        console.log(`[AutoRenew] Successfully renewed subscription ${sub.id} for user ${sub.userId}`);
      } catch (error) {
        console.error(`[AutoRenew] Failed to renew subscription ${sub.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[AutoRenew] Error:', error);
  }
}

// 自动购买流量检查（每 10 分钟运行）
export function runAutoBuyTrafficCheck() {
  console.log('[AutoBuyTraffic] Checking for auto-buy...');
  
  try {
    // 查找启用了自动购买流量的用户
    const usersWithAutoBuy = db.query.users.findMany({
      where: eq(sql`auto_buy_traffic`, 1),
    }).sync();
    
    for (const user of usersWithAutoBuy) {
      if (!user.autoBuyTrafficPackageId) continue;
      
      // 获取关联的流量套餐
      const pkg = db.query.subscriptionPackages.findFirst({
        where: eq(sql`id`, user.autoBuyTrafficPackageId),
      }).sync();
      
      if (!pkg || pkg.type !== 'traffic' || !pkg.autoBuyTrafficEnabled) continue;
      if (pkg.stock === 0) continue;

      // 流量配额为 0 视为不限制，无需自动购流
      const trafficLimit = user.trafficLimitGb || 0;
      if (trafficLimit <= 0) continue;

      // 计算剩余流量（真实用量：配额 - 已用）
      const remainingFlow = trafficLimit - (user.usedFlowGb || 0);
      
      if (remainingFlow > (user.autoBuyTrafficThreshold || 10)) continue;
      
      // 检查余额
      if ((user.balance || 0) < pkg.price) {
        console.log(`[AutoBuyTraffic] User ${user.id} insufficient balance`);
        continue;
      }
      
      try {
        const balanceBefore = user.balance || 0;
        const balanceAfter = balanceBefore - pkg.price;
        
        // 扣减余额
        db.run(sql`UPDATE users SET balance = ${balanceAfter} WHERE id = ${user.id}`);
        
        // 添加流量配额
        db.run(sql`UPDATE users SET traffic_flow = traffic_flow + ${pkg.trafficLimitGb}, total_flow_gb = total_flow_gb + ${pkg.trafficLimitGb}, traffic_limit_gb = traffic_limit_gb + ${pkg.trafficLimitGb} WHERE id = ${user.id}`);
        
        // 扣减库存
        if (pkg.stock > 0) {
          db.run(sql`UPDATE subscription_packages SET stock = stock - 1 WHERE id = ${pkg.id} AND stock > 0`);
        }

        // 购流后如因超额被暂停，尝试恢复
        refreshUserQuota(user.id);
        
        // 记录余额日志
        db.insert(balanceLogs).values({
          userId: user.id,
          userName: user.username,
          amount: -pkg.price,
          balanceBefore,
          balanceAfter,
          reason: `自动购买流量：${pkg.name}`,
          signature: signBalanceLog(user.id, -pkg.price, balanceBefore, balanceAfter, `自动购买流量：${pkg.name}`),
          createdAt: new Date().toISOString(),
        }).run();
        
        console.log(`[AutoBuyTraffic] Successfully bought traffic for user ${user.id}`);
      } catch (error) {
        console.error(`[AutoBuyTraffic] Failed for user ${user.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[AutoBuyTraffic] Error:', error);
  }
}

// 清理过期订单（每小时运行）
export function cleanupExpiredOrders() {
  console.log('[Cleanup] Cleaning up expired orders...');
  
  try {
    const now = Date.now();
    
    // 查找超过 30 分钟未支付的订单
    const expiredOrders = db.query.orders.findMany({
      where: and(
        eq(sql`status`, 0),
        sql`pay_expires_at < ${now}`
      ),
    }).sync();
    
    for (const order of expiredOrders) {
      // 标记为已取消
      db.run(sql`UPDATE orders SET status = 2, updated_at = ${new Date().toISOString()} WHERE id = ${order.id}`);
      
      // 恢复库存
      if (order.payCurrency !== 'BALANCE') {
        db.run(sql`UPDATE subscription_packages SET stock = stock + 1 WHERE id = ${order.packageId} AND stock >= 0`);
      }
    }
    
    if (expiredOrders.length > 0) {
      console.log(`[Cleanup] Cancelled ${expiredOrders.length} expired orders`);
    }
  } catch (error) {
    console.error('[Cleanup] Error:', error);
  }
}
