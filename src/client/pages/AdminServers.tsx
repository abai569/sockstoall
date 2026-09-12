import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, Select, message, Popconfirm, Typography } from 'antd';
import { api } from '../api/client';

const { Paragraph, Text } = Typography;

export default function AdminServers() {
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [installModal, setInstallModal] = useState<{ open: boolean; command: string; title: string }>({ open: false, command: '', title: '安装' });
  const [editServer, setEditServer] = useState<any>(null);
  const [assignServer, setAssignServer] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const openEdit = (record: any) => {
    setEditServer(record);
    editForm.setFieldsValue({ name: record.name, address: record.address });
  };

  const saveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      await api.put(`/server/servers/${editServer.id}`, values);
      message.success('已保存');
      setEditServer(null);
      loadData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const openAssign = async (record: any) => {
    setAssignServer(record);
    try {
      const [usersRes, assignedRes] = await Promise.all([
        api.get('/auth/admin/users'),
        api.get(`/server/servers/${record.id}/users`),
      ]);
      setAllUsers(usersRes.data.data || []);
      setAssignedUserIds(assignedRes.data.data || []);
    } catch (error) {
      message.error('加载用户失败');
    }
  };

  const saveAssign = async () => {
    if (!assignServer) return;
    setAssignSaving(true);
    try {
      await api.put(`/server/servers/${assignServer.id}/users`, { userIds: assignedUserIds });
      message.success('已保存');
      setAssignServer(null);
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setAssignSaving(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => loadData(true), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/server/servers');
      setServers(res.data.data || []);
    } catch (error) {
      if (!silent) message.error('加载服务器列表失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await api.post('/server/servers', values);
      if (res.data.success) {
        message.success('创建成功');
        setModalOpen(false);
        form.resetFields();
        loadData();
        if (res.data.data?.installCommand) {
          setInstallModal({ open: true, command: res.data.data.installCommand, title: '安装' });
        }
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

  const handleRotate = async (id: number) => {
    try {
      const res = await api.post(`/server/servers/${id}/rotate-token`);
      if (res.data.success) {
        message.success('Token 已重置，请重新安装 Agent');
        loadData();
        setInstallModal({ open: true, command: res.data.data.installCommand, title: '安装' });
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const copy = (text: string, tip: string) => {
    navigator.clipboard.writeText(text).then(() => message.success(tip));
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '名称', dataIndex: 'name', key: 'name',
      render: (name: string, record: any) => <span>{name} {record.isLocal && <Tag color="blue">本机</Tag>}</span>,
    },
    { title: '地址', dataIndex: 'address', key: 'address' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => <Tag color={s === 'online' ? 'green' : 'default'}>{s === 'online' ? '在线' : '离线'}</Tag>,
    },
    { title: '节点数', dataIndex: 'nodeCount', key: 'nodeCount', width: 80 },
    { title: '已分配', dataIndex: 'assignedUserCount', key: 'assignedUserCount', width: 80 },
    { title: 'Xray 版本', dataIndex: 'xrayVersion', key: 'xrayVersion', render: (v: string) => v || '-' },
    {
      title: '最后心跳', dataIndex: 'lastHeartbeat', key: 'lastHeartbeat', width: 180,
      render: (t: number, record: any) => record.isLocal ? '-' : (t ? new Date(t).toLocaleString() : '-'),
    },
    {
      title: '操作', key: 'action', width: 320,
      render: (_: any, record: any) => (
        <>
          <Button type="link" onClick={() => openEdit(record)}>编辑</Button>
          {!record.isLocal && <Button type="link" onClick={() => openAssign(record)}>分配用户</Button>}
          {!record.isLocal && (
            <Button type="link" onClick={() => setInstallModal({ open: true, command: record.installCommand, title: '安装' })}>安装命令</Button>
          )}
          {!record.isLocal && (
            <Button type="link" danger onClick={() => setInstallModal({ open: true, command: record.uninstallCommand, title: '卸载' })}>卸载命令</Button>
          )}
          {!record.isLocal && (
            <Popconfirm title="重置 Token 后原 Agent 将失效，确定？" onConfirm={() => handleRotate(record.id)} okText="确定" cancelText="取消">
              <Button type="link">重置 Token</Button>
            </Popconfirm>
          )}
          {!record.isLocal && (
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
              <Button type="link" danger>删除</Button>
            </Popconfirm>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>节点管理</h2>
        <Button type="primary" onClick={() => setModalOpen(true)}>添加服务器</Button>
      </div>
      <Table columns={columns} dataSource={servers} rowKey="id" loading={loading} pagination={false} scroll={{ x: 1000 }} />

      <Modal title="添加服务器" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：东京节点" />
          </Form.Item>
          <Form.Item name="address" label="公网地址" rules={[{ required: true, message: '请输入地址' }]}>
            <Input placeholder="远程服务器公网 IP 或域名" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑服务器" open={!!editServer} onOk={saveEdit} onCancel={() => setEditServer(null)} okText="保存" cancelText="取消">
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：东京节点" />
          </Form.Item>
          <Form.Item name="address" label="公网地址" extra="IP 或解析好的域名，用于生成分享链接">
            <Input placeholder="1.2.3.4 或 node.example.com" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`分配用户 - ${assignServer?.name || ''}`}
        open={!!assignServer}
        onOk={saveAssign}
        onCancel={() => setAssignServer(null)}
        confirmLoading={assignSaving}
        okText="保存"
        cancelText="取消"
      >
        <p style={{ color: '#666', marginBottom: 12 }}>被分配的用户才能在该服务器上创建入站/出站代理。</p>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择用户"
          value={assignedUserIds}
          onChange={(v) => setAssignedUserIds(v)}
          options={allUsers.filter(u => u.role !== 'admin').map(u => ({ value: u.id, label: u.username }))}
        />
      </Modal>

      <Modal
        title={`在远程服务器执行（${installModal.title}）`}
        open={installModal.open}
        onCancel={() => setInstallModal({ open: false, command: '', title: '安装' })}
        footer={[
          <Button key="copy" type="primary" onClick={() => copy(installModal.command, '已复制')}>复制命令</Button>,
          <Button key="close" onClick={() => setInstallModal({ open: false, command: '', title: '安装' })}>关闭</Button>,
        ]}
        width={720}
      >
        <Paragraph type="secondary">登录远程服务器（root），执行以下命令{installModal.title} Agent：</Paragraph>
        <Paragraph>
          <Text code style={{ wordBreak: 'break-all' }}>{installModal.command}</Text>
        </Paragraph>
      </Modal>
    </div>
  );
}
