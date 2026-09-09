import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Popconfirm, Switch, message, Typography, Modal, Form, Input, InputNumber, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { routeApi, nodeApi } from '../api/client';
import type { Route, Node } from '../../shared/types';

const { Title } = Typography;

function parseSocks5Link(str: string): { address: string; port: number; username?: string; password?: string } | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('socks5://')) {
      const withoutProtocol = trimmed.slice(8);
      const atIndex = withoutProtocol.lastIndexOf('@');
      if (atIndex <= 0) return null;
      const auth = withoutProtocol.slice(0, atIndex);
      const hostPort = withoutProtocol.slice(atIndex + 1);
      const colonIndex = hostPort.lastIndexOf(':');
      if (colonIndex <= 0) return null;
      const address = hostPort.slice(0, colonIndex);
      const port = parseInt(hostPort.slice(colonIndex + 1));
      if (!address || !port) return null;
      const colonInAuth = auth.indexOf(':');
      const username = colonInAuth >= 0 ? auth.slice(0, colonInAuth) : auth;
      const password = colonInAuth >= 0 ? auth.slice(colonInAuth + 1) : undefined;
      return { address, port, username: username || undefined, password: password || undefined };
    }

    const parts = trimmed.split(':');
    if (parts.length === 2) {
      return { address: parts[0], port: parseInt(parts[1]) };
    }
    if (parts.length === 4) {
      return { address: parts[0], port: parseInt(parts[1]), username: parts[2], password: parts[3] };
    }
  } catch {}
  return null;
}

export default function RouteList() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [linkValue, setLinkValue] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setNodeLoading(true);
    try {
      const [routesRes, nodesRes] = await Promise.all([routeApi.list(), nodeApi.list()]);
      setRoutes(routesRes.data.data?.items || []);
      setNodes(nodesRes.data.data?.items || []);
    } catch (error) { message.error('加载数据失败'); }
    finally { setLoading(false); setNodeLoading(false); }
  };

  const openCreate = () => {
    setEditId(null);
    setLinkValue('');
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: Route) => {
    setEditId(record.id);
    setLinkValue('');
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try { await routeApi.delete(id); message.success('删除成功'); loadData(); }
    catch (error) { message.error('删除失败'); }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try { await routeApi.toggle(id, enabled); message.success(enabled ? '已启用' : '已禁用'); loadData(); }
    catch (error) { message.error('操作失败'); }
  };

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLinkValue(val);
    const parsed = parseSocks5Link(val);
    if (parsed) {
      console.log('Parsed SOCKS5 link:', parsed);
      form.setFieldsValue({
        outbound: {
          address: parsed.address,
          port: parsed.port,
          username: parsed.username || undefined,
          password: parsed.password || undefined,
        },
      });
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editId) {
        await routeApi.update(editId, values);
        message.success('更新成功');
      } else {
        await routeApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      loadData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '操作失败');
    } finally { setSubmitting(false); }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '入站节点', dataIndex: 'nodeId', key: 'nodeId',
      render: (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        return node ? (
          <Space><span>{node.name}</span><Tag>{node.protocol}</Tag><Tag color="blue">:{node.port}</Tag></Space>
        ) : <Tag color="red">节点已删除</Tag>;
      },
    },
    { title: '出站 SOCKS', key: 'outbound', render: (_: any, r: Route) => <span>{r.outbound.address}:{r.outbound.port}</span> },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled',
      render: (enabled: boolean, r: Route) => (
        <Switch checked={enabled} onChange={(v) => handleToggle(r.id, v)} checkedChildren="启用" unCheckedChildren="禁用" />
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_: any, r: Route) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)} okText="确定" cancelText="取消">
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>转发规则</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建规则</Button>
      </div>
      <Table loading={loading} columns={columns} dataSource={routes} rowKey="id" pagination={{ pageSize: 10 }} />

      {/* 创建/编辑弹窗 */}
      <Modal
        title={editId ? '编辑规则' : '创建规则'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setLinkValue('');
        }}
        confirmLoading={submitting}
        width={500}
        okText={editId ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：我的转发规则" />
          </Form.Item>
          <Form.Item name="nodeId" label="入站节点" rules={[{ required: true, message: '请选择入站节点' }]}>
            <Select placeholder="选择本地节点" showSearch optionFilterProp="label" loading={nodeLoading}>
              {nodes.map(node => (
                <Select.Option key={node.id} value={node.id} label={node.name}>
                  <Space>
                    <span>{node.name}</span>
                    <span style={{ color: '#888' }}>({node.protocol}:{node.port})</span>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ background: '#fafafa', padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
            <div style={{ fontWeight: 500, marginBottom: 12 }}>出站 SOCKS5 配置</div>
            <Form.Item>
              <Input
                placeholder="粘贴链接，如 socks5://user:pass@1.2.3.4:1080 或 1.2.3.4:1080:user:pass"
                prefix={<LinkOutlined />}
                value={linkValue}
                onChange={handleLinkChange}
                allowClear
              />
            </Form.Item>
            <Form.Item name={['outbound', 'address']} label="服务器地址" rules={[{ required: true, message: '请输入地址' }]}>
              <Input placeholder="例如：1.2.3.4" />
            </Form.Item>
            <Form.Item name={['outbound', 'port']} label="端口" rules={[{ required: true, message: '请输入端口' }]}>
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name={['outbound', 'username']} label="用户名">
              <Input placeholder="可选" autoComplete="new-username" />
            </Form.Item>
            <Form.Item name={['outbound', 'password']} label="密码">
              <Input.Password placeholder="可选" autoComplete="new-password" />
            </Form.Item>
          </div>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
