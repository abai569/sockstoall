/**
 * 认证路由
 */

import { Hono } from 'hono';
import type { LoginRequest, LoginResponse, ChangePasswordRequest, ApiResponse } from '../../shared/types.js';
import { signToken } from './jwt.js';
import { getUser, updateUserPassword } from './user-store.js';
import { comparePassword, hashPassword } from './password.js';

export const authRoutes = new Hono();

// 登录
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json<LoginRequest>();
    const { username, password } = body;
    
    if (!username || !password) {
      return c.json<ApiResponse>({ success: false, error: '用户名和密码不能为空' }, 400);
    }
    
    const user = await getUser(username);
    if (!user) {
      return c.json<ApiResponse>({ success: false, error: '用户名或密码错误' }, 401);
    }
    
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return c.json<ApiResponse>({ success: false, error: '用户名或密码错误' }, 401);
    }
    
    const token = signToken(username);
    const response: LoginResponse = { token, username };
    
    return c.json<ApiResponse<LoginResponse>>({ success: true, data: response });
  } catch (error) {
    console.error('Login error:', error);
    return c.json<ApiResponse>({ success: false, error: '登录失败' }, 500);
  }
});

// 修改密码
authRoutes.post('/change-password', async (c) => {
  try {
    // 从 context 获取用户信息 (由中间件设置)
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

// 获取当前用户信息
authRoutes.get('/me', async (c) => {
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
