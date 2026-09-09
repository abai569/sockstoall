/**
 * 转发规则存储
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Route, CreateRouteRequest } from '../../shared/types.js';

const DATA_DIR = join(process.cwd(), 'data');
const ROUTES_FILE = join(DATA_DIR, 'routes.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getRoutes(): Route[] {
  ensureDataDir();
  if (!existsSync(ROUTES_FILE)) {
    writeFileSync(ROUTES_FILE, '[]');
    return [];
  }
  
  const content = readFileSync(ROUTES_FILE, 'utf-8');
  return JSON.parse(content);
}

export function saveRoutes(routes: Route[]): void {
  ensureDataDir();
  writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
}

export function getRouteById(id: string): Route | null {
  const routes = getRoutes();
  return routes.find(r => r.id === id) || null;
}

export function createRoute(data: CreateRouteRequest): Route {
  const routes = getRoutes();
  const now = new Date().toISOString();
  
  const newRoute: Route = {
    ...data,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  
  routes.push(newRoute);
  saveRoutes(routes);
  
  return newRoute;
}

export function updateRoute(id: string, data: Partial<CreateRouteRequest>): Route | null {
  const routes = getRoutes();
  const index = routes.findIndex(r => r.id === id);
  
  if (index === -1) return null;
  
  const updated = {
    ...routes[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  
  routes[index] = updated;
  saveRoutes(routes);
  
  return updated;
}

export function deleteRoute(id: string): boolean {
  const routes = getRoutes();
  const filtered = routes.filter(r => r.id !== id);
  
  if (filtered.length === routes.length) {
    return false;
  }
  
  saveRoutes(filtered);
  return true;
}

export function setRouteEnabled(id: string, enabled: boolean): Route | null {
  return updateRoute(id, { enabled });
}
