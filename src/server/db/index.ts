import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import * as schema from './schema.js';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'sockstoall.db');
const USERS_FILE = join(DATA_DIR, 'users.json');

// 确保 data 目录存在
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// 创建数据库连接
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

function hasColumn(table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some(row => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// 初始化数据库表
export function initDatabase() {
  console.log('Initializing database...');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      balance INTEGER DEFAULT 0,
      traffic_flow REAL DEFAULT 0,
      total_flow_gb REAL DEFAULT 0,
      used_flow_gb REAL DEFAULT 0,
      max_rules INTEGER DEFAULT 0,
      expired_at INTEGER DEFAULT 0,
      speed_limit_mbps INTEGER DEFAULT 0,
      max_connections INTEGER DEFAULT 0,
      max_ip_access INTEGER DEFAULT 0,
      auto_renew INTEGER DEFAULT 0,
      auto_buy_traffic INTEGER DEFAULT 0,
      auto_buy_traffic_package_id INTEGER DEFAULT 0,
      auto_buy_traffic_threshold REAL DEFAULT 10,
      renewal_amount INTEGER DEFAULT 0,
      base_flow REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscription_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'subscription',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price INTEGER DEFAULT 0,
      validity_days INTEGER DEFAULT 0,
      traffic_limit_gb REAL DEFAULT 0,
      max_nodes INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      agent_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'offline',
      is_local INTEGER NOT NULL DEFAULT 0,
      last_heartbeat INTEGER,
      xray_version TEXT,
      os TEXT,
      arch TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      server_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 兼容旧数据库：补齐后续新增的字段
  addColumnIfMissing('users', 'balance', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'auto_renew', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'auto_buy_traffic', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'auto_buy_traffic_package_id', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'auto_buy_traffic_threshold', 'REAL DEFAULT 10');
  addColumnIfMissing('users', 'renewal_amount', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'base_flow', 'REAL DEFAULT 0');
  addColumnIfMissing('users', 'traffic_flow', 'REAL DEFAULT 0');
  addColumnIfMissing('users', 'total_flow_gb', 'REAL DEFAULT 0');
  addColumnIfMissing('users', 'used_flow_gb', 'REAL DEFAULT 0');
  addColumnIfMissing('users', 'max_rules', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'expired_at', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'speed_limit_mbps', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'max_connections', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'max_ip_access', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'role', "TEXT NOT NULL DEFAULT 'user'");
  addColumnIfMissing('users', 'status', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('users', 'traffic_limit_gb', 'REAL DEFAULT 0');
  addColumnIfMissing('users', 'max_nodes', 'INTEGER DEFAULT 0');
  addColumnIfMissing('servers', 'is_local', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('subscription_packages', 'max_nodes', 'INTEGER DEFAULT 0');

  seedUsers();
  seedLocalServer();

  console.log('Database initialized successfully');
}

function seedLocalServer(): void {
  const local = sqlite.prepare('SELECT id FROM servers WHERE is_local = 1 LIMIT 1').get() as { id: number } | undefined;
  if (local) {
    sqlite.prepare("UPDATE servers SET status = 'online', last_heartbeat = ?, updated_at = ? WHERE id = ?")
      .run(Date.now(), new Date().toISOString(), local.id);
    return;
  }

  const now = new Date().toISOString();
  const existing = sqlite.prepare('SELECT id FROM servers WHERE id = 1').get() as { id: number } | undefined;
  if (existing) {
    sqlite.prepare("UPDATE servers SET is_local = 1, name = '本机', status = 'online', last_heartbeat = ?, updated_at = ? WHERE id = 1")
      .run(Date.now(), now);
  } else {
    const token = randomUUID().replace(/-/g, '');
    sqlite.prepare(
      "INSERT INTO servers (id, name, address, agent_token, status, is_local, last_heartbeat, created_at, updated_at) VALUES (1, '本机', 'localhost', ?, 'online', 1, ?, ?, ?)"
    ).run(token, Date.now(), now, now);
  }
  console.log('Initialized local server (id=1)');
}

function seedUsers(): void {
  const row = sqlite.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };

  // 管理员默认不限制节点数（-1 表示无限制）
  sqlite.prepare("UPDATE users SET max_nodes = -1 WHERE role = 'admin' AND max_nodes = 5").run();

  if (row.count > 0) return;

  const now = new Date().toISOString();
  const insert = sqlite.prepare(
    'INSERT INTO users (username, password_hash, role, max_nodes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  if (existsSync(USERS_FILE)) {
    try {
      const legacy = JSON.parse(readFileSync(USERS_FILE, 'utf-8')) as Array<{ username: string; passwordHash: string; createdAt?: string }>;
      for (const item of legacy) {
        const isAdmin = item.username === 'admin';
        insert.run(item.username, item.passwordHash, isAdmin ? 'admin' : 'user', isAdmin ? -1 : 0, item.createdAt || now, now);
      }
      console.log(`Migrated ${legacy.length} user(s) from users.json`);
      return;
    } catch (error) {
      console.error('Failed to migrate users.json, falling back to default admin:', error);
    }
  }

  const defaultHash = bcrypt.hashSync('admin123', 10);
  insert.run('admin', defaultHash, 'admin', -1, now, now);
  console.log('Created default user admin/admin123');
}

export { sqlite };
