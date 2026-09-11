import { db } from '../db/index.js';
import { paymentConfigs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { YiPayGateway } from './gateways/yipay.js';
import { GMPayGateway } from './gateways/gmpay.js';

export type PaymentGateway = YiPayGateway | GMPayGateway;

export interface PaymentGatewayFactory {
  createInvoice(orderNo: string, amount: number, productName: string, payType?: string): Promise<any>;
  verifyCallback(params: Record<string, string>): any | null;
}

export function getPaymentGateway(channel: string): PaymentGatewayFactory | null {
  const config = db.query.paymentConfigs.findFirst({
    where: eq(paymentConfigs.channel, channel),
  });

  if (!config || config.enabled !== 1) {
    return null;
  }

  const configData = JSON.parse(config.config);

  if (channel === 'YIPAY') {
    const gateway = new YiPayGateway({
      gatewayUrl: configData.gateway_url,
      pid: configData.pid,
      key: configData.key,
      notifyUrl: configData.notify_url,
      returnUrl: configData.return_url,
      signMode: configData.sign_mode || 'epay',
      enableAlipay: configData.enable_alipay !== false,
      enableWxpay: configData.enable_wxpay !== false,
    });

    return {
      createInvoice: (orderNo, amount, productName, payType) => gateway.createInvoice(orderNo, amount, productName, payType),
      verifyCallback: (params) => gateway.verifyCallback(params),
    };
  }

  if (channel === 'USDT') {
    const gateway = new GMPayGateway({
      pid: configData.pid,
      secretKey: configData.secret_key,
      apiUrl: configData.api_url,
      notifyUrl: configData.notify_url,
      returnUrl: configData.return_url,
      currency: configData.currency || 'cny',
      token: configData.token || 'usdt',
      network: configData.network || 'tron',
    });

    return {
      createInvoice: (orderNo, amount, _productName, payType) => gateway.createInvoice(orderNo, amount, payType),
      verifyCallback: (params) => gateway.verifyCallback(params),
    };
  }

  return null;
}

export function getAvailablePaymentChannels(): string[] {
  const configs = db.query.paymentConfigs.findMany({
    where: eq(paymentConfigs.enabled, 1),
  });

  return configs.map(c => c.channel);
}
