import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema.js';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'sockstoall.db');

// 确保 data 目录存在
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// 创建数据库连接
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// 初始化数据库表
export function initDatabase() {
  console.log('Initializing database...');
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS subscription_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'subscription',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price INTEGER DEFAULT 0,
      validity_days INTEGER DEFAULT 0,
      traffic_limit_gb REAL DEFAULT 0,
      max_rules INTEGER DEFAULT 0,
      speed_limit_mbps INTEGER DEFAULT 0,
      max_connections INTEGER DEFAULT 0,
      max_ip_access INTEGER DEFAULT 0,
      auto_renew INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      shop_visible INTEGER DEFAULT 1,
      auto_buy_traffic_enabled INTEGER DEFAULT 0,
      stock INTEGER DEFAULT -1,
      recommended INTEGER DEFAULT 0,
      group_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS package_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#1890ff',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      package_id INTEGER NOT NULL,
      start_at INTEGER NOT NULL,
      expire_at INTEGER NOT NULL,
      auto_renew INTEGER DEFAULT 0,
      renewal_validity_days INTEGER DEFAULT 0,
      renewal_amount INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      order_id INTEGER,
      baseline_flow REAL DEFAULT 0,
      baseline_max_rules INTEGER DEFAULT 0,
      baseline_expire_at INTEGER DEFAULT 0,
      baseline_speed_limit INTEGER DEFAULT 0,
      baseline_max_connections INTEGER DEFAULT 0,
      baseline_max_ip_access INTEGER DEFAULT 0,
      applied_flow REAL DEFAULT 0,
      applied_max_rules INTEGER DEFAULT 0,
      applied_expire_at INTEGER DEFAULT 0,
      applied_speed_limit INTEGER DEFAULT 0,
      applied_max_connections INTEGER DEFAULT 0,
      applied_max_ip_access INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (package_id) REFERENCES subscription_packages(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      package_id INTEGER NOT NULL,
      package_name TEXT,
      package_type TEXT DEFAULT 'subscription',
      package_meta TEXT,
      amount INTEGER NOT NULL,
      pay_currency TEXT DEFAULT 'BALANCE',
      status INTEGER DEFAULT 0,
      pay_time INTEGER,
      refund_time INTEGER,
      pay_url TEXT,
      pay_address TEXT,
      pay_amount TEXT,
      pay_token TEXT,
      qr_content TEXT,
      qr_image_url TEXT,
      pay_expires_at INTEGER,
      pay_return_url TEXT,
      tx_hash TEXT,
      pay_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL UNIQUE,
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS balance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      amount INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT,
      signature TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 扩展 users 表
    ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN auto_renew INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN auto_buy_traffic INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN auto_buy_traffic_package_id INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN auto_buy_traffic_threshold REAL DEFAULT 10;
    ALTER TABLE users ADD COLUMN renewal_amount INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN base_flow REAL DEFAULT 0;
    ALTER TABLE users ADD COLUMN traffic_flow REAL DEFAULT 0;
  `);
  
  console.log('Database initialized successfully');
}

export { sqlite };
