import { Layout, Menu, Button, Dropdown, theme } from 'antd';
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
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

declare const __APP_VERSION__: string;

const { Header, Sider, Content } = Layout;

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
  const { username, logout } = useAuth();
  const { token: { colorBgContainer } } = theme.useToken();

  const handleMenuClick = (e: { key: string }) => {
    navigate(e.key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    { key: 'settings', icon: <LockOutlined />, label: '修改密码', onClick: () => navigate('/settings') },
    { type: 'divider' as const, key: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ];

  // 获取当前选中的菜单项
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
      <Sider breakpoint="lg" collapsedWidth="80" theme="light">
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: 18,
          color: '#1890ff',
        }}>
          SocksToAll
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
        <Header style={{ 
          padding: '0 24px', 
          background: colorBgContainer,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />}>
              {username || '用户'} <DownOutlined style={{ fontSize: 12 }} />
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: colorBgContainer, borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
