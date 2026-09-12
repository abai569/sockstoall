import { Hono } from 'hono';
import type { LoginRequest, LoginResponse, ApiResponse } from '../../shared/types.js';
import { signToken } from './jwt.js';
import { getUser, createUser } from './user-store.js';
import { comparePassword, hashPassword } from './password.js';

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
    
    if (user.status === 0) {
      return c.json<ApiResponse>({ success: false, error: '账号已被禁用' }, 403);
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

authRoutes.post('/register', async (c) => {
  try {
    const body = await c.req.json<{ username: string; password: string }>();
    const { username, password } = body;
    
    if (!username || !password) {
      return c.json<ApiResponse>({ success: false, error: '用户名和密码不能为空' }, 400);
    }
    
    if (username.length < 3) {
      return c.json<ApiResponse>({ success: false, error: '用户名至少 3 个字符' }, 400);
    }
    
    if (password.length < 6) {
      return c.json<ApiResponse>({ success: false, error: '密码至少 6 个字符' }, 400);
    }
    
    const existing = await getUser(username);
    if (existing) {
      return c.json<ApiResponse>({ success: false, error: '用户名已存在' }, 409);
    }
    
    const passwordHash = await hashPassword(password);
    const user = await createUser(username, passwordHash, 'user');
    
    if (!user) {
      return c.json<ApiResponse>({ success: false, error: '注册失败' }, 500);
    }
    
    const token = signToken(username);
    return c.json<ApiResponse<LoginResponse>>({ 
      success: true, 
      data: { token, username } 
    });
  } catch (error) {
    console.error('Register error:', error);
    return c.json<ApiResponse>({ success: false, error: '注册失败' }, 500);
  }
});
