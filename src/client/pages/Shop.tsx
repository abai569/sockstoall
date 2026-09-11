import { useEffect, useState } from 'react';
import { Card, Row, Col, Tag, Button, Modal, Form, Select, message, Spin, Empty } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { api } from '../api/client';

interface Package {
  id: number;
  type: string;
  name: string;
  description: string;
  price: number;
  validityDays: number;
  trafficLimitGb: number;
  maxRules: number;
  speedLimitMbps: number;
  stock: number;
  recommended: number;
  groupId: number | null;
}

interface PackageGroup {
  id: number;
  name: string;
  color: string;
}

export default function Shop() {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [groups, setGroups] = useState<PackageGroup[]>([]);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [buying, setBuying] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [packagesRes, groupsRes] = await Promise.all([
        api.get('/shop/packages'),
        api.get('/shop/package-groups'),
      ]);
      setPackages(packagesRes.data.data || []);
      setGroups(groupsRes.data.data || []);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = (pkg: Package) => {
    setSelectedPackage(pkg);
    form.resetFields();
    setBuyModalOpen(true);
  };

  const handlePurchase = async () => {
    try {
      const values = await form.validateFields();
      setBuying(true);
      
      const res = await api.post('/shop/orders', {
        packageId: selectedPackage!.id,
        payCurrency: values.payCurrency,
      });
      
      if (res.data.success) {
        message.success('购买成功');
        setBuyModalOpen(false);
        loadData();
      } else {
        message.error(res.data.error || '购买失败');
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '购买失败');
    } finally {
      setBuying(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  const getGroupName = (groupId: number | null) => {
    if (!groupId) return null;
    const group = groups.find(g => g.id === groupId);
    return group?.name || null;
  };

  const groupedPackages = packages.reduce((acc, pkg) => {
    const groupName = getGroupName(pkg.groupId) || '未分组';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(pkg);
    return acc;
  }, {} as Record<string, Package[]>);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (packages.length === 0) {
    return <Empty description="暂无套餐" />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>商城</h2>
      
      {Object.entries(groupedPackages).map(([groupName, pkgs]) => (
        <div key={groupName} style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 16, paddingLeft: 12, borderLeft: '4px solid #1890ff' }}>{groupName}</h3>
          <Row gutter={[16, 16]}>
            {pkgs.map(pkg => (
              <Col xs={24} sm={12} lg={8} xl={6} key={pkg.id}>
                <Card
                  hoverable
                  style={{ height: '100%' }}
                  actions={[
                    <Button
                      type="primary"
                      icon={<ShoppingCartOutlined />}
                      onClick={() => handleBuy(pkg)}
                      disabled={pkg.stock === 0}
                    >
                      {pkg.stock === 0 ? '售罄' : '购买'}
                    </Button>
                  ]}
                >
                  <Card.Meta
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{pkg.name}</span>
                        {pkg.recommended === 1 && <Tag color="red">推荐</Tag>}
                      </div>
                    }
                    description={
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff', marginBottom: 12 }}>
                          {formatPrice(pkg.price)}
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <Tag color="blue">{pkg.type === 'subscription' ? '订阅' : pkg.type === 'traffic' ? '流量' : '余额'}</Tag>
                          {pkg.validityDays > 0 && <Tag>{pkg.validityDays}天</Tag>}
                          {pkg.trafficLimitGb > 0 && <Tag color="green">{pkg.trafficLimitGb}GB</Tag>}
                          {pkg.speedLimitMbps > 0 && <Tag color="orange">{pkg.speedLimitMbps}Mbps</Tag>}
                          {pkg.maxRules > 0 && <Tag>{pkg.maxRules}规则</Tag>}
                        </div>
                        {pkg.description && <div style={{ color: '#666', fontSize: 12 }}>{pkg.description}</div>}
                        {pkg.stock >= 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: pkg.stock > 0 ? '#52c41a' : '#ff4d4f' }}>
                            库存：{pkg.stock === -1 ? '无限' : pkg.stock}
                          </div>
                        )}
                      </div>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ))}

      <Modal
        title="购买套餐"
        open={buyModalOpen}
        onOk={handlePurchase}
        onCancel={() => setBuyModalOpen(false)}
        confirmLoading={buying}
        okText="确认购买"
      >
        {selectedPackage && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{selectedPackage.name}</div>
              <div style={{ fontSize: 20, color: '#1890ff', fontWeight: 'bold' }}>{formatPrice(selectedPackage.price)}</div>
            </div>
            <Form form={form} layout="vertical">
              <Form.Item
                name="payCurrency"
                label="支付方式"
                rules={[{ required: true, message: '请选择支付方式' }]}
                initialValue="BALANCE"
              >
                <Select>
                  <Select.Option value="BALANCE">余额支付</Select.Option>
                  <Select.Option value="YIPAY">易支付</Select.Option>
                  <Select.Option value="USDT">USDT</Select.Option>
                </Select>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}
