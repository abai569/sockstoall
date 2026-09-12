import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, InputNumber, DatePicker, Select, message, Popconfirm, Space, Row, Col, Dropdown } from 'antd';
import { api } from '../api/client';
import dayjs from 'dayjs';

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [assignUser, setAssignUser] = useState<any>(null);
  const [allServers, setAllServers] = useState<any[]>([]);
  const [assignedIds, setAssignedIds] = useState<number[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    api.get('/shop/admin/packages').then(res => {
      setPackages((res.data.data || []).filter((p: any) => p.type === 'traffic'));
    }).catch(() => {});
  }, []);

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
    form.setFieldsValue({ status: 1, role: 'user', maxNodes: 0, trafficLimitGb: 0, flowResetTime: 0, autoBuyTraffic: 0, autoBuyTrafficThreshold: 10 });
    setModalOpen(true);
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      role: user.role,
      status: user.status,
      maxNodes: user.maxNodes,
      trafficLimitGb: user.trafficLimitGb,
      flowResetTime: user.flowResetTime,
      autoBuyTraffic: user.autoBuyTraffic,
      autoBuyTrafficPackageId: user.autoBuyTrafficPackageId || undefined,
      autoBuyTrafficThreshold: user.autoBuyTrafficThreshold,
      expiredAt: user.expiredAt ? dayjs(user.expiredAt) : null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload: any = {
        role: values.role,
        status: values.status,
        trafficLimitGb: values.trafficLimitGb,
        flowResetTime: values.flowResetTime,
        autoBuyTraffic: values.autoBuyTraffic,
        autoBuyTrafficPackageId: values.autoBuyTrafficPackageId || 0,
        autoBuyTrafficThreshold: values.autoBuyTrafficThreshold,
        expiredAt: values.expiredAt ? values.expiredAt.valueOf() : 0,
        maxNodes: values.maxNodes,
      };

      if (editingUser) {
        payload.username = values.username;
        if (values.password) payload.password = values.password;
        await api.put(`/auth/admin/users/${editingUser.id}`, payload);
        message.success('更新成功');
      } else {
        payload.username = values.username;
        payload.password = values.password;
        await api.post('/auth/admin/users', payload);
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

  const openAssign = async (user: any) => {
    setAssignUser(user);
    try {
      const [serversRes, assignedRes] = await Promise.all([
        api.get('/server/servers'),
        api.get(`/auth/admin/users/${user.id}/servers`),
      ]);
      setAllServers(serversRes.data.data || []);
      setAssignedIds(assignedRes.data.data || []);
    } catch (error) {
      message.error('加载服务器失败');
    }
  };

  const saveAssign = async () => {
    if (!assignUser) return;
    setAssignSaving(true);
    try {
      await api.put(`/auth/admin/users/${assignUser.id}/servers`, { serverIds: assignedIds });
      message.success('服务器分配已保存');
      setAssignUser(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setAssignSaving(false);
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

  const formatLimit = (record: any) => {
    const limit = record.maxNodes;
    const used = `入 ${record.nodeCount ?? 0} / 出 ${record.routeCount ?? 0}`;
    return limit < 0 ? `${used}（无限制）` : `${used} / 上限 ${limit}`;
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (r: string) => <Tag color={r === 'admin' ? 'red' : 'blue'}>{r}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: number) => <Tag color={s === 1 ? 'green' : 'default'}>{s === 1 ? '启用' : '禁用'}</Tag> },
    { title: '流量 (GB)', key: 'traffic', render: (_: any, record: any) => `${(record.usedFlowGb ?? 0).toFixed(2)} / ${Number(record.trafficLimitGb) > 0 ? record.trafficLimitGb : '不限'}` },
    { title: '代理用量 / 上限', key: 'limit', render: (_: any, record: any) => formatLimit(record) },
    { title: '到期时间', dataIndex: 'expiredAt', key: 'expiredAt', render: (t: number) => t ? dayjs(t).format('YYYY-MM-DD') : '永久' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" onClick={() => openEdit(record)}>编辑</Button>
          {record.role !== 'admin' && (
            <Button type="link" onClick={() => openAssign(record)}>分配服务器</Button>
          )}
          {record.role !== 'admin' && (
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
              <Button type="link" danger>删除</Button>
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
        <Button type="primary" onClick={openCreate}>添加用户</Button>
      </div>
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} scroll={{ x: 1000 }} />

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={editingUser ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={[16, 0]}>
            <Col xs={12} sm={12}>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '至少 3 个字符' }]}>
                <Input placeholder="用户名" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="password" label="密码" rules={editingUser ? [{ min: 6, message: '至少 6 个字符' }] : [{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 个字符' }]}>
                <Input.Password placeholder={editingUser ? '留空则不修改' : '密码'} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                <Select options={[{ value: 'user', label: '普通用户' }, { value: 'admin', label: '管理员' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="status" label="启用">
                <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '禁用' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="trafficLimitGb" label="流量配额 (GB)" extra="0 表示不限制">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="maxNodes" label="最大规则数" extra="入站/出站各自上限，0 表示不限制">
                <InputNumber min={-1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="flowResetTime" label="流量归零日" extra="每月几号归零，0 表示不归零">
                <InputNumber min={0} max={28} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item label="到期时间">
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="expiredAt" noStyle>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Dropdown
                    menu={{
                      items: [
                        { key: '1', label: '1 月后' },
                        { key: '3', label: '3 月后' },
                        { key: '6', label: '6 月后' },
                        { key: '12', label: '1 年后' },
                        { key: '0', label: '永久' },
                      ],
                      onClick: ({ key }) => {
                        const months = Number(key);
                        form.setFieldValue('expiredAt', months > 0 ? dayjs().add(months, 'month') : null);
                      },
                    }}
                  >
                    <Button>快捷</Button>
                  </Dropdown>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="autoBuyTraffic" label="自动购流">
                <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '禁用' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="autoBuyTrafficPackageId" label="购流套餐">
                <Select
                  allowClear
                  placeholder="选择流量套餐"
                  options={packages.map(p => ({ value: p.id, label: `${p.name}（${(p.price / 100).toFixed(2)}元 / ${p.trafficLimitGb}GB）` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="autoBuyTrafficThreshold" label="购流阈值 (GB)" extra="剩余流量低于此值自动购买">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`分配服务器 - ${assignUser?.username || ''}`}
        open={!!assignUser}
        onOk={saveAssign}
        onCancel={() => setAssignUser(null)}
        confirmLoading={assignSaving}
        okText="保存"
        cancelText="取消"
      >
        <p style={{ color: '#666', marginBottom: 12 }}>该用户只能在此处勾选的服务器上创建入站/出站代理，本机也需显式勾选。</p>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择服务器"
          value={assignedIds}
          onChange={(v) => setAssignedIds(v)}
          options={allServers.map(s => ({ value: s.id, label: `${s.name}${s.isLocal ? '（本机）' : ''}` }))}
        />
      </Modal>
    </div>
  );
}
