import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Space, Typography, Spin, Alert } from 'antd';
import { 
  NodeIndexOutlined, 
  SwapOutlined, 
  CheckCircleOutlined, 
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { nodeApi, routeApi, xrayApi } from '../api/client';

const { Title } = Typography;

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [routeCount, setRouteCount] = useState(0);
  const [enabledRoutes, setEnabledRoutes] = useState(0);
  const [runningInstances, setRunningInstances] = useState(0);
  const [xrayStatus, setXrayStatus] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nodesRes, routesRes, xrayRes] = await Promise.all([
        nodeApi.list(),
        routeApi.list(),
        xrayApi.status(),
      ]);
      
      setNodeCount(nodesRes.data.data?.total || 0);
      
      const routes = routesRes.data.data?.items || [];
      setRouteCount(routes.length);
      setEnabledRoutes(routes.filter((r: any) => r.enabled).length);
      
      const xrayData = xrayRes.data.data;
      setXrayStatus(xrayData);
      setRunningInstances(xrayData?.instanceCount || 0);
    } catch (error) {
      console.error('Load dashboard data error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>系统总览</Title>
      
      {/* Xray 状态卡片 */}
      <Card 
        title="Xray 状态" 
        style={{ marginBottom: 24 }}
        extra={
          xrayStatus?.installed ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已安装</Tag>
          ) : (
            <Tag color="error">未安装</Tag>
          )
        }
      >
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="状态"
              value={xrayStatus?.running ? '运行中' : '已停止'}
              valueStyle={{ color: xrayStatus?.running ? '#52c41a' : '#8c8c8c' }}
              prefix={xrayStatus?.running ? <ThunderboltOutlined /> : null}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="运行实例"
              value={runningInstances}
              suffix="个"
              valueStyle={{ color: runningInstances > 0 ? '#1890ff' : '#8c8c8c' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="版本"
              value={xrayStatus?.version || '未检测到'}
              valueStyle={{ fontSize: 16 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="路径"
              value={xrayStatus?.path ? '已配置' : '未配置'}
              valueStyle={{ fontSize: 16, color: xrayStatus?.path ? '#52c41a' : '#faad14' }}
            />
          </Col>
        </Row>
      </Card>
      
      {/* Xray 未安装警告 */}
      {xrayStatus && !xrayStatus.installed && (
        <Alert
          message="Xray 未安装"
          description="请先安装 Xray-core 才能使用代理功能。请将 xray 可执行文件放到 bin/ 目录。"
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/nodes')}>
            <Statistic
              title="节点数量"
              value={nodeCount}
              prefix={<NodeIndexOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/routes')}>
            <Statistic
              title="转发规则"
              value={routeCount}
              prefix={<SwapOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已启用规则"
              value={enabledRoutes}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="运行实例"
              value={runningInstances}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: runningInstances > 0 ? '#52c41a' : '#8c8c8c' }}
              suffix={runningInstances > 0 ? '个' : ''}
            />
          </Card>
        </Col>
      </Row>
      
      {/* 快捷操作 */}
      <Card title="快捷操作" style={{ marginTop: 24 }}>
        <Space wrap>
          <Tag color="blue" style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => navigate('/nodes/new')}>
            创建节点
          </Tag>
          <Tag color="purple" style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => navigate('/routes/new')}>
            创建规则
          </Tag>
          <Tag color="cyan" style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => navigate('/logs')}>
            查看日志
          </Tag>
        </Space>
      </Card>
    </div>
  );
}
