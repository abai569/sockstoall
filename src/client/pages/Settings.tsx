import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Divider } from 'antd';
import { authApi } from '../api/client';

const { Title } = Typography;

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    
    setLoading(true);
    try {
      const res = await authApi.changePassword(values.oldPassword, values.newPassword);
      if (res.data.success) {
        message.success('密码修改成功');
        form.resetFields();
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
      
      <Card title="修改密码" style={{ maxWidth: 500 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password placeholder="原密码" />
          </Form.Item>
          
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password placeholder="新密码" />
          </Form.Item>
          
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="确认新密码" />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>
      
      <Divider />
      
      <Card title="关于" style={{ maxWidth: 500 }}>
        <p><strong>SocksToAll</strong> - 多协议代理节点管理 + SOCKS 转发面板</p>
        <p>版本: 1.0.0</p>
        <p>基于 Xray-core</p>
      </Card>
    </div>
  );
}
