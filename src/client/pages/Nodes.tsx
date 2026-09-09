import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Typography, Modal, Input, Tooltip, QRCode, Switch, Form, Select, InputNumber, Divider, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, QrcodeOutlined, CopyOutlined } from '@ant-design/icons';
import { nodeApi, linkApi } from '../api/client';
import type { NodeProtocol } from '../../shared/types';

const { Title, Paragraph } = Typography;
const { Password } = Input;

const protocolColors: Record<string, string> = { shadowsocks: 'orange', vmess: 'blue', vless: 'purple', socks: 'green' };
const protocolNames: Record<string, string> = { shadowsocks: 'Shadowsocks', vmess: 'VMess', vless: 'VLESS', socks: 'SOCKS' };

const protocolOptions = [
  { value: 'shadowsocks', label: 'Shadowsocks' },
  { value: 'vmess', label: 'VMess' },
  { value: 'vless', label: 'VLESS' },
  { value: 'socks', label: 'SOCKS5' },
];
const ssEncryptionOptions = [
  { value: 'aes-256-gcm', label: 'AES-256-GCM' },
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'chacha20-ietf-poly1305', label: 'ChaCha20-IETF-Poly1305' },
  { value: 'xchacha20-ietf-poly1305', label: 'XChaCha20-IETF-Poly1305' },
  { value: '2022-blake3-aes-128-gcm', label: '2022-Blake3-AES-128-GCM' },
  { value: '2022-blake3-aes-256-gcm', label: '2022-Blake3-AES-256-GCM' },
];
const transportOptions = [
  { value: 'tcp', label: 'TCP' },
  { value: 'ws', label: 'WebSocket' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'kcp', label: 'mKCP' },
  { value: 'quic', label: 'QUIC' },
];
const tlsOptions = [
  { value: 'none', label: '无' },
  { value: 'tls', label: 'TLS' },
  { value: 'reality', label: 'Reality' },
];

