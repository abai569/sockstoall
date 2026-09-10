import { Layout, Menu, Button, Dropdown, theme, Drawer, Modal, Form, Input, message } from 'antd';
import { useState, useEffect } from 'react';
import { 
  DashboardOutlined, 
  NodeIndexOutlined, 
  SwapOutlined, 
  FileTextOutlined, 
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
  DownOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../api/client';

declare const __APP_VERSION__: string;

const { Header, Sider, Content } = Layout;
const { Password } = Input;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/nodes', icon: <NodeIndexOutlined />, label: '节点管理' },
  { key: '/routes', icon: <SwapOutlined />, label: '转发规则' },
  { key: '/logs', icon: <FileTextOutlined />, label: '实时日志' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, login, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [siteTitle, setSiteTitle] = useState('SocksToAll');
  const [changePwdForm] = Form.useForm();
  const { token: { colorBgContainer } } = theme.useToken();

  useEffect(() => {
    loadSiteTitle();
  }, []);

  const loadSiteTitle = async () => {
    try {
      const res = await authApi.getSiteConfig();
      if (res.data.success) {
        setSiteTitle(res.data.data.title);
      }
    } catch (error) {
      console.error('Load site title error:', error);
    }
  };

  const handleMenuClick = (e: { key: string }) => {
    navigate(e.key);
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    { key: 'change-pwd', icon: <LockOutlined />, label: '修改密码', onClick: () => { changePwdForm.resetFields(); setChangePwdOpen(true); } },
    { type: 'divider' as const, key: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ];

  const handleChangePwd = async () => {
    try {
      const values = await changePwdForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入的密码不一致');
        return;
      }
      setChangePwdLoading(true);
      const res = await authApi.changeAccount({
        oldPassword: values.oldPassword,
        newUsername: values.newUsername || undefined,
        newPassword: values.newPassword || undefined,
      });
      if (res.data.success) {
        const { username: newUsername, token } = res.data.data;
        if (token && newUsername) {
          login(token, newUsername);
        }
        message.success('修改成功');
        setChangePwdOpen(false);
        changePwdForm.resetFields();
      } else {
        message.error(res.data.error || '修改失败');
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '修改失败');
    } finally {
      setChangePwdLoading(false);
    }
  };

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    if (path.startsWith('/nodes')) return '/nodes';
    if (path.startsWith('/routes')) return '/routes';
    if (path.startsWith('/logs')) return '/logs';
    if (path.startsWith('/settings')) return '/settings';
    return '/';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider className="desktop-sider" breakpoint="lg" collapsedWidth="80" theme="light">
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: 18,
          color: '#1890ff',
        }}>
          {siteTitle}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={handleMenuClick}
        />
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 0',
          textAlign: 'center',
          color: '#999',
          fontSize: 12,
          borderTop: '1px solid #f0f0f0',
        }}>
          v{__APP_VERSION__}
        </div>
      </Sider>
      <Layout>
        <Header className="app-header" style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
        }}>
          <Button className="mobile-menu-button" type="text" icon={<MenuOutlined />} onClick={() => setMobileMenuOpen(true)} />
          <div style={{ marginLeft: 'auto' }}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Button type="text" icon={<UserOutlined />}>
                {username || '用户'} <DownOutlined style={{ fontSize: 12 }} />
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-content" style={{ margin: 24, padding: 24, background: colorBgContainer, borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
      <Drawer title={siteTitle} placement="left" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} width={200} closable={false} styles={{ body: { padding: 0 } }}>
        <Menu mode="inline" selectedKeys={[getSelectedKey()]} items={menuItems} onClick={handleMenuClick} />
      </Drawer>

      <Modal
        title="修改密码"
        open={changePwdOpen}
        onCancel={() => {}}
        footer={null}
        closable={false}
        maskClosable={false}
        keyboard={false}
        width={500}
      >
        <Form form={changePwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="newUsername" label="新用户名" rules={[{ min: 3, message: '至少3位' }]}>
            <Input placeholder="请输入新用户名（至少3位）" />
          </Form.Item>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Password placeholder="请输入当前密码" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ min: 6, message: '至少6位' }]}>
            <Password placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Password placeholder="请再次输入新密码" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <Button onClick={() => { setChangePwdOpen(false); changePwdForm.resetFields(); }}>取消</Button>
            <Button type="primary" onClick={handleChangePwd} loading={changePwdLoading}>确定</Button>
          </div>
        </Form>
      </Modal>
    </Layout>
  );
}
