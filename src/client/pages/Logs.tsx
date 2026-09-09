import { useRef, useEffect, useState } from 'react';
import { Card, Typography, Switch, Select, Space, Button, Tag } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { useWebSocket } from '../hooks/useWebSocket';

const { Title, Text } = Typography;

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'all';

export default function Logs() {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  const { logs, status, connected, clearLogs } = useWebSocket();

  // 自动滚动
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 过滤日志
  const filteredLogs = filterLevel === 'all' 
    ? logs 
    : logs.filter(log => log.level === filterLevel);

  const levelColors: Record<string, string> = {
    info: 'green',
    warn: 'orange',
    error: 'red',
    debug: 'blue',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>实时日志</Title>
        <Space>
          <Tag color={connected ? 'green' : 'red'}>
            {connected ? '已连接' : '未连接'}
          </Tag>
          {status?.running && (
            <Tag color="blue">Xray 运行中 (PID: {status.pid})</Tag>
          )}
        </Space>
      </div>
      
      <Card 
        title="日志输出"
        extra={
          <Space>
            <Select
              value={filterLevel}
              onChange={setFilterLevel}
              style={{ width: 100 }}
              options={[
                { value: 'all', label: '全部' },
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warn' },
                { value: 'error', label: 'Error' },
                { value: 'debug', label: 'Debug' },
              ]}
            />
            <Switch
              checked={autoScroll}
              onChange={setAutoScroll}
              checkedChildren="自动滚动"
              unCheckedChildren="自动滚动"
            />
            <Button icon={<ClearOutlined />} onClick={clearLogs}>
              清空
            </Button>
          </Space>
        }
      >
        <div 
          ref={logContainerRef}
          className="log-viewer"
          style={{ height: 500 }}
        >
          {filteredLogs.length === 0 ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 20 }}>
              暂无日志，启动 Xray 后将显示实时日志
            </Text>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className={`log-line ${log.level}`}>
                <Tag color={levelColors[log.level]} style={{ marginRight: 8, fontSize: 10 }}>
                  {log.level.toUpperCase()}
                </Tag>
                <span style={{ color: '#888', marginRight: 8 }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
