import { useEffect, useState } from 'react';
import { Table, Tag, Button, message } from 'antd';
import { api } from '../api/client';

export default function Orders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/shop/orders');
      setOrders(res.data.data || []);
    } catch (error) {
      message.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (order: any) => {
    try {
      const res = await api.post(`/shop/orders/${order.id}/pay`);
      if (res.data.success) {
        message.success('支付成功');
        loadOrders();
      } else {
        message.error(res.data.error || '支付失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '支付失败');
    }
  };

  const statusMap: Record<number, { color: string; text: string }> = {
    0: { color: 'orange', text: '待支付' },
    1: { color: 'green', text: '已完成' },
    2: { color: 'default', text: '已取消' },
    3: { color: 'red', text: '已退款' },
    4: { color: 'blue', text: '处理中' },
  };

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo' },
    { title: '套餐', dataIndex: 'packageName', key: 'packageName' },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${(v / 100).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: number) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (t: string) => new Date(t).toLocaleString() },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => record.status === 0 ? (
        <Button type="link" onClick={() => handlePay(record)}>支付</Button>
      ) : null,
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>我的订单</h2>
      <Table columns={columns} dataSource={orders} rowKey="id" loading={loading} />
    </div>
  );
}
