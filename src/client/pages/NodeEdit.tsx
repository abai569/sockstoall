import { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Card, message, Typography, Space, Divider } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { nodeApi } from '../api/client';
import type { NodeProtocol } from '../../shared/types';

const { Title } = Typography;
const { Password } = Input;

// 生成 UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 生成随机端口 30000-65000
function generateRandomPort(): number {
  return Math.floor(Math.random() * (65000 - 30000 + 1)) + 30000;
}

const protocolOptions = [
  { value: 'shadowsocks', label: 'Shadowsocks' },
  { value: 'vmess', label: 'VMess' },
  { value: 'vless', label: 'VLESS' },
  { value: 'socks', label: 'SOCKS5' },
];

const ssEncryptionOptions = [
  { value: 'aes-256-gcm', label: 'AES-256-GCM' },
  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
  { value: 'chacha20-ietf-poly1305', label: 'ChaCha20-IETF-Poly1305' },
  { value: 'xchacha20-ietf-poly1305', label: 'XChaCha20-IETF-Poly1305' },
  { value: '2022-blake3-aes-128-gcm', label: '2022-Blake3-AES-128-GCM' },
  { value: '2022-blake3-aes-256-gcm', label: '2022-Blake3-AES-256-GCM' },
];

const transportOptions = [
  { value: 'tcp', label: 'TCP' },
  { value: 'ws', label: 'WebSocket' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'kcp', label: 'mKCP' },
  { value: 'quic', label: 'QUIC' },
];

const tlsOptions = [
  { value: 'none', label: '无' },
  { value: 'tls', label: 'TLS' },
  { value: 'reality', label: 'Reality' },
];

export default function NodeEdit() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [protocol, setProtocol] = useState<NodeProtocol>('shadowsocks');
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      loadNode();
    }
  }, [id]);

  const loadNode = async () => {
    try {
      const res = await nodeApi.get(id!);
      const node = res.data.data;
      if (node) {
        setProtocol(node.protocol);
        form.setFieldsValue(node);
      }
    } catch (error) {
      message.error('加载节点失败');
      navigate('/nodes');
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // 端口留空则随机生成 30000-65000
      if (!values.port) {
        values.port = generateRandomPort();
      }
      
      // UUID 留空则自动生成
      if ((values.protocol === 'vmess' || values.protocol === 'vless') && !values.config?.uuid) {
        if (!values.config) values.config = {};
        values.config.uuid = generateUUID();
      }
      
      if (isEdit) {
        await nodeApi.update(id!, values);
        message.success('更新成功');
      } else {
        await nodeApi.create(values);
        message.success('创建成功');
      }
      navigate('/nodes');
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/nodes')} style={{ marginRight: 16 }}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑节点' : '创建节点'}</Title>
      </div>
      
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            protocol: 'shadowsocks',
            listen: '0.0.0.0',
          }}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="name"
            label="节点名称"
            rules={[{ required: true, message: '请输入节点名称' }]}
          >
            <Input placeholder="例如: 我的 SS 节点" />
          </Form.Item>
          
          <Form.Item
            name="protocol"
            label="协议"
            rules={[{ required: true }]}
          >
            <Select options={protocolOptions} onChange={(v) => setProtocol(v)} />
          </Form.Item>
          
          <Form.Item
            name="port"
            label="端口"
            extra="留空则从 30000-65000 随机生成"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="留空随机" />
          </Form.Item>
          
          <Form.Item
            name="listen"
            label="监听地址"
          >
            <Input placeholder="0.0.0.0" />
          </Form.Item>
          
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
          
          <Divider />
          
          {/* Shadowsocks 配置 */}
          {protocol === 'shadowsocks' && (
            <>
              <Form.Item
                name={['config', 'password']}
                label="密码"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Password placeholder="密码" />
              </Form.Item>
              
              <Form.Item
                name={['config', 'encryption']}
                label="加密方式"
                rules={[{ required: true }]}
                initialValue="aes-256-gcm"
              >
                <Select options={ssEncryptionOptions} />
              </Form.Item>
            </>
          )}
          
          {/* VMess 配置 */}
          {protocol === 'vmess' && (
            <>
              <Form.Item
                name={['config', 'uuid']}
                label="UUID"
                extra="留空则自动生成"
              >
                <Input placeholder="留空自动生成" />
              </Form.Item>
              
              <Form.Item
                name={['config', 'alterId']}
                label="AlterId"
                initialValue={0}
              >
                <InputNumber min={0} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              
              <Form.Item
                name={['config', 'encryption']}
                label="加密"
                initialValue="auto"
              >
                <Select options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'aes-128-gcm', label: 'AES-128-GCM' },
                  { value: 'chacha20-poly1305', label: 'ChaCha20-Poly1305' },
                  { value: 'none', label: 'None' },
                  { value: 'zero', label: 'Zero' },
                ]} />
              </Form.Item>
              
              <Form.Item
                name={['config', 'transport']}
                label="传输协议"
                initialValue="tcp"
              >
                <Select options={transportOptions} />
              </Form.Item>
              
              <Form.Item
                name={['config', 'tls']}
                label="TLS"
                initialValue="none"
              >
                <Select options={[
                  { value: 'none', label: '无' },
                  { value: 'tls', label: 'TLS' },
                ]} />
              </Form.Item>
            </>
          )}
          
          {/* VLESS 配置 */}
          {protocol === 'vless' && (
            <>
              <Form.Item
                name={['config', 'uuid']}
                label="UUID"
                extra="留空则自动生成"
              >
                <Input placeholder="留空自动生成" />
              </Form.Item>
              
              <Form.Item
                name={['config', 'flow']}
                label="Flow"
                initialValue="none"
              >
                <Select options={[
                  { value: 'none', label: 'None' },
                  { value: 'xtls-rprx-vision', label: 'xtls-rprx-vision' },
                  { value: 'xtls-rprx-vision-udp443', label: 'xtls-rprx-vision-udp443' },
                ]} />
              </Form.Item>
              
              <Form.Item
                name={['config', 'transport']}
                label="传输协议"
                initialValue="tcp"
              >
                <Select options={transportOptions} />
              </Form.Item>
              
              <Form.Item
                name={['config', 'tls']}
                label="安全"
                initialValue="none"
              >
                <Select options={tlsOptions} />
              </Form.Item>
            </>
          )}
          
          {/* SOCKS 配置 */}
          {protocol === 'socks' && (
            <>
              <Form.Item name={['config', 'username']} label="用户名">
                <Input placeholder="可选" />
              </Form.Item>
              
              <Form.Item name={['config', 'password']} label="密码">
                <Password placeholder="可选" />
              </Form.Item>
            </>
          )}
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {isEdit ? '保存' : '创建'}
              </Button>
              <Button onClick={() => navigate('/nodes')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
