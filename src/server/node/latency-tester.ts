import net from 'net';

export async function testNodeLatency(node: any): Promise<{ success: boolean; latency?: number; error?: string }> {
  const host = node.listen || '127.0.0.1';
  const port = node.port;
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);
    
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
