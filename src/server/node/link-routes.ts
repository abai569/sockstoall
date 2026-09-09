/**
 * 链接解析路由
 */

import { Hono } from 'hono';
import type { ApiResponse, CreateNodeRequest } from '../../shared/types.js';
import { parseShareLink } from './link-parser.js';

export const linkRoutes = new Hono();

// 解析分享链接
linkRoutes.post('/parse', async (c) => {
  try {
    const { link } = await c.req.json<{ link: string }>();
    
    if (!link) {
      return c.json<ApiResponse>({ success: false, error: '链接不能为空' }, 400);
    }
    
    const result = parseShareLink(link);
    
    if (!result) {
      return c.json<ApiResponse>({ success: false, error: '无法解析链接，请检查格式' }, 400);
    }
    
    return c.json<ApiResponse<{ config: CreateNodeRequest }>>({ 
      success: true, 
      data: { config: result.config } 
    });
  } catch (error) {
    console.error('Parse link error:', error);
    return c.json<ApiResponse>({ success: false, error: '解析失败' }, 500);
  }
});
