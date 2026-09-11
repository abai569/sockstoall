import { createHash } from 'crypto';

export interface GMPayConfig {
  pid: string;
  secretKey: string;
  apiUrl: string;
  notifyUrl: string;
  returnUrl: string;
  currency: string;
  token: string;
  network: string;
}

export interface PaymentResult {
  payUrl: string;
  payAddress?: string;
  payAmount: string;
  payToken?: string;
  qrContent?: string;
  qrImageUrl?: string;
  expiresAt: number;
  returnUrl: string;
}

export interface CallbackResult {
  channel: string;
  orderNo: string;
  transactionId: string;
  amount: string;
  currency: string;
  token?: string;
  network?: string;
  payType?: string;
}

export class GMPayGateway {
  private config: GMPayConfig;

  constructor(config: GMPayConfig) {
    this.config = config;
  }

  name(): string {
    return 'USDT';
  }

  private sign(params: Record<string, string>, secretKey: string): string {
    const keys = Object.keys(params)
      .filter(k => k !== 'signature')
      .sort();

    const signStr = keys.map(k => `${k}=${params[k]}`).join('&') + secretKey;
    return createHash('md5').update(signStr).digest('hex');
  }

  async createInvoice(orderNo: string, amount: number, payType: string = ''): Promise<PaymentResult> {
    if (!this.config.apiUrl) {
      throw new Error('GMPay 服务器地址未配置，请在支付管理页面填写');
    }
    if (!this.config.pid) {
      throw new Error('GMPay 商户 PID 未配置，请在支付管理页面填写');
    }
    if (!this.config.secretKey) {
      throw new Error('GMPay 密钥未配置，请在支付管理页面填写');
    }
    if (!this.config.notifyUrl) {
      throw new Error('GMPay 异步通知地址未配置，请在支付管理页面填写');
    }

    // 金额转换：分 -> 元
    const amountCNY = amount / 100;
    const amountStr = amountCNY.toString();

    const currency = this.config.currency || 'cny';
    const token = this.config.token || 'usdt';
    const network = payType || this.config.network.split(',')[0].trim();

    if (!network) {
      throw new Error('请选择 USDT 支付网络');
    }

    // 验证网络是否在允许列表中
    if (this.config.network) {
      const allowedNetworks = this.config.network.split(',').map(n => n.trim());
      if (!allowedNetworks.includes(network)) {
        throw new Error(`USDT 支付网络 ${network} 未启用`);
      }
    }

    // 构建签名参数
    const signParams: Record<string, string> = {
      pid: this.config.pid,
      order_id: orderNo,
      currency,
      token,
      amount: amountStr,
      notify_url: this.config.notifyUrl,
    };
    if (network) {
      signParams.network = network;
    }
    if (this.config.returnUrl) {
      signParams.redirect_url = this.config.returnUrl;
    }

    const signature = this.sign(signParams, this.config.secretKey);

    // 构建请求体
    const bodyParams: Record<string, any> = {
      pid: this.config.pid,
      order_id: orderNo,
      currency,
      token,
      amount: amountCNY,
      notify_url: this.config.notifyUrl,
      signature,
    };
    if (network) {
      bodyParams.network = network;
    }
    if (this.config.returnUrl) {
      bodyParams.redirect_url = this.config.returnUrl;
    }

    const endpoint = this.config.apiUrl.replace(/\/$/, '') + '/payments/gmpay/v1/order/create-transaction';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyParams),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GMPay API error: status=${response.status} body=${errorBody}`);
    }

    const result = await response.json();

    if (result.status_code && result.status_code !== 0 && result.status_code !== 200) {
      throw new Error(`GMPay returned error: ${result.message}`);
    }
    if (result.status_code === 0 && result.code && result.code !== 0) {
      throw new Error(`GMPay returned error: ${result.msg}`);
    }

    if (!result.data?.payment_url && !result.data?.receive_address) {
      throw new Error(`GMPay response missing payment data`);
    }

    return {
      payUrl: result.data.payment_url || '',
      payAddress: result.data.receive_address || '',
      payAmount: result.data.actual_amount?.toString() || amountStr,
      payToken: result.data.token || token,
      qrContent: result.data.receive_address || '',
      expiresAt: result.data.expiration_time || Math.floor(Date.now() / 1000) + 1800,
      returnUrl: this.config.returnUrl,
    };
  }

  verifyCallback(params: Record<string, string>): CallbackResult | null {
    // 检查交易状态
    const tradeStatus = params.trade_status || params.payment_status || params.status;
    if (!tradeStatus) {
      return null;
    }
    if (
      tradeStatus.toUpperCase() !== 'TRADE_SUCCESS' &&
      tradeStatus !== '1' &&
      tradeStatus.toUpperCase() !== 'SUCCESS' &&
      tradeStatus.toUpperCase() !== 'PAID'
    ) {
      return null;
    }

    // 提取签名
    const callbackSig = params.sign || params.signature;
    if (!callbackSig) {
      return null;
    }

    // 构建签名映射（排除签名字段）
    const signMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k === 'sign' || k === 'signature' || k === 'sign_type') continue;
      signMap[k] = v;
    }
    const expectedSig = this.sign(signMap, this.config.secretKey);

    if (callbackSig !== expectedSig) {
      return null;
    }

    // 验证货币
    const currency = params.currency || params.pay_currency;
    const expectedCurrency = this.config.currency || 'cny';
    if (currency && currency.toLowerCase() !== expectedCurrency.toLowerCase()) {
      return null;
    }

    // 验证 token
    const token = params.token || params.pay_token;
    const expectedToken = this.config.token || 'usdt';
    if (token && token.toLowerCase() !== expectedToken.toLowerCase()) {
      return null;
    }

    // 提取订单号
    const orderNo = params.out_trade_no || params.order_id;
    if (!orderNo) {
      return null;
    }

    // 提取交易哈希
    let txHash = params.tx_hash || params.txid || params.trade_no;
    if (!txHash) {
      // 生成稳定哈希
      const stable = [
        params.pid,
        orderNo,
        params.actual_amount || params.paid_amount || params.pay_amount || params.amount,
        currency?.toLowerCase() || expectedCurrency.toLowerCase(),
        token?.toLowerCase() || expectedToken.toLowerCase(),
        (params.network || params.chain || '').toLowerCase(),
      ].join('\x00');
      txHash = 'gmpay:' + createHash('sha256').update(stable).digest('hex');
    }

    // 提取金额
    const amount = params.actual_amount || params.paid_amount || params.pay_amount || params.amount;
    if (!amount) {
      return null;
    }

    return {
      channel: this.name(),
      orderNo,
      transactionId: txHash,
      amount,
      currency: currency || expectedCurrency,
      token: token || expectedToken,
      network: params.network || params.chain || '',
    };
  }
}
