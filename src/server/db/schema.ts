import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 用户表
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  status: integer('status').notNull().default(1), // 0=禁用，1=启用
  trafficLimitGb: real('traffic_limit_gb').default(0), // 流量配额 GB
  expiredAt: integer('expired_at').default(0), // 到期时间戳
  maxNodes: integer('max_nodes').default(5), // 最大节点数
  balance: integer('balance').default(0),
  trafficFlow: real('traffic_flow').default(0),
  totalFlowGb: real('total_flow_gb').default(0),
  usedFlowGb: real('used_flow_gb').default(0),
  maxRules: integer('max_rules').default(0),
  speedLimitMbps: integer('speed_limit_mbps').default(0),
  maxConnections: integer('max_connections').default(0),
  maxIpAccess: integer('max_ip_access').default(0),
  autoRenew: integer('auto_renew').default(0),
  autoBuyTraffic: integer('auto_buy_traffic').default(0),
  autoBuyTrafficPackageId: integer('auto_buy_traffic_package_id').default(0),
  autoBuyTrafficThreshold: real('auto_buy_traffic_threshold').default(10),
  renewalAmount: integer('renewal_amount').default(0),
  baseFlow: real('base_flow').default(0),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// 套餐表
export const subscriptionPackages = sqliteTable('subscription_packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').default('subscription'),  // subscription/traffic/balance
  name: text('name').notNull(),
  description: text('description').default(''),
  price: integer('price').default(0),  // 价格（分）
  validityDays: integer('validity_days').default(0),  // 有效期天数，0=永久
  trafficLimitGb: real('traffic_limit_gb').default(0),  // 流量配额 GB
  maxRules: integer('max_rules').default(0),  // 最大规则数
  speedLimitMbps: integer('speed_limit_mbps').default(0),  // 限速 Mbps
  maxConnections: integer('max_connections').default(0),  // 最大连接数
  maxIpAccess: integer('max_ip_access').default(0),  // 最大 IP 访问数
  autoRenew: integer('auto_renew').default(0),
  sortOrder: integer('sort_order').default(0),
  enabled: integer('enabled').default(1),
  shopVisible: integer('shop_visible').default(1),
  autoBuyTrafficEnabled: integer('auto_buy_traffic_enabled').default(0),
  stock: integer('stock').default(-1),  // -1=无限
  recommended: integer('recommended').default(0),
  groupId: integer('group_id'),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});

// 套餐分组表
export const packageGroups = sqliteTable('package_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').default(''),
  color: text('color').default('#1890ff'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});

// 用户订阅表
export const userSubscriptions = sqliteTable('user_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  packageId: integer('package_id').notNull(),
  startAt: integer('start_at').notNull(),  // ms timestamp
  expireAt: integer('expire_at').notNull(),  // ms timestamp
  autoRenew: integer('auto_renew').default(0),
  renewalValidityDays: integer('renewal_validity_days').default(0),
  renewalAmount: integer('renewal_amount').default(0),  // 分
  status: integer('status').default(1),  // 0=撤销，1=活跃
  orderId: integer('order_id'),
  
  // 基线值
  baselineFlow: real('baseline_flow').default(0),
  baselineMaxRules: integer('baseline_max_rules').default(0),
  baselineExpireAt: integer('baseline_expire_at').default(0),
  baselineSpeedLimit: integer('baseline_speed_limit').default(0),
  baselineMaxConnections: integer('baseline_max_connections').default(0),
  baselineMaxIpAccess: integer('baseline_max_ip_access').default(0),
  
  // 应用值
  appliedFlow: real('applied_flow').default(0),
  appliedMaxRules: integer('applied_max_rules').default(0),
  appliedExpireAt: integer('applied_expire_at').default(0),
  appliedSpeedLimit: integer('applied_speed_limit').default(0),
  appliedMaxConnections: integer('applied_max_connections').default(0),
  appliedMaxIpAccess: integer('applied_max_ip_access').default(0),
  
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});

// 订单表
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderNo: text('order_no').notNull().unique(),
  userId: integer('user_id').notNull(),
  userName: text('user_name'),
  packageId: integer('package_id').notNull(),
  packageName: text('package_name'),
  packageType: text('package_type').default('subscription'),
  packageMeta: text('package_meta'),  // JSON
  amount: integer('amount').notNull(),  // 分
  payCurrency: text('pay_currency').default('BALANCE'),
  status: integer('status').default(0),  // 0=待支付，1=已完成，2=已取消，3=已退款，4=处理中
  payTime: integer('pay_time'),
  refundTime: integer('refund_time'),
  payUrl: text('pay_url'),
  payAddress: text('pay_address'),
  payAmount: text('pay_amount'),
  payToken: text('pay_token'),
  qrContent: text('qr_content'),
  qrImageUrl: text('qr_image_url'),
  payExpiresAt: integer('pay_expires_at'),
  payReturnUrl: text('pay_return_url'),
  txHash: text('tx_hash'),
  payType: text('pay_type'),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});

// 支付配置表
export const paymentConfigs = sqliteTable('payment_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channel: text('channel').notNull().unique(),  // USDT/YIPAY
  config: text('config').notNull(),  // JSON
  enabled: integer('enabled').default(1),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});

// 余额日志表
export const balanceLogs = sqliteTable('balance_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  userName: text('user_name'),
  amount: integer('amount').notNull(),  // 正数=充值，负数=扣款（分）
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  reason: text('reason'),
  signature: text('signature'),  // HMAC-SHA256
  createdAt: text('created_at').default(new Date().toISOString()),
});

// 服务器表
export const servers = sqliteTable('servers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address').notNull(),  // IP 或域名
  agentToken: text('agent_token').notNull().unique(),  // Agent 认证令牌
  status: text('status').notNull().default('offline'),  // online/offline
  isLocal: integer('is_local').notNull().default(0),  // 1=本机（面板所在机器）
  lastHeartbeat: integer('last_heartbeat'),  // 最后心跳时间戳
  xrayVersion: text('xray_version'),
  os: text('os'),
  arch: text('arch'),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});
