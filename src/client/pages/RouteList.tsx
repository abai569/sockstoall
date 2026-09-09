import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Popconfirm, Switch, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { routeApi, nodeApi, xrayApi } from '../api/client';
import type { Route, Node } from '../../shared/types';

const { Title } = Typography;

interface RunningInstance {
  routeId: string;
  pid: number;
  uptime: number;
}

export default function RouteList() {
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [nodes, setNodes] = useState<Map<string, Node>>(new Map());
  const [runningInstances, setRunningInstances] = useState<RunningInstance[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, nodesRes, xrayRes] = await Promise.all([
        routeApi.list(),
        nodeApi.list(),
        xrayApi.status(),
      ]);
      
      const routeItems = routesRes.data.data?.items || [];
      setRoutes(routeItems);
      
      const nodeMap = new Map<string, Node>();
      (nodesRes.data.data?.items || []).forEach((n: Node) => nodeMap.set(n.id, n));
      setNodes(nodeMap);
      
      const xrayStatus = xrayRes.data.data;
      setRunningInstances(xrayStatus?.runningInstances || []);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    // 检查是否正在运行
    if (isRouteRunning(id)) {
      message.error('请先停止该规则再删除');
      return;
    }
    
    try {
      await routeApi.delete(id);
      message.success('删除成功');
      loadData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await routeApi.toggle(id, enabled);
      message.success(enabled ? '已启用' : '已禁用');
      loadData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleStart = async (routeId: string) => {
    try {
      await xrayApi.start(routeId);
      message.success('启动成功');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '启动失败');
    }
  };

  const handleStop = async (routeId: string) => {
    try {
      await xrayApi.stop(routeId);
      message.success('已停止');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '停止失败');
    }
  };

  const handleStopAll = async () => {
    try {
      await xrayApi.stopAll();
      message.success('已停止所有实例');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '停止失败');
    }
  };

  const isRouteRunning = (routeId: string): boolean => {
    return runningInstances.some(inst => inst.routeId === routeId);
  };

  const getRouteInstance = (routeId: string): RunningInstance | undefined => {
    return runningInstances.find(inst => inst.routeId === routeId);
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    }
    if (minutes > 0) {
      return `${minutes}分钟${secs}秒`;
    }
    return `${secs}秒`;
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '入站节点',
      dataIndex: 'nodeId',
      key: 'nodeId',
      render: (nodeId: string) => {
        const node = nodes.get(nodeId);
        return node ? (
          <Space>
            <span>{node.name}</span>
            <Tag>{node.protocol}</Tag>
            <Tag color="blue">:{node.port}</Tag>
          </Space>
        ) : (
          <Tag color="red">节点已删除</Tag>
        );
      },
    },
    {
      title: '出站 SOCKS',
      key: 'outbound',
      render: (_: any, record: Route) => (
        <span>{record.outbound.address}:{record.outbound.port}</span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: Route) => {
        const running = isRouteRunning(record.id);
        const instance = getRouteInstance(record.id);
        
        return (
          <Space>
            <Switch 
              checked={record.enabled} 
              onChange={(v) => handleToggle(record.id, v)}
              checkedChildren="启用"
              unCheckedChildren="禁用"
            />
            {running && (
              <Tag color="green" icon={<PlayCircleOutlined />}>
                运行中 {instance && `(${formatUptime(instance.uptime)})`}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Route) => {
        const running = isRouteRunning(record.id);
        
        return (
          <Space>
            {running ? (
              <Button 
                type="link" 
                icon={<PauseCircleOutlined />} 
                onClick={() => handleStop(record.id)}
                danger
              >
                停止
              </Button>
            ) : (
              record.enabled && (
                <Button 
                  type="link" 
                  icon={<PlayCircleOutlined />} 
                  onClick={() => handleStart(record.id)}
                  style={{ color: '#52c41a' }}
                >
                  启动
                </Button>
              )
            )}
            <Button 
              type="link" 
              icon={<EditOutlined />} 
              onClick={() => navigate(`/routes/${record.id}/edit`)}
              disabled={running}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此规则？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />} disabled={running}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>转发规则</Title>
        <Space>
          {runningInstances.length > 0 && (
            <Button danger icon={<PauseCircleOutlined />} onClick={handleStopAll}>
              停止全部 ({runningInstances.length})
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/routes/new')}>
            创建规则
          </Button>
        </Space>
      </div>
      
      {runningInstances.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
          <Space>
            <PlayCircleOutlined style={{ color: '#52c41a' }} />
            <span>正在运行 {runningInstances.length} 个转发实例</span>
          </Space>
        </div>
      )}
      
      <Table
        loading={loading}
        columns={columns}
        dataSource={routes}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}
