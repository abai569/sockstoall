/**
 * 节点存储
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Node, CreateNodeRequest } from '../../shared/types.js';

const DATA_DIR = join(process.cwd(), 'data');
const NODES_FILE = join(DATA_DIR, 'nodes.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getNodes(): Node[] {
  ensureDataDir();
  if (!existsSync(NODES_FILE)) {
    writeFileSync(NODES_FILE, '[]');
    return [];
  }
  
  const content = readFileSync(NODES_FILE, 'utf-8');
  const nodes = JSON.parse(content) as Node[];
  let migrated = false;
  for (const node of nodes) {
    if (node.serverId === undefined || node.serverId === null) {
      node.serverId = 1;
      migrated = true;
    }
    if (node.userId === undefined || node.userId === null) {
      node.userId = 1;
      migrated = true;
    }
  }
  if (migrated) saveNodes(nodes);
  return nodes;
}

export function countNodesByUser(userId: number): number {
  return getNodes().filter(n => (n.userId ?? 1) === userId).length;
}

export function getNodesByUser(userId: number): Node[] {
  return getNodes().filter(n => (n.userId ?? 1) === userId);
}

export function addNodeTraffic(id: string, up: number, down: number): void {
  const nodes = getNodes();
  const index = nodes.findIndex(n => n.id === id);
  if (index === -1) return;
  nodes[index].uplinkBytes = (nodes[index].uplinkBytes || 0) + up;
  nodes[index].downlinkBytes = (nodes[index].downlinkBytes || 0) + down;
  saveNodes(nodes);
}

export function resetUserNodesTraffic(userId: number): void {
  const nodes = getNodes();
  let changed = false;
  for (const node of nodes) {
    if ((node.userId ?? 1) === userId) {
      node.uplinkBytes = 0;
      node.downlinkBytes = 0;
      changed = true;
    }
  }
  if (changed) saveNodes(nodes);
}

export function suspendUserNodes(userId: number): number {
  const nodes = getNodes();
  let count = 0;
  for (const node of nodes) {
    if ((node.userId ?? 1) === userId && node.enabled) {
      node.enabled = false;
      node.suspended = true;
      count++;
    }
  }
  if (count > 0) saveNodes(nodes);
  return count;
}

export function resumeUserNodes(userId: number): number {
  const nodes = getNodes();
  let count = 0;
  for (const node of nodes) {
    if ((node.userId ?? 1) === userId && node.suspended) {
      node.enabled = true;
      node.suspended = false;
      count++;
    }
  }
  if (count > 0) saveNodes(nodes);
  return count;
}

export function saveNodes(nodes: Node[]): void {
  ensureDataDir();
  writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2));
}

export function getNodeById(id: string): Node | null {
  const nodes = getNodes();
  return nodes.find(n => n.id === id) || null;
}

export function createNode(data: CreateNodeRequest): Node {
  const nodes = getNodes();
  const now = new Date().toISOString();
  
  const newNode: Node = {
    ...data,
    id: randomUUID(),
    enabled: true, // 默认启用
    createdAt: now,
    updatedAt: now,
  } as Node;
  
  nodes.push(newNode);
  saveNodes(nodes);
  
  return newNode;
}

export function setNodeEnabled(id: string, enabled: boolean): Node | null {
  const nodes = getNodes();
  const index = nodes.findIndex(n => n.id === id);
  
  if (index === -1) return null;
  
  nodes[index] = {
    ...nodes[index],
    enabled,
    updatedAt: new Date().toISOString(),
  };
  
  saveNodes(nodes);
  return nodes[index];
}

export function updateNode(id: string, data: Partial<CreateNodeRequest>): Node | null {
  const nodes = getNodes();
  const index = nodes.findIndex(n => n.id === id);
  
  if (index === -1) return null;
  
  const updated = {
    ...nodes[index],
    ...data,
    ...(data.config ? { config: { ...nodes[index].config, ...data.config } } : {}),
    updatedAt: new Date().toISOString(),
  } as Node;
  
  nodes[index] = updated;
  saveNodes(nodes);
  
  return updated;
}

export function deleteNode(id: string): boolean {
  const nodes = getNodes();
  const filtered = nodes.filter(n => n.id !== id);
  
  if (filtered.length === nodes.length) {
    return false;
  }
  
  saveNodes(filtered);
  return true;
}
