/**
 * 节点路由
 */

import { Hono } from 'hono';
import type { Node, CreateNodeRequest, ApiResponse, ListResponse } from '../../shared/types.js';
import { getNodes, getNodeById, createNode, updateNode, deleteNode } from './node-store.js';
import { generateShareLink } from './link-generator.js';
import { testNodeLatency } from './latency-tester.js';

export const nodeRoutes = new Hono();

// 获取所有节点
nodeRoutes.get('/', (c) => {
  const nodes = getNodes();
  // 为每个节点添加分享链接
  const nodesWithLinks = nodes.map(node => ({
    ...node,
    shareLink: generateShareLink(node)
  }));
  const response: ListResponse<any> = { items: nodesWithLinks, total: nodesWithLinks.length };
  return c.json<ApiResponse<ListResponse<any>>>({ success: true, data: response });
});

// 获取单个节点
nodeRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const node = getNodeById(id);
  
  if (!node) {
    return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
  }
  
  // 添加分享链接
  const nodeWithLink = {
    ...node,
    shareLink: generateShareLink(node)
  };
  
  return c.json<ApiResponse<any>>({ success: true, data: nodeWithLink });
});

// 创建节点
nodeRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateNodeRequest>();
    
    // 基本验证
    if (!body.name || !body.protocol) {
      return c.json<ApiResponse>({ success: false, error: '缺少必要字段' }, 400);
    }
    
    // 端口验证（如果提供了的话）
    if (body.port && (body.port < 1 || body.port > 65535)) {
      return c.json<ApiResponse>({ success: false, error: '端口范围 1-65535' }, 400);
    }
    
    const node = createNode(body);
    
    // 返回带分享链接的节点
    const nodeWithLink = {
      ...node,
      shareLink: generateShareLink(node)
    };
    
    return c.json<ApiResponse<any>>({ success: true, data: nodeWithLink }, 201);
  } catch (error) {
    console.error('Create node error:', error);
    return c.json<ApiResponse>({ success: false, error: '创建节点失败' }, 500);
  }
});

// 更新节点
nodeRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<CreateNodeRequest>>();
    
    const node = updateNode(id, body);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    
    // 返回带分享链接的节点
    const nodeWithLink = {
      ...node,
      shareLink: generateShareLink(node)
    };
    
    return c.json<ApiResponse<any>>({ success: true, data: nodeWithLink });
  } catch (error) {
    console.error('Update node error:', error);
    return c.json<ApiResponse>({ success: false, error: '更新节点失败' }, 500);
  }
});

// 删除节点
nodeRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  const success = deleteNode(id);
  
  if (!success) {
    return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
  }
  
  return c.json<ApiResponse>({ success: true });
});

// 测试节点延迟
nodeRoutes.post('/:id/test-latency', async (c) => {
  try {
    const id = c.req.param('id');
    const node = getNodeById(id);
    
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    
    const result = await testNodeLatency(node);
    
    return c.json<ApiResponse<any>>({ success: true, data: result });
  } catch (error) {
    console.error('Test latency error:', error);
    return c.json<ApiResponse>({ success: false, error: '测试失败' }, 500);
  }
});
