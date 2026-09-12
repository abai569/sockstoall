import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../api/client';

export default function AdminServers() {
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/server/servers');
      setServers(res.data.data || []);
    } catch (error) {
      message.error('加载服务器列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await api.post('/server/servers', values);
      if (res.data.success) {
        message.success(`创建成功，Agent Token: ${res.data.data.agentToken}`);
        setModalOpen(false);
        form.resetFields();
        loadData();
      } else {
        message.error(res.data.error || '创建失败');
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/server/servers/${id}`);
      message.success('删除成功');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '地址', dataIndex: 'address', key: 'address' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'online' ? 'green' : 'default'}>{s}</Tag> },
    { title: 'Xray 版本', dataIndex: 'xrayVersion', key: 'xrayVersion', render: (v: string) => v || '-' },
    { title: '最后心跳', dataIndex: 'lastHeartbeat', key: 'lastHeartbeat', render: (t: number) => t ? new Date(t).toLocaleString() : '-' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>服务器管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加服务器</Button>
      </div>
      <Table columns={columns} dataSource={servers} rowKey="id" loading={loading} />
      
      <Modal title="添加服务器" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：东京节点" />
          </Form.Item>
          <Form.Item name="address" label="地址" rules={[{ required: true, message: '请输入地址' }]}>
            <Input placeholder="IP 或域名" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
