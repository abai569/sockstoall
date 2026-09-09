/**
 * 节点延迟测试工具
 */

import { spawn } from 'child_process';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const BIN_DIR = join(ROOT_DIR, 'bin');

/**
 * 测试节点延迟（ping）
 * 通过连接节点端口测试延迟
 */
export async function testNodeLatency(node: any): Promise<{ success: boolean; latency?: number; error?: string }> {
  const host = node.listen || '127.0.0.1';
  const port = node.port;
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // 使用 TCP 连接测试
    const net = require('net');
    const socket = new net.Socket();
    
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: '连接超时' });
    }, 5000); // 5 秒超时
    
    socket.connect(port, host, () => {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, latency });
    });
    
    socket.on('error', (err: any) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * 批量测试所有节点延迟
 */
export async function testAllNodesLatency(nodes: any[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  const promises = nodes.map(async (node) => {
    const result = await testNodeLatency(node);
    if (result.success && result.latency !== undefined) {
      results.set(node.id, result.latency);
    }
  });
  
  await Promise.all(promises);
  
  return results;
}
