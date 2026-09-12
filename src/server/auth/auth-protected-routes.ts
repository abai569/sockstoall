import { Hono } from 'hono';
import type { ApiResponse, ChangePasswordRequest, ChangeAccountRequest } from '../../shared/types.js';
import { getUser, updateUserPassword, renameUser } from './user-store.js';
import { comparePassword, hashPassword } from './password.js';
import { getSiteConfig, updateSiteConfig } from './site-config.js';
import { countNodesByUser } from '../node/node-store.js';

export const authProtectedRoutes = new Hono();

authProtectedRoutes.post('/change-password', async (c) => {
  try {
    const username = (c as any).get('username') as string;
    if (!username) {
      return c.json<ApiResponse>({ success: false, error: '未登录' }, 401);
    }
    
    const body = await c.req.json<ChangePasswordRequest>();
    const { oldPassword, newPassword } = body;
    
    if (!oldPassword || !newPassword) {
      return c.json<ApiResponse>({ success: false, error: '请填写完整' }, 400);
    }
    
    if (newPassword.length < 6) {
      return c.json<ApiResponse>({ success: false, error: '新密码至少6位' }, 400);
    }
    
    const user = await getUser(username);
    if (!user) {
      return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
    }
    
    const valid = await comparePassword(oldPassword, user.passwordHash);
    if (!valid) {
      return c.json<ApiResponse>({ success: false, error: '原密码错误' }, 400);
    }
    
    const newHash = await hashPassword(newPassword);
    await updateUserPassword(username, newHash);
    
    return c.json<ApiResponse>({ success: true, data: { message: '密码修改成功' } });
  } catch (error) {
    console.error('Change password error:', error);
    return c.json<ApiResponse>({ success: false, error: '修改密码失败' }, 500);
  }
});

authProtectedRoutes.post('/change-account', async (c) => {
  try {
    const username = (c as any).get('username') as string;
    if (!username) {
      return c.json<ApiResponse>({ success: false, error: '未登录' }, 401);
    }
    
    const body = await c.req.json<ChangeAccountRequest>();
    const { oldPassword, newUsername, newPassword } = body;
    
    if (!oldPassword) {
      return c.json<ApiResponse>({ success: false, error: '请输入当前密码' }, 400);
    }
    
    const user = await getUser(username);
    if (!user) {
      return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
    }
    
    const valid = await comparePassword(oldPassword, user.passwordHash);
    if (!valid) {
      return c.json<ApiResponse>({ success: false, error: '当前密码错误' }, 400);
    }
    
    let changedUsername = username;
    if (newUsername && newUsername.trim() && newUsername.length >= 3) {
      if (await getUser(newUsername)) {
        return c.json<ApiResponse>({ success: false, error: '用户名已存在' }, 400);
      }
      await renameUser(username, newUsername);
      changedUsername = newUsername;
    }
    
    if (newPassword && newPassword.length >= 6) {
      const newHash = await hashPassword(newPassword);
      await updateUserPassword(changedUsername, newHash);
    }
    
    const token = (await import('./jwt.js')).signToken(changedUsername);
    return c.json<ApiResponse>({ success: true, data: { username: changedUsername, token } });
  } catch (error) {
    console.error('Change account error:', error);
    return c.json<ApiResponse>({ success: false, error: '修改失败' }, 500);
  }
});

authProtectedRoutes.get('/me', async (c) => {
  const username = (c as any).get('username') as string;
  if (!username) {
    return c.json<ApiResponse>({ success: false, error: '未登录' }, 401);
  }
  
  const user = await getUser(username);
  if (!user) {
    return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
  }
  
  return c.json<ApiResponse<{ username: string; role: string; maxNodes: number; nodeCount: number }>>({
    success: true,
    data: { username: user.username, role: user.role, maxNodes: user.maxNodes ?? 0, nodeCount: countNodesByUser(user.id) }
  });
});

authProtectedRoutes.get('/site-config', (c) => {
  return c.json<ApiResponse>({ success: true, data: getSiteConfig() });
});

authProtectedRoutes.put('/site-config', async (c) => {
  try {
    const body = await c.req.json<{ title: string }>();
    if (!body.title || !body.title.trim()) {
      return c.json<ApiResponse>({ success: false, error: '标题不能为空' }, 400);
    }
    updateSiteConfig({ title: body.title.trim() });
    return c.json<ApiResponse>({ success: true, data: { title: body.title.trim() } });
  } catch (error) {
    console.error('Update site config error:', error);
    return c.json<ApiResponse>({ success: false, error: '修改失败' }, 500);
  }
});
