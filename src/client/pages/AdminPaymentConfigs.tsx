import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Tag, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const CHANNELS = [
  { value: 'YIPAY', label: '易支付' },
  { value: 'USDT', label: 'USDT (GMPay)' },
];

export default function AdminPaymentConfigs() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [channel, setChannel] = useState('');
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/shop/admin/configs');
      setConfigs(res.data.data || []);
    } catch (error) {
      message.error('加载支付配置失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setChannel('');
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    setChannel(record.channel);
    let configData = {};
    try { configData = JSON.parse(record.config); } catch {}
    form.setFieldsValue({ channel: record.channel, enabled: record.enabled, ...configData });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const { channel, enabled, ...configFields } = values;
      const body = { channel, config: JSON.stringify(configFields), enabled: enabled ? 1 : 0 };
      const res = await api.post('/shop/admin/configs', body);
      if (res.data.success) {
        message.success('保存成功');
        setModalOpen(false);
        loadData();
      } else {
        message.error(res.data.error || '保存失败');
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const columns = [
    { title: '渠道', dataIndex: 'channel', key: 'channel', render: (c: string) => <Tag color="blue">{c}</Tag> },
    { title: '状态', dataIndex: 'enabled', key: 'enabled', render: (e: number) => <Tag color={e === 1 ? 'green' : 'default'}>{e === 1 ? '启用' : '禁用'}</Tag> },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>配置</Button>
      ),
    },
  ];

  const renderFields = (channel: string) => {
    if (channel === 'YIPAY') {
      return (
        <Row gutter={[16, 0]}>
          <Col xs={24}>
            <Form.Item name="gateway_url" label="网关地址" rules={[{ required: true }]}>
              <Input placeholder="https://pay.example.com" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="pid" label="商户 ID (PID)" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="key" label="商户密钥" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="notify_url" label="异步回调地址" rules={[{ required: true }]}>
              <Input placeholder="https://yourdomain.com/api/shop/callback/yipay" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="return_url" label="同步跳转地址">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="sign_mode" label="签名模式" initialValue="epay">
              <Select options={[{ value: 'epay', label: '标准易支付' }, { value: 'mpay', label: '码支付' }]} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="enable_alipay" label="启用支付宝" initialValue={true}>
              <Select options={[{ value: true, label: '启用' }, { value: false, label: '禁用' }]} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="enable_wxpay" label="启用微信支付" initialValue={true}>
              <Select options={[{ value: true, label: '启用' }, { value: false, label: '禁用' }]} />
            </Form.Item>
          </Col>
        </Row>
      );
    }
    if (channel === 'USDT') {
      return (
        <Row gutter={[16, 0]}>
          <Col xs={24}>
            <Form.Item name="api_url" label="GMPay API 地址" rules={[{ required: true }]}>
              <Input placeholder="https://gmpay.example.com" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="pid" label="商户 PID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="secret_key" label="密钥" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="notify_url" label="异步回调地址" rules={[{ required: true }]}>
              <Input placeholder="https://yourdomain.com/api/shop/callback/usdt" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="return_url" label="同步跳转地址">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="currency" label="货币" initialValue="cny">
              <Select options={[{ value: 'cny', label: 'CNY' }, { value: 'usd', label: 'USD' }]} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="token" label="币种" initialValue="usdt">
              <Select options={[{ value: 'usdt', label: 'USDT' }]} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="network" label="支付网络" initialValue="tron">
              <Input placeholder="tron,bsc" />
            </Form.Item>
          </Col>
        </Row>
      );
    }
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>支付配置</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加渠道</Button>
      </div>
      <Table columns={columns} dataSource={configs} rowKey="id" loading={loading} pagination={false} />

      <Modal title={editing ? '编辑支付配置' : '添加支付渠道'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消" width={640}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={[16, 0]}>
            <Col xs={16} sm={16}>
              <Form.Item name="channel" label="支付渠道" rules={[{ required: true }]} extra={editing ? '不可修改' : ''}>
                <Select options={CHANNELS} disabled={!!editing} onChange={(v) => setChannel(v)} />
              </Form.Item>
            </Col>
            <Col xs={8} sm={8}>
              <Form.Item name="enabled" label="启用" initialValue={1}>
                <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '禁用' }]} />
              </Form.Item>
            </Col>
          </Row>
          {channel && renderFields(channel)}
        </Form>
      </Modal>
    </div>
  );
}