interface NodeWithLink {
  id: string; name: string; protocol: string; port: number; listen?: string;
  enabled: boolean; updatedAt: string; shareLink?: string; config?: any; [key: string]: any;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateRandomPort(): number {
  return Math.floor(Math.random() * (65000 - 30000 + 1)) + 30000;
}

function generateShortId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export default function Nodes() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeWithLink[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<NodeProtocol>('shadowsocks');
  const [tlsType, setTlsType] = useState('none');
  const [transport, setTransport] = useState('tcp');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLink, setImportLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeWithLink | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await nodeApi.list();
      setNodes(res.data.data?.items || []);
    } catch (error) { message.error('加载节点失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditId(null);
    setProtocol('vless');
    setTlsType('none');
    setTransport('tcp');
    form.resetFields();
    form.setFieldsValue({ 
      protocol: 'vless',
      port: generateRandomPort(),
      listen: '0.0.0.0', 
      config: { 
        uuid: generateUUID(),
        tls: 'none', 
        transport: 'tcp',
        flow: 'none',
        encryption: 'auto',
        alterId: 0,
      } 
    });
    setModalOpen(true);
  };

  const openEdit = async (record: NodeWithLink) => {
    setEditId(record.id);
    setProtocol(record.protocol as NodeProtocol);
    setTlsType(record.config?.tls || 'none');
    setTransport(record.config?.transport || 'tcp');
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try { await nodeApi.delete(id); message.success('删除成功'); loadData(); }
    catch (error) { message.error('删除失败'); }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try { await nodeApi.toggle(id, enabled); message.success(enabled ? '已启用' : '已禁用'); loadData(); }
    catch (error) { message.error('操作失败'); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      
      // 自动填充
      if (!values.port) values.port = generateRandomPort();
      if ((values.protocol === 'vmess' || values.protocol === 'vless') && !values.config?.uuid) {
        if (!values.config) values.config = {};
        values.config.uuid = generateUUID();
      }
      
      if (values.config?.tls === 'reality') {
        if (!values.config.realitySettings) values.config.realitySettings = {};
        if (!values.config.realitySettings.shortId) {
          values.config.realitySettings.shortId = generateShortId();
        }
        if (!values.config.realitySettings.spiderX) {
          values.config.realitySettings.spiderX = '/';
        }
        if (values.config.realitySettings.serverNames && typeof values.config.realitySettings.serverNames === 'string') {
          values.config.realitySettings.serverNames = values.config.realitySettings.serverNames.split(',').map((s: string) => s.trim());
        }
      }
      
      if (editId) {
        await nodeApi.update(editId, values);
        message.success('更新成功');
      } else {
        await nodeApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      loadData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '操作失败');
    } finally { setSubmitting(false); }
  };

  const handleImport = async () => {
    if (!importLink.trim()) { message.warning('请输入链接'); return; }
    setImporting(true);
    try {
      const res = await linkApi.parse(importLink);
      if (res.data.success) {
        await nodeApi.create(res.data.data.config);
        message.success('导入成功');
        setImportModalOpen(false); setImportLink(''); loadData();
      } else { message.error(res.data.error || '解析失败'); }
    } catch (error: any) { message.error(error.response?.data?.error || '导入失败'); }
    finally { setImporting(false); }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => message.success('链接已复制')).catch(() => message.error('复制失败'));
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '协议', dataIndex: 'protocol', key: 'protocol', render: (p: string) => <Tag color={protocolColors[p]}>{protocolNames[p] || p}</Tag> },
    { title: '端口', dataIndex: 'port', key: 'port' },
    { title: '监听地址', dataIndex: 'listen', key: 'listen', render: (l: string) => l || '0.0.0.0' },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (remark: string) => remark || '-' },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled',
      render: (enabled: boolean, record: NodeWithLink) => (
        <Switch checked={enabled} onChange={(v) => handleToggle(record.id, v)} checkedChildren="启用" unCheckedChildren="禁用" />
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', render: (t: string) => new Date(t).toLocaleString() },
    {
      title: '操作', key: 'action', width: 260,
      render: (_: any, record: NodeWithLink) => (
        <Space size="small">
          {record.shareLink && (
            <>
              <Tooltip title="二维码"><Button size="small" type="text" icon={<QrcodeOutlined />} onClick={() => { setSelectedNode(record); setQrModalOpen(true); }} /></Tooltip>
              <Tooltip title="复制链接"><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyLink(record.shareLink!)} /></Tooltip>
            </>
          )}
          <Tooltip title="编辑"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>节点管理</Title>
        <Space>
          <Button icon={<LinkOutlined />} onClick={() => setImportModalOpen(true)}>导入链接</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建节点</Button>
        </Space>
      </div>
      <Table loading={loading} columns={columns} dataSource={nodes} rowKey="id" pagination={{ pageSize: 10 }} />

      {/* 创建/编辑弹窗 */}
      <Modal
        title={editId ? '编辑节点' : '创建节点'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={600}
        okText={editId ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="节点名称" rules={[{ required: true, message: '请输入节点名称' }]}>
                <Input placeholder="例如：我的节点" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="protocol" label="协议" rules={[{ required: true }]}>
                <Select options={protocolOptions} onChange={(v) => setProtocol(v)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="port" label="端口" extra="留空则从 30000-65000 随机生成">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="留空随机" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="listen" label="监听地址">
                <Input placeholder="0.0.0.0" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="可选备注" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          {protocol === 'shadowsocks' && (
            <>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name={['config', 'password']} label="密码" rules={[{ required: true }]}>
                    <Password placeholder="密码" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name={['config', 'encryption']} label="加密方式" rules={[{ required: true }]} initialValue="aes-256-gcm">
                    <Select options={ssEncryptionOptions} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {protocol === 'vmess' && (
            <>
              <Row gutter={16}>
                <Col span={24}><Form.Item name={['config', 'uuid']} label="UUID" extra="留空自动生成"><Input placeholder="留空自动生成" /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'alterId']} label="AlterId" initialValue={0}><InputNumber min={0} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'encryption']} label="加密" initialValue="auto"><Select options={[{ value: 'auto', label: 'Auto' }, { value: 'aes-128-gcm', label: 'AES-128-GCM' }, { value: 'chacha20-poly1305', label: 'ChaCha20-Poly1305' }, { value: 'none', label: 'None' }, { value: 'zero', label: 'Zero' }]} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'transport']} label="传输协议" initialValue="tcp"><Select options={transportOptions} onChange={(v) => setTransport(v)} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'tls']} label="TLS" initialValue="none"><Select options={[{ value: 'none', label: '无' }, { value: 'tls', label: 'TLS' }]} onChange={(v) => setTlsType(v)} /></Form.Item></Col>
              </Row>
              {tlsType === 'tls' && (
                <>
                  <Form.Item name={['config', 'tlsSettings', 'serverName']} label="Server Name (SNI)"><Input placeholder="example.com" /></Form.Item>
                  <Form.Item name={['config', 'tlsSettings', 'alpn']} label="ALPN"><Input placeholder="h2,http/1.1" /></Form.Item>
                </>
              )}
              {transport === 'ws' && (
                <>
                  <Form.Item name={['config', 'wsSettings', 'path']} label="WebSocket Path"><Input placeholder="/path" /></Form.Item>
                  <Form.Item name={['config', 'wsSettings', 'host']} label="Host"><Input placeholder="example.com" /></Form.Item>
                </>
              )}
              {transport === 'grpc' && (
                <Form.Item name={['config', 'grpcSettings', 'serviceName']} label="gRPC ServiceName"><Input placeholder="grpc" /></Form.Item>
              )}
            </>
          )}

          {protocol === 'vless' && (
            <>
              <Row gutter={16}>
                <Col span={24}><Form.Item name={['config', 'uuid']} label="UUID" extra="留空自动生成"><Input placeholder="留空自动生成" /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'flow']} label="Flow" initialValue="none"><Select options={[{ value: 'none', label: 'None' }, { value: 'xtls-rprx-vision', label: 'xtls-rprx-vision' }, { value: 'xtls-rprx-vision-udp443', label: 'xtls-rprx-vision-udp443' }]} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'transport']} label="传输协议" initialValue="tcp"><Select options={transportOptions} onChange={(v) => setTransport(v)} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'tls']} label="安全" initialValue="none"><Select options={tlsOptions} onChange={(v) => setTlsType(v)} /></Form.Item></Col>
              </Row>
              
              {/* TLS 配置 */}
              {tlsType === 'tls' && (
                <>
                  <Form.Item name={['config', 'tlsSettings', 'serverName']} label="Server Name (SNI)"><Input placeholder="example.com" /></Form.Item>
                  <Form.Item name={['config', 'tlsSettings', 'alpn']} label="ALPN"><Input placeholder="h2,http/1.1" /></Form.Item>
                </>
              )}
              
              {/* Reality 配置 - 简化版，用户只需填目标地址和域名 */}
              {tlsType === 'reality' && (
                <>
                  <div style={{ background: '#e6f7ff', padding: '8px 12px', borderRadius: 4, marginBottom: 16, fontSize: 12 }}>
                    💡 Reality 配置说明：只需填写目标地址和域名，密钥和 Short ID 自动生成
                  </div>
                  <Form.Item 
                    name={['config', 'realitySettings', 'dest']} 
                    label="目标地址 (dest)" 
                    rules={[{ required: true, message: '请输入目标地址' }]}
                    extra="例如：tesla.com:443"
                    initialValue="tesla.com:443"
                  >
                    <Input placeholder="tesla.com:443" />
                  </Form.Item>
                  <Form.Item 
                    name={['config', 'realitySettings', 'serverNames']} 
                    label="Server Names" 
                    rules={[{ required: true, message: '请输入 Server Names' }]}
                    extra="多个用逗号分隔，例如：tesla.com,www.tesla.com"
                    initialValue="tesla.com"
                  >
                    <Input placeholder="tesla.com,www.tesla.com" />
                  </Form.Item>
                  {/* 以下字段自动生成，编辑时显示 */}
                  {editId && (
                    <>
                      <Form.Item name={['config', 'realitySettings', 'privateKey']} label="Private Key">
                        <Input disabled />
                      </Form.Item>
                      <Form.Item name={['config', 'realitySettings', 'publicKey']} label="Public Key (用于分享)">
                        <Input disabled />
                      </Form.Item>
                      <Form.Item name={['config', 'realitySettings', 'shortId']} label="Short ID">
                        <Input disabled />
                      </Form.Item>
                    </>
                  )}
                </>
              )}
              
              {transport === 'ws' && (
                <>
                  <Form.Item name={['config', 'wsSettings', 'path']} label="WebSocket Path"><Input placeholder="/path" /></Form.Item>
                  <Form.Item name={['config', 'wsSettings', 'host']} label="Host"><Input placeholder="example.com" /></Form.Item>
                </>
              )}
              {transport === 'grpc' && (
                <Form.Item name={['config', 'grpcSettings', 'serviceName']} label="gRPC ServiceName"><Input placeholder="grpc" /></Form.Item>
              )}
            </>
          )}

          {protocol === 'socks' && (
            <>
              <Row gutter={16}>
                <Col xs={24} sm={12}><Form.Item name={['config', 'username']} label="用户名"><Input placeholder="可选" /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name={['config', 'password']} label="密码"><Password placeholder="可选" /></Form.Item></Col>
              </Row>
            </>
          )}
        </Form>
      </Modal>

      {/* 导入弹窗 */}
      <Modal title="导入分享链接" open={importModalOpen} onOk={handleImport} onCancel={() => { setImportModalOpen(false); setImportLink(''); }} confirmLoading={importing} okText="导入">
        <p style={{ marginBottom: 12, color: '#666' }}>支持 ss:// vmess:// vless:// 格式</p>
        <Input.TextArea rows={4} value={importLink} onChange={(e) => setImportLink(e.target.value)} placeholder="粘贴分享链接..." />
      </Modal>

      {/* 二维码弹窗 */}
      <Modal title={`节点二维码 - ${selectedNode?.name}`} open={qrModalOpen} onCancel={() => setQrModalOpen(false)} footer={null} width={400}>
        {selectedNode?.shareLink && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <QRCode value={selectedNode.shareLink} size={256} />
            </div>
            <Paragraph copyable style={{ marginTop: 16, wordBreak: 'break-all', fontSize: 12 }}>{selectedNode.shareLink}</Paragraph>
            <Button type="primary" icon={<CopyOutlined />} onClick={() => copyLink(selectedNode.shareLink!)} style={{ marginTop: 8 }}>复制链接</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
