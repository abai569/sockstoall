import { Hono } from 'hono';
import { shopRoutes as packageRoutes } from './routes.js';
import { orderRoutes } from './order-routes.js';
import { paymentRoutes } from './payment-routes.js';
import { balanceRoutes } from './balance-routes.js';

export const shopRoutes = new Hono();

// 套餐管理
shopRoutes.route('/', packageRoutes);

// 订单系统
shopRoutes.route('/', orderRoutes);

// 支付系统
shopRoutes.route('/', paymentRoutes);

// 余额系统
shopRoutes.route('/', balanceRoutes);
