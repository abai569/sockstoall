import { Hono } from 'hono';
import type { ApiResponse, ChangePasswordRequest } from '../../shared/types.js';
import { getUser, updateUserPassword } from './user-store.js';
import { comparePassword, hashPassword } from './password.js';

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

authProtectedRoutes.get('/me', async (c) => {
  const username = (c as any).get('username') as string;
  if (!username) {
    return c.json<ApiResponse>({ success: false, error: '未登录' }, 401);
  }
  
  const user = await getUser(username);
  if (!user) {
    return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
  }
  
  return c.json<ApiResponse<{ username: string }>>({ 
    success: true, 
    data: { username: user.username } 
  });
});
