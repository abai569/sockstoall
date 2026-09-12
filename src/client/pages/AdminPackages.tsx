import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, message, Spin, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api/client';

interface Package {
  id: number;
  type: string;
  name: string;
  description: string;
  price: number;
  validityDays: number;
  trafficLimitGb: number;
  maxRules: number;
  speedLimitMbps: number;
  stock: number;
  enabled: number;
  shopVisible: number;
  recommended: number;
}

export default function AdminPackages() {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/shop/admin/packages');
      setPackages(res.data.data || []);
    } catch (error) {
      message.error('加载套餐失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'subscription',
      enabled: 1,
      shopVisible: 1,
      stock: -1,
    });
    setModalOpen(true);
  };

  const openEdit = (record: Package) => {
    setEditId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await api.delete(`/shop/admin/packages/${id}`);
      if (res.data.success) {
        message.success('删除成功');
        loadData();
      } else {
        message.error(res.data.error || '删除失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      
      const url = editId ? `/shop/admin/packages/${editId}` : '/shop/admin/packages';
      const method = editId ? 'put' : 'post';
      
      const res = await api[method](url, values);
      
      if (res.data.success) {
        message.success(editId ? '更新成功' : '创建成功');
        setModalOpen(false);
        loadData();
      } else {
        message.error(res.data.error || '操作失败');
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const map: Record<string, { text: string; color: string }> = {
          subscription: { text: '订阅', color: 'blue' },
          traffic: { text: '流量', color: 'green' },
          balance: { text: '余额', color: 'orange' },
        };
        const t = map[type] || { text: type, color: 'default' };
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      render: (price: number) => `¥${(price / 100).toFixed(2)}`,
    },
    {
      title: '流量',
      dataIndex: 'trafficLimitGb',
      key: 'trafficLimitGb',
      render: (gb: number) => gb > 0 ? `${gb}GB` : '无限',
    },
    {
      title: '限速',
      dataIndex: 'speedLimitMbps',
      key: 'speedLimitMbps',
      render: (mbps: number) => mbps > 0 ? `${mbps}Mbps` : '无限',
    },
    {
      title: '库存',
      dataIndex: 'stock',
      key: 'stock',
      render: (stock: number) => stock === -1 ? '无限' : stock,
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: Package) => (
        <Space>
          <Tag color={record.enabled === 1 ? 'green' : 'default'}>{record.enabled === 1 ? '启用' : '禁用'}</Tag>
          <Tag color={record.shopVisible === 1 ? 'blue' : 'default'}>{record.shopVisible === 1 ? '上架' : '下架'}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Package) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>套餐管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建套餐</Button>
      </div>
      
      <Table columns={columns} dataSource={packages} rowKey="id" pagination={{ pageSize: 20 }} />

      <Modal
        title={editId ? '编辑套餐' : '创建套餐'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={700}
        okText={editId ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="例如：月度套餐" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="type" label="套餐类型" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'subscription', label: '订阅套餐' },
                  { value: 'traffic', label: '流量套餐' },
                  { value: 'balance', label: '余额套餐' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={2} placeholder="套餐描述" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="price" label="价格（分）" rules={[{ required: true, message: '请输入价格' }]}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder="100 = 1 元" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="validityDays" label="有效期（天）" extra="0 表示永久">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="trafficLimitGb" label="流量配额（GB）" extra="0 表示无限">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="maxNodes" label="最大节点数" extra="0 表示不改变用户当前设置">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="maxRules" label="最大规则数" extra="0 表示无限">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="speedLimitMbps" label="限速（Mbps）" extra="0 表示无限">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="maxConnections" label="最大连接数" extra="0 表示无限">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="stock" label="库存" extra="-1 表示无限">
                <InputNumber min={-1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="enabled" label="启用">
                <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '禁用' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="shopVisible" label="商城可见">
                <Select options={[{ value: 1, label: '可见' }, { value: 0, label: '隐藏' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="recommended" label="推荐">
                <Select options={[{ value: 1, label: '是' }, { value: 0, label: '否' }]} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
