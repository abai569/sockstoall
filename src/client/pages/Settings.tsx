import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { authApi } from '../api/client';

const { Title } = Typography;

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadSiteConfig();
  }, []);

  const loadSiteConfig = async () => {
    try {
      const res = await authApi.getSiteConfig();
      if (res.data.success) {
        form.setFieldsValue({ title: res.data.data.title });
      }
    } catch (error) {
      console.error('Load site config error:', error);
    }
  };

  const onFinish = async (values: { title: string }) => {
    setLoading(true);
    try {
      const res = await authApi.updateSiteConfig(values.title);
      if (res.data.success) {
        message.success('标题修改成功，刷新页面后生效');
      } else {
        message.error(res.data.error || '修改失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>设置</Title>
      
      <Card title="站点标题" style={{ maxWidth: 500 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          <Form.Item
            name="title"
            label="左上角显示标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="SocksToAll" />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
