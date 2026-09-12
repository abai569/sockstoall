import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, message, Popconfirm, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api/client';

const { Paragraph, Text } = Typography;

export default function AdminServers() {
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [installModal, setInstallModal] = useState<{ open: boolean; command: string; title: string }>({ open: false, command: '', title: '安装' });
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
      title: '状态', dataIndex: 'status', key: 'status',
      render: (s: string) => <Tag color={s === 'online' ? 'green' : 'default'}>{s === 'online' ? '在线' : '离线'}</Tag>,
    },
    { title: '节点数', dataIndex: 'nodeCount', key: 'nodeCount', width: 80 },
    { title: '已分配用户', dataIndex: 'assignedUserCount', key: 'assignedUserCount', width: 100 },
    { title: 'Xray 版本', dataIndex: 'xrayVersion', key: 'xrayVersion', render: (v: string) => v || '-' },
    {
      title: '最后心跳', dataIndex: 'lastHeartbeat', key: 'lastHeartbeat',
      render: (t: number, record: any) => record.isLocal ? '-' : (t ? new Date(t).toLocaleString() : '-'),
    },
    {
      title: '操作', key: 'action',
      render: (_: any, record: any) => (
        <>
          {!record.isLocal && (
            <Button type="link" icon={<CopyOutlined />} onClick={() => setInstallModal({ open: true, command: record.installCommand, title: '安装' })}>安装命令</Button>
          )}
          {!record.isLocal && (
            <Button type="link" danger icon={<CopyOutlined />} onClick={() => setInstallModal({ open: true, command: record.uninstallCommand, title: '卸载' })}>卸载命令</Button>
          )}
          {!record.isLocal && (
            <Popconfirm title="重置 Token 后原 Agent 将失效，确定？" onConfirm={() => handleRotate(record.id)} okText="确定" cancelText="取消">
              <Button type="link" icon={<ReloadOutlined />}>重置 Token</Button>
            </Popconfirm>
          )}
          {!record.isLocal && (
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>服务器管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加服务器</Button>
      </div>
      <Table columns={columns} dataSource={servers} rowKey="id" loading={loading} pagination={false} />

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

      <Modal
        title={`在远程服务器执行（${installModal.title}）`}
        open={installModal.open}
        onCancel={() => setInstallModal({ open: false, command: '', title: '安装' })}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={() => copy(installModal.command, '已复制')}>复制命令</Button>,
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
