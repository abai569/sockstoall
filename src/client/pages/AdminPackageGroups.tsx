import { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, message, Spin, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api/client';

interface PackageGroup {
  id: number;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

export default function AdminPackageGroups() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PackageGroup[]>([]);
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
      const res = await api.get('/shop/admin/package-groups');
      setGroups(res.data.data || []);
    } catch (error) {
      message.error('加载分组失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ color: '#1890ff', sortOrder: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: PackageGroup) => {
    setEditId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await api.delete(`/shop/package-groups/${id}`);
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

      const url = editId ? `/shop/package-groups/${editId}` : '/shop/package-groups';
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
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      render: (color: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, backgroundColor: color, borderRadius: 4, border: '1px solid #d9d9d9' }} />
          <span>{color}</span>
        </div>
      ),
    },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: PackageGroup) => (
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
        <h2 style={{ margin: 0 }}>套餐分组管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建分组</Button>
      </div>

      <Table columns={columns} dataSource={groups} rowKey="id" pagination={{ pageSize: 20 }} />

      <Modal
        title={editId ? '编辑分组' : '创建分组'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={editId ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：月度套餐" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="分组描述" />
          </Form.Item>

          <Form.Item name="color" label="颜色">
            <Input type="color" style={{ width: '100%', height: 40 }} />
          </Form.Item>

          <Form.Item name="sortOrder" label="排序" extra="数字越小越靠前">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
