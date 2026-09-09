import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage, LogMessage, StatusMessage } from '../../shared/types';

interface UseWebSocketOptions {
  onLog?: (log: LogMessage) => void;
  onStatus?: (status: StatusMessage) => void;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { autoConnect = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const onLogRef = useRef(options.onLog);
  const onStatusRef = useRef(options.onStatus);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  onLogRef.current = options.onLog;
  onStatusRef.current = options.onStatus;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        
        if (message.type === 'log') {
          setLogs(prev => [...prev, message]);
          onLogRef.current?.(message);
        } else if (message.type === 'status') {
          setStatus(message);
          onStatusRef.current?.(message);
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connected,
    logs,
    status,
    connect,
    disconnect,
    clearLogs,
  };
}
