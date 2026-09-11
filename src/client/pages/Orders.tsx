import { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, message, Spin, Empty } from 'antd';
import { api } from '../api/client';

interface Order {
  id: number;
  orderNo: string;
  packageName: string;
  amount: number;
  payCurrency: string;
  status: number;
  payTime: number | null;
  createdAt: string;
}

const statusMap: Record<number, { text: string; color: string }> = {
  0: { text: '待支付', color: 'orange' },
  1: { text: '已完成', color: 'green' },
  2: { text: '已取消', color: 'default' },
  3: { text: '已退款', color: 'red' },
  4: { text: '处理中', color: 'blue' },
};

export default function Orders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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

  const handleCancel = async (id: number) => {
    try {
      const res = await api.post(`/shop/orders/${id}/cancel`);
      if (res.data.success) {
        message.success('订单已取消');
        loadData();
      } else {
        message.error(res.data.error || '取消失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '取消失败');
    }
  };

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      render: (text: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span>,
    },
    {
      title: '套餐',
      dataIndex: 'packageName',
      key: 'packageName',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `¥${(amount / 100).toFixed(2)}`,
    },
    {
      title: '支付方式',
      dataIndex: 'payCurrency',
      key: 'payCurrency',
      render: (currency: string) => {
        const map: Record<string, string> = { BALANCE: '余额', YIPAY: '易支付', USDT: 'USDT' };
        return map[currency] || currency;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => {
        const s = statusMap[status] || { text: '未知', color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Order) => (
        <Space>
          {record.status === 0 && (
            <Button type="link" danger onClick={() => handleCancel(record.id)}>
              取消
            </Button>
          )}
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (orders.length === 0) {
    return <Empty description="暂无订单" />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>我的订单</h2>
      <Table columns={columns} dataSource={orders} rowKey="id" pagination={{ pageSize: 20 }} />
    </div>
  );
}
