import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Space, Typography, Spin, Alert, Button, message } from 'antd';
import { 
  NodeIndexOutlined, SwapOutlined, CheckCircleOutlined, 
  ThunderboltOutlined, PlayCircleOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { nodeApi, routeApi, xrayApi } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const { Title } = Typography;

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [routeCount, setRouteCount] = useState(0);
  const [enabledRoutes, setEnabledRoutes] = useState(0);
  const [xrayStatus, setXrayStatus] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [xrayUpdate, setXrayUpdate] = useState<any>(null);
  const navigate = useNavigate();
  const { username } = useAuth();

  const loadData = async () => {
    setLoading(true);
    try {
      const [nodesRes, routesRes, xrayRes] = await Promise.all([
        nodeApi.list(), routeApi.list(), xrayApi.status(),
      ]);
      setNodeCount(nodesRes.data.data?.total || 0);
      const routes = routesRes.data.data?.items || [];
      setRouteCount(routes.length);
      setEnabledRoutes(routes.filter((r: any) => r.enabled).length);
      setXrayStatus(xrayRes.data.data);
      if (username === 'admin') {
        const updateRes = await xrayApi.checkUpdate();
        setXrayUpdate(updateRes.data.data);
      }
    } catch (error) {
      console.error('Load dashboard data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleXrayUpdate = async () => {
    setUpdateLoading(true);
    try {
      await xrayApi.update();
      message.success('Xray 升级成功');
      await loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Xray 升级失败');
    } finally {
      setUpdateLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleXrayAction = async (action: 'start' | 'stop') => {
    setActionLoading(true);
    try {
      if (action === 'start') {
        await xrayApi.start();
        message.success('Xray 服务已启动');
      } else {
        await xrayApi.stop();
        message.success('Xray 服务已停止');
      }
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}小时${m}分钟`;
    if (m > 0) return `${m}分钟${s}秒`;
    return `${s}秒`;
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>系统总览</Title>
      
      <Card 
        title="Xray 服务" 
        style={{ marginBottom: 24 }}
        extra={
          xrayStatus?.installed ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已安装 {xrayStatus.version}</Tag>
          ) : (
            <Tag color="error">未安装</Tag>
          )
        }
      >
        {xrayStatus && !xrayStatus.installed && (
          <Alert
            message="Xray 未安装"
            description="请将 xray 可执行文件放到 bin/ 目录，或从 https://github.com/XTLS/Xray-core/releases 下载"
            type="warning" showIcon style={{ marginBottom: 16 }}
          />
        )}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="服务状态"
              value={xrayStatus?.running ? '运行中' : '已停止'}
              valueStyle={{ color: xrayStatus?.running ? '#52c41a' : '#8c8c8c' }}
              prefix={xrayStatus?.running ? <ThunderboltOutlined /> : null}
            />
          </Col>
          <Col span={6}>
            <Statistic title="运行时长" value={xrayStatus?.running ? formatUptime(xrayStatus.uptime) : '-'} />
          </Col>
          <Col span={6}>
            <Statistic title="PID" value={xrayStatus?.pid || '-'} />
          </Col>
          <Col span={6}>
            <Space>
              {xrayStatus?.running ? (
                <Button danger icon={<PauseCircleOutlined />} onClick={() => handleXrayAction('stop')} loading={actionLoading}>停止服务</Button>
              ) : (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => handleXrayAction('start')} loading={actionLoading} disabled={!xrayStatus?.installed}>启动服务</Button>
              )}
              {username === 'admin' && xrayUpdate?.updateAvailable && (
                <Button type="primary" onClick={handleXrayUpdate} loading={updateLoading}>
                  升级至 v{xrayUpdate.latestVersion}
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/nodes')}>
            <Statistic title="节点数量" value={nodeCount} prefix={<NodeIndexOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/routes')}>
            <Statistic title="转发规则" value={routeCount} prefix={<SwapOutlined />} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="已启用规则" value={enabledRoutes} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="入站端口" value={nodeCount > 0 ? `${nodeCount} 个` : '无'} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
      </Row>
      
      <Card title="快捷操作" style={{ marginTop: 24 }}>
        <Space wrap>
          <Tag color="blue" style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => navigate('/nodes')}>创建节点</Tag>
          <Tag color="purple" style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => navigate('/routes')}>创建规则</Tag>
          <Tag color="cyan" style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => navigate('/logs')}>查看日志</Tag>
        </Space>
      </Card>
    </div>
  );
}
