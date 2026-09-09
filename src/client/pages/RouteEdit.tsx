import { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Card, message, Typography, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { routeApi, nodeApi } from '../api/client';
import type { Node } from '../../shared/types';

const { Title } = Typography;

export default function RouteEdit() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  useEffect(() => {
    loadNodes();
    if (isEdit) {
      loadRoute();
    }
  }, [id]);

  const loadNodes = async () => {
    try {
      const res = await nodeApi.list();
      setNodes(res.data.data?.items || []);
    } catch (error) {
      message.error('加载节点列表失败');
    }
  };

  const loadRoute = async () => {
    try {
      const res = await routeApi.get(id!);
      const route = res.data.data;
      if (route) {
        form.setFieldsValue(route);
      }
    } catch (error) {
      message.error('加载规则失败');
      navigate('/routes');
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        await routeApi.update(id!, values);
        message.success('更新成功');
      } else {
        await routeApi.create(values);
        message.success('创建成功');
      }
      navigate('/routes');
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/routes')} style={{ marginRight: 16 }}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑规则' : '创建规则'}</Title>
      </div>
      
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ enabled: true }}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="name"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="例如: 我的转发规则" />
          </Form.Item>
          
          <Form.Item
            name="nodeId"
            label="入站节点"
            rules={[{ required: true, message: '请选择入站节点' }]}
          >
            <Select placeholder="选择本地节点" showSearch optionFilterProp="label">
              {nodes.map(node => (
                <Select.Option key={node.id} value={node.id} label={node.name}>
                  <Space>
                    <span>{node.name}</span>
                    <span style={{ color: '#888' }}>({node.protocol}:{node.port})</span>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          <Card title="出站 SOCKS5 配置" size="small" style={{ marginBottom: 24 }}>
            <Form.Item
              name={['outbound', 'address']}
              label="服务器地址"
              rules={[{ required: true, message: '请输入地址' }]}
            >
              <Input placeholder="例如: 1.2.3.4" />
            </Form.Item>
            
            <Form.Item
              name={['outbound', 'port']}
              label="端口"
              rules={[{ required: true, message: '请输入端口' }]}
            >
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name={['outbound', 'username']} label="用户名">
              <Input placeholder="可选" autoComplete="new-username" />
            </Form.Item>
            
            <Form.Item name={['outbound', 'password']} label="密码">
              <Input.Password placeholder="可选" autoComplete="new-password" />
            </Form.Item>
          </Card>
          
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {isEdit ? '保存' : '创建'}
              </Button>
              <Button onClick={() => navigate('/routes')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
