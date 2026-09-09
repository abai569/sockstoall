import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Typography, Modal, Input, Tooltip, QRCode } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, QrcodeOutlined, CopyOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { nodeApi, linkApi, xrayApi } from '../api/client';

const { Title, Paragraph } = Typography;

const protocolColors: Record<string, string> = {
  shadowsocks: 'orange',
  vmess: 'blue',
  vless: 'purple',
  socks: 'green',
};

const protocolNames: Record<string, string> = {
  shadowsocks: 'Shadowsocks',
  vmess: 'VMess',
  vless: 'VLESS',
  socks: 'SOCKS',
};

interface NodeWithLink {
  id: string;
  name: string;
  protocol: string;
  port: number;
  listen?: string;
  updatedAt: string;
  shareLink?: string;
  [key: string]: any;
}

interface RunningInstance {
  id: string;
  type: 'node' | 'route';
  pid: number;
  uptime: number;
}

export default function Nodes() {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeWithLink[]>([]);
  const [runningInstances, setRunningInstances] = useState<RunningInstance[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLink, setImportLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeWithLink | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nodesRes, xrayRes] = await Promise.all([
        nodeApi.list(),
        xrayApi.status(),
      ]);
      setNodes(nodesRes.data.data?.items || []);
      setRunningInstances(xrayRes.data.data?.runningInstances || []);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (isNodeRunning(id)) {
      message.error('请先停止该节点再删除');
      return;
    }
    
    try {
      await nodeApi.delete(id);
      message.success('删除成功');
      loadData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleImport = async () => {
    if (!importLink.trim()) {
      message.warning('请输入链接');
      return;
    }
    
    setImporting(true);
    try {
      const res = await linkApi.parse(importLink);
      if (res.data.success) {
        const config = res.data.data.config;
        await nodeApi.create(config);
        message.success('导入成功');
        setImportModalOpen(false);
        setImportLink('');
        loadData();
      } else {
        message.error(res.data.error || '解析失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleStartNode = async (nodeId: string) => {
    try {
      await xrayApi.startNode(nodeId);
      message.success('节点启动成功（直连模式）');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '启动失败');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await xrayApi.stop(id);
      message.success('已停止');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '停止失败');
    }
  };

  const isNodeRunning = (nodeId: string): boolean => {
    return runningInstances.some(inst => inst.id === nodeId && inst.type === 'node');
  };

  const getNodeInstance = (nodeId: string): RunningInstance | undefined => {
    return runningInstances.find(inst => inst.id === nodeId && inst.type === 'node');
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    if (minutes > 0) return `${minutes}分钟${secs}秒`;
    return `${secs}秒`;
  };

  const showQRCode = (node: NodeWithLink) => {
    setSelectedNode(node);
    setQrModalOpen(true);
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      message.success('链接已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (protocol: string) => (
        <Tag color={protocolColors[protocol]}>
          {protocolNames[protocol] || protocol}
        </Tag>
      ),
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
    },
    {
      title: '监听地址',
      dataIndex: 'listen',
      key: 'listen',
      render: (listen: string) => listen || '0.0.0.0',
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: NodeWithLink) => {
        const running = isNodeRunning(record.id);
        const instance = getNodeInstance(record.id);
        
        return (
          <Space>
            {running ? (
              <Tag color="green" icon={<PlayCircleOutlined />}>
                运行中 {instance && `(${formatUptime(instance.uptime)})`}
              </Tag>
            ) : (
              <Tag color="default">已停止</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: NodeWithLink) => {
        const running = isNodeRunning(record.id);
        
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
              <Button 
                type="link" 
                icon={<PlayCircleOutlined />} 
                onClick={() => handleStartNode(record.id)}
                style={{ color: '#52c41a' }}
              >
                启动
              </Button>
            )}
            {record.shareLink && (
              <>
                <Tooltip title="查看二维码">
                  <Button 
                    type="link" 
                    icon={<QrcodeOutlined />} 
                    onClick={() => showQRCode(record)}
                  />
                </Tooltip>
                <Tooltip title="复制链接">
                  <Button 
                    type="link" 
                    icon={<CopyOutlined />} 
                    onClick={() => copyLink(record.shareLink!)}
                  />
                </Tooltip>
              </>
            )}
            <Button 
              type="link" 
              icon={<EditOutlined />} 
              onClick={() => navigate(`/nodes/${record.id}/edit`)}
              disabled={running}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除此节点？"
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
        <Title level={4} style={{ margin: 0 }}>节点管理</Title>
        <Space>
          <Button icon={<LinkOutlined />} onClick={() => setImportModalOpen(true)}>
            导入链接
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/nodes/new')}>
            创建节点
          </Button>
        </Space>
      </div>
      
      {runningInstances.filter(i => i.type === 'node').length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
          <Space>
            <PlayCircleOutlined style={{ color: '#52c41a' }} />
            <span>{runningInstances.filter(i => i.type === 'node').length} 个节点正在运行（直连模式）</span>
          </Space>
        </div>
      )}
      
      <Table
        loading={loading}
        columns={columns}
        dataSource={nodes}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
      
      {/* 导入链接弹窗 */}
      <Modal
        title="导入分享链接"
        open={importModalOpen}
        onOk={handleImport}
        onCancel={() => {
          setImportModalOpen(false);
          setImportLink('');
        }}
        confirmLoading={importing}
        okText="导入"
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          支持 ss:// vmess:// vless:// 格式的分享链接
        </p>
        <Input.TextArea
          rows={4}
          value={importLink}
          onChange={(e) => setImportLink(e.target.value)}
          placeholder="粘贴分享链接..."
        />
      </Modal>
      
      {/* 二维码弹窗 */}
      <Modal
        title={`节点二维码 - ${selectedNode?.name}`}
        open={qrModalOpen}
        onCancel={() => setQrModalOpen(false)}
        footer={null}
        width={400}
      >
        {selectedNode?.shareLink && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <QRCode value={selectedNode.shareLink} size={256} />
            <Paragraph 
              copyable 
              style={{ marginTop: 16, wordBreak: 'break-all', fontSize: 12 }}
            >
              {selectedNode.shareLink}
            </Paragraph>
            <Button 
              type="primary" 
              icon={<CopyOutlined />} 
              onClick={() => copyLink(selectedNode.shareLink!)}
              style={{ marginTop: 8 }}
            >
              复制链接
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
