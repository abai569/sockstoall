import { Hono } from 'hono';
import type { LoginRequest, LoginResponse, ApiResponse } from '../../shared/types.js';
import { signToken } from './jwt.js';
import { getUser } from './user-store.js';
import { comparePassword } from './password.js';

export const authRoutes = new Hono();

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
