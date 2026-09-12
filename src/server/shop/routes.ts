import { Hono } from 'hono';
import { db } from '../db/index.js';
import { subscriptionPackages, packageGroups } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const shopRoutes = new Hono();

// ==================== 公开接口 ====================

// 获取套餐列表（仅显示 enabled + shop_visible）
shopRoutes.get('/packages', (c) => {
  const packages = db.query.subscriptionPackages.findMany({
    where: and(
      eq(subscriptionPackages.enabled, 1),
      eq(subscriptionPackages.shopVisible, 1)
    ),
    orderBy: [subscriptionPackages.sortOrder, subscriptionPackages.id],
  }).sync();
  
  return c.json({ success: true, data: packages });
});

// 获取套餐详情
shopRoutes.get('/packages/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const pkg = db.query.subscriptionPackages.findFirst({
    where: eq(subscriptionPackages.id, id),
  }).sync();
  
  if (!pkg) {
    return c.json({ success: false, error: '套餐不存在' }, 404);
  }
  
  return c.json({ success: true, data: pkg });
});

// 获取套餐分组列表
shopRoutes.get('/package-groups', (c) => {
  const groups = db.query.packageGroups.findMany({
    orderBy: [packageGroups.sortOrder, packageGroups.id],
  }).sync();
  
  return c.json({ success: true, data: groups });
});

// ==================== 管理员接口 ====================

// 套餐列表（管理员，含下架）
shopRoutes.get('/admin/packages', (c) => {
  const packages = db.query.subscriptionPackages.findMany({
    orderBy: [subscriptionPackages.sortOrder, subscriptionPackages.id],
  }).sync();
  return c.json({ success: true, data: packages });
});

// 创建套餐
shopRoutes.post('/admin/packages', async (c) => {
  try {
    const body = await c.req.json();
    const now = new Date().toISOString();
    
    const result = db.insert(subscriptionPackages).values({
      ...body,
      createdAt: now,
      updatedAt: now,
    }).run();
    
    return c.json({ success: true, data: { id: result.lastInsertRowid } }, 201);
  } catch (error: any) {
    console.error('Create package error:', error);
    return c.json({ success: false, error: '创建套餐失败' }, 500);
  }
});

// 更新套餐
shopRoutes.put('/admin/packages/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    
    const result = db.update(subscriptionPackages)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(subscriptionPackages.id, id))
      .run();
    
    if (result.changes === 0) {
      return c.json({ success: false, error: '套餐不存在' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Update package error:', error);
    return c.json({ success: false, error: '更新套餐失败' }, 500);
  }
});

// 删除套餐
shopRoutes.delete('/admin/packages/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const result = db.delete(subscriptionPackages)
    .where(eq(subscriptionPackages.id, id))
    .run();
  
  if (result.changes === 0) {
    return c.json({ success: false, error: '套餐不存在' }, 404);
  }
  
  return c.json({ success: true });
});

// 分组列表（管理员）
shopRoutes.get('/admin/package-groups', (c) => {
  const groups = db.query.packageGroups.findMany({
    orderBy: [packageGroups.sortOrder, packageGroups.id],
  }).sync();
  return c.json({ success: true, data: groups });
});

// 创建套餐分组
shopRoutes.post('/admin/package-groups', async (c) => {
  try {
    const body = await c.req.json();
    const now = new Date().toISOString();
    
    const result = db.insert(packageGroups).values({
      ...body,
      createdAt: now,
      updatedAt: now,
    }).run();
    
    return c.json({ success: true, data: { id: result.lastInsertRowid } }, 201);
  } catch (error: any) {
    console.error('Create package group error:', error);
    return c.json({ success: false, error: '创建分组失败' }, 500);
  }
});

// 更新套餐分组
shopRoutes.put('/admin/package-groups/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    
    const result = db.update(packageGroups)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(packageGroups.id, id))
      .run();
    
    if (result.changes === 0) {
      return c.json({ success: false, error: '分组不存在' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Update package group error:', error);
    return c.json({ success: false, error: '更新分组失败' }, 500);
  }
});

// 删除套餐分组
shopRoutes.delete('/admin/package-groups/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const result = db.delete(packageGroups)
    .where(eq(packageGroups.id, id))
    .run();
  
  if (result.changes === 0) {
    return c.json({ success: false, error: '分组不存在' }, 404);
  }
  
  return c.json({ success: true });
});
