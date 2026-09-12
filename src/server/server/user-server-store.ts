import { db } from '../db/index.js';
import { userServers } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function getAllowedServerIds(userId: number): number[] {
  return db.query.userServers.findMany({
    where: eq(userServers.userId, userId),
  }).sync().map(r => r.serverId);
}

export function setAllowedServers(userId: number, serverIds: number[]): void {
  db.delete(userServers).where(eq(userServers.userId, userId)).run();
  const now = new Date().toISOString();
  for (const serverId of serverIds) {
    db.insert(userServers).values({ userId, serverId, createdAt: now }).run();
  }
}

export function countUsersForServer(serverId: number): number {
  return db.query.userServers.findMany({
    where: eq(userServers.serverId, serverId),
  }).sync().length;
}
