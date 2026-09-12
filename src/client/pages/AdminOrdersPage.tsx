import { Tabs } from 'antd';
import AdminOrders from './AdminOrders';
import AdminPaymentConfigs from './AdminPaymentConfigs';

export default function AdminOrdersPage() {
  return (
    <Tabs
      defaultActiveKey="orders"
      items={[
        { key: 'orders', label: '订单', children: <AdminOrders /> },
        { key: 'payment', label: '支付配置', children: <AdminPaymentConfigs /> },
      ]}
    />
  );
}
