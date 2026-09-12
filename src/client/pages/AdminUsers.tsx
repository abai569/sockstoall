import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, InputNumber, DatePicker, Switch, message, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import dayjs from 'dayjs';

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
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

  const handleEdit = (user: any) => {
    setEditingUser(user);
    form.setFieldsValue({
      status: user.status === 1,
      trafficLimitGb: user.trafficLimitGb,
      expiredAt: user.expiredAt ? dayjs(user.expiredAt) : null,
      maxNodes: user.maxNodes,
    });
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await api.put(`/auth/admin/users/${editingUser.id}`, {
        status: values.status ? 1 : 0,
        trafficLimitGb: values.trafficLimitGb,
        expiredAt: values.expiredAt ? values.expiredAt.valueOf() : 0,
        maxNodes: values.maxNodes,
      });
      message.success('更新成功');
      setEditModalOpen(false);
      loadData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '更新失败');
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
    { title: '到期时间', dataIndex: 'expiredAt', key: 'expiredAt', render: (t: number) => t ? dayjs(t).format('YYYY-MM-DD') : '-' },
    { title: '最大节点数', dataIndex: 'maxNodes', key: 'maxNodes' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          {record.role !== 'admin' && (
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
              <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>用户管理</h2>
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} />
      
      <Modal title="编辑用户" open={editModalOpen} onOk={handleSave} onCancel={() => setEditModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="status" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="trafficLimitGb" label="流量配额 (GB)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiredAt" label="到期时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxNodes" label="最大节点数">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
