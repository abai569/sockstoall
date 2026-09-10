/**
 * 用户存储
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { User } from '../../shared/types.js';
import { hashPassword } from './password.js';

const DATA_DIR = join(process.cwd(), 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export async function getUsers(): Promise<User[]> {
  ensureDataDir();
  if (!existsSync(USERS_FILE)) {
    // 创建默认用户 admin/admin123
    const defaultHash = await hashPassword('admin123');
    const defaultUsers: User[] = [{
      username: 'admin',
      passwordHash: defaultHash,
      createdAt: new Date().toISOString(),
    }];
    writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
  
  const content = readFileSync(USERS_FILE, 'utf-8');
  return JSON.parse(content);
}

async function saveUsers(users: User[]): Promise<void> {
  ensureDataDir();
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export async function getUser(username: string): Promise<User | null> {
  const users = await getUsers();
  return users.find(u => u.username === username) || null;
}

export async function updateUserPassword(username: string, newPasswordHash: string): Promise<boolean> {
  const users = await getUsers();
  const index = users.findIndex(u => u.username === username);
  if (index === -1) return false;
  
  users[index].passwordHash = newPasswordHash;
  await saveUsers(users);
  return true;
}

export async function renameUser(oldUsername: string, newUsername: string): Promise<boolean> {
  const users = await getUsers();
  const index = users.findIndex(u => u.username === oldUsername);
  if (index === -1) return false;
  
  users[index].username = newUsername;
  await saveUsers(users);
  return true;
}
