/**
 * 用户存储 - 基于 SQLite users 表
 */

import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { User } from '../../shared/types.js';

function toUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role || 'user',
    createdAt: row.createdAt || '',
  };
}

export async function getUsers(): Promise<User[]> {
  return db.query.users.findMany().sync().map(toUser);
}

export async function getUser(username: string): Promise<User | null> {
  const row = db.query.users.findFirst({
    where: eq(users.username, username),
  }).sync();
  return row ? toUser(row) : null;
}

export async function getUserById(id: number): Promise<User | null> {
  const row = db.query.users.findFirst({
    where: eq(users.id, id),
  }).sync();
  return row ? toUser(row) : null;
}

export async function createUser(username: string, passwordHash: string, role = 'user'): Promise<User | null> {
  const now = new Date().toISOString();
  const result = db.insert(users).values({
    username,
    passwordHash,
    role,
    createdAt: now,
    updatedAt: now,
  }).run();

  return getUserById(result.lastInsertRowid as number);
}

export async function updateUserPassword(username: string, newPasswordHash: string): Promise<boolean> {
  const result = db.update(users)
    .set({ passwordHash: newPasswordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.username, username))
    .run();
  return result.changes > 0;
}

export async function renameUser(oldUsername: string, newUsername: string): Promise<boolean> {
  const result = db.update(users)
    .set({ username: newUsername, updatedAt: new Date().toISOString() })
    .where(eq(users.username, oldUsername))
    .run();
  return result.changes > 0;
}
