import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, InputNumber, DatePicker, Switch, Select, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import dayjs from 'dayjs';

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/admin/users');
      setUsers(res.data.data || []);
    } catch (error) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ status: true, role: 'user', maxNodes: 5, trafficLimitGb: 0 });
    setModalOpen(true);
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    form.setFieldsValue({
      status: user.status === 1,
      maxNodes: user.maxNodes,
      trafficLimitGb: user.trafficLimitGb,
      expiredAt: user.expiredAt ? dayjs(user.expiredAt) : null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingUser) {
        await api.put(`/auth/admin/users/${editingUser.id}`, {
          status: values.status ? 1 : 0,
          trafficLimitGb: values.trafficLimitGb,
          expiredAt: values.expiredAt ? values.expiredAt.valueOf() : 0,
          maxNodes: values.maxNodes,
        });
        message.success('更新成功');
      } else {
        await api.post('/auth/admin/users', {
          username: values.username,
          password: values.password,
          role: values.role,
          status: values.status ? 1 : 0,
          trafficLimitGb: values.trafficLimitGb,
          expiredAt: values.expiredAt ? values.expiredAt.valueOf() : 0,
          maxNodes: values.maxNodes,
        });
        message.success('创建成功');
      }
      setModalOpen(false);
      loadData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/auth/admin/users/${id}`);
      message.success('删除成功');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (r: string) => <Tag color={r === 'admin' ? 'red' : 'blue'}>{r}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: number) => <Tag color={s === 1 ? 'green' : 'default'}>{s === 1 ? '启用' : '禁用'}</Tag> },
    { title: '流量配额 (GB)', dataIndex: 'trafficLimitGb', key: 'trafficLimitGb' },
    {
      title: '节点用量', key: 'nodeUsage',
      render: (_: any, record: any) => record.maxNodes < 0 ? `${record.nodeCount ?? 0} / 无限制` : `${record.nodeCount ?? 0} / ${record.maxNodes}`,
    },
    { title: '到期时间', dataIndex: 'expiredAt', key: 'expiredAt', render: (t: number) => t ? dayjs(t).format('YYYY-MM-DD') : '-' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          {record.role !== 'admin' && (
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
              <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加用户</Button>
      </div>
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} />

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={editingUser ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingUser && (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '至少 3 个字符' }]}>
                <Input placeholder="用户名" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 个字符' }]}>
                <Input.Password placeholder="密码" />
              </Form.Item>
              <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                <Select options={[{ value: 'user', label: '普通用户' }, { value: 'admin', label: '管理员' }]} />
              </Form.Item>
            </>
          )}
          <Form.Item name="status" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="trafficLimitGb" label="流量配额 (GB)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxNodes" label="最大节点数" extra="-1 表示无限制">
            <InputNumber min={-1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiredAt" label="到期时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
