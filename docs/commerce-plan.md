# SocksToAll 商城系统实现计划

## 概述

为 SocksToAll 添加完整的商城系统，支持套餐订阅、订单管理、支付集成、余额系统和自动续费功能。

## 技术栈

- **数据库**: better-sqlite3 (新增，与现有 JSON 存储并存)
- **ORM**: drizzle-orm (类型安全)
- **支付网关**: 易支付 (YiPay) + USDT (GMPay)
- **定时任务**: node-cron

## 数据库设计

### 新增表

1. **subscription_packages** - 套餐表
   - type: subscription/traffic/balance
   - price: 价格（分）
   - traffic_limit_gb: 流量配额
   - max_rules: 最大规则数
   - speed_limit_mbps: 限速
   - validity_days: 有效期
   - stock: 库存 (-1=无限)

2. **package_groups** - 套餐分组

3. **user_subscriptions** - 用户订阅
   - baseline_*: 应用套餐前的基线值
   - applied_*: 套餐应用后的值
   - expire_at: 过期时间

4. **orders** - 订单表
   - status: 0=待支付，1=已完成，2=已取消，3=已退款
   - pay_currency: BALANCE/USDT/YIPAY

5. **payment_configs** - 支付渠道配置

6. **balance_logs** - 余额变动日志 (HMAC 签名)

### 用户表扩展字段

- balance: 余额（分）
- auto_renew: 自动续费开关
- auto_buy_traffic: 自动购买流量开关
- auto_buy_traffic_package_id: 关联流量套餐
- auto_buy_traffic_threshold: 触发阈值 GB
- renewal_amount: 续费价格

## API 端点

### 套餐管理
```
GET    /api/shop/packages           # 公开套餐列表
GET    /api/shop/packages/:id       # 套餐详情
GET    /api/shop/package-groups     # 分组列表
POST   /api/shop/packages           # 创建套餐 (admin)
PUT    /api/shop/packages/:id       # 更新套餐 (admin)
DELETE /api/shop/packages/:id       # 删除套餐 (admin)
```

### 订单系统
```
POST   /api/shop/orders             # 创建订单
GET    /api/shop/orders             # 我的订单
GET    /api/shop/orders/:id         # 订单详情
POST   /api/shop/orders/:id/cancel  # 取消订单
POST   /api/shop/orders/:id/pay     # 获取支付信息
GET    /api/shop/admin/orders       # 所有订单 (admin)
POST   /api/shop/admin/orders/:id/complete  # 手动完成 (admin)
POST   /api/shop/admin/orders/:id/refund    # 退款 (admin)
```

### 支付系统
```
POST   /api/shop/payment/callback/yipay   # 易支付回调
POST   /api/shop/payment/callback/usdt    # USDT 回调
GET    /api/shop/admin/payment-configs    # 支付配置 (admin)
POST   /api/shop/admin/payment-configs    # 保存配置 (admin)
```

### 余额系统
```
GET    /api/shop/balance            # 查询余额
GET    /api/shop/balance/logs       # 余额日志
POST   /api/shop/admin/users/:id/balance  # 手动充值 (admin)
```

### 自动续费
```
POST   /api/shop/user/toggle-auto-renew        # 切换自动续费
POST   /api/shop/user/toggle-auto-buy-traffic  # 切换自动购买
```

## 核心业务逻辑

### 1. 套餐应用流程
1. 撤销用户现有活跃订阅
2. 捕获当前用户字段作为基线值
3. 计算应用值（取用户值和套餐值的较大者）
4. 创建 user_subscriptions 记录
5. 更新用户字段

### 2. 订单创建流程
- **余额支付**: 立即扣款 → 创建订单 (status=1) → 应用套餐
- **外部支付**: 创建订单 (status=0) → 扣减库存 → 返回支付信息

### 3. 支付回调处理
1. 验证签名
2. 查找订单
3. 验证金额
4. 标记为处理中 (status=4)
5. 交付商品
6. 标记为已完成 (status=1)

### 4. 自动续费（每分钟检查）
- 查找 72 小时内过期的订阅
- 检查用户余额
- 扣款并延长过期时间
- 发送通知

### 5. 自动购买流量（每 10 分钟检查）
- 查找剩余流量低于阈值的用户
- 检查余额
- 扣款并添加流量
- 扣减套餐库存

## 前端页面

### 用户端
- `/shop` - 商城首页（套餐列表、购买流程）
- `/shop/orders` - 我的订单
- `/shop/balance` - 余额查询

### 管理员端
- `/admin/shop/packages` - 套餐管理
- `/admin/shop/orders` - 订单管理
- `/admin/shop/payment` - 支付配置
- `/admin/shop/balance` - 余额管理

## 实现阶段

### 阶段 1: 数据库基础（1 天）
- [ ] 安装 better-sqlite3, drizzle-orm
- [ ] 创建数据库 schema
- [ ] 编写数据库初始化脚本
- [ ] 测试数据库连接

### 阶段 2: 套餐管理（1 天）
- [ ] 套餐 CRUD API
- [ ] 套餐分组 API
- [ ] 前端套餐管理页面
- [ ] 前端商城展示页面

### 阶段 3: 订单系统（2 天）
- [ ] 订单创建 API
- [ ] 订单列表/详情 API
- [ ] 订单状态管理
- [ ] 前端订单页面

### 阶段 4: 支付系统（2 天）
- [ ] 余额支付逻辑
- [ ] 易支付集成
- [ ] USDT 支付集成
- [ ] 支付回调处理
- [ ] 前端支付二维码弹窗

### 阶段 5: 余额系统（1 天）
- [ ] 余额查询/变动 API
- [ ] HMAC 签名机制
- [ ] 前端余额显示
- [ ] 管理员余额管理

### 阶段 6: 自动续费/购买（1 天）
- [ ] 自动续费定时任务
- [ ] 自动购买流量定时任务
- [ ] 用户开关控制
- [ ] 通知机制

### 阶段 7: 前端完善（2 天）
- [ ] 商城页面 UI
- [ ] 订单管理 UI
- [ ] 支付配置 UI
- [ ] 余额管理 UI

**总计**: 约 10 天

## 安全措施

1. **HMAC 签名**: 所有余额变动记录签名
2. **支付回调验证**: MD5/HMAC 签名验证
3. **事务保护**: 余额扣减使用数据库事务
4. **库存控制**: 乐观锁防止超卖
5. **权限控制**: 管理员接口需要 role=0

## 风险点

1. 并发订单可能导致库存超卖 → 使用数据库事务 + 行锁
2. 支付回调可能重复 → 订单状态机防止重复交付
3. 定时任务失败 → 重试机制 + 错误日志
4. 余额不足时的竞态条件 → 事务内检查 + 扣款
