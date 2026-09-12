import { useEffect, useState } from 'react';
import { Card, Row, Col, Tag, Button, message, Spin } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { api } from '../api/client';

export default function Shop() {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => { loadPackages(); }, []);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const res = await api.get('/shop/packages');
      setPackages(res.data.data || []);
    } catch (error) {
      message.error('加载套餐失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async (pkg: any) => {
    try {
      const res = await api.post('/shop/orders', { packageId: pkg.id, payCurrency: 'BALANCE' });
      if (res.data.success) {
        message.success('购买成功');
      } else {
        message.error(res.data.error || '购买失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '购买失败');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>套餐商城</h2>
      <Row gutter={[16, 16]}>
        {packages.map(pkg => (
          <Col xs={24} sm={12} lg={8} xl={6} key={pkg.id}>
            <Card
              title={pkg.name}
              extra={pkg.recommended ? <Tag color="red">推荐</Tag> : null}
              actions={[
                <Button type="primary" icon={<ShoppingCartOutlined />} onClick={() => handleBuy(pkg)}>
                  购买 ¥{(pkg.price / 100).toFixed(2)}
                </Button>
              ]}
            >
              <p>{pkg.description}</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {pkg.trafficLimitGb > 0 && <li>流量：{pkg.trafficLimitGb} GB</li>}
                {pkg.validityDays > 0 && <li>有效期：{pkg.validityDays} 天</li>}
                {pkg.maxRules > 0 && <li>最大规则数：{pkg.maxRules}</li>}
                {pkg.speedLimitMbps > 0 && <li>限速：{pkg.speedLimitMbps} Mbps</li>}
              </ul>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
