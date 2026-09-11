import { createHash } from 'crypto';

export interface YiPayConfig {
  gatewayUrl: string;
  pid: string;
  key: string;
  notifyUrl: string;
  returnUrl: string;
  signMode: 'epay' | 'mpay';
  enableAlipay: boolean;
  enableWxpay: boolean;
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

// yipaySign 生成易支付 MD5 签名
// 支持两种模式：
//   - epay（标准易支付）：末尾 &key=商户密钥
//   - mpay（码支付）：去掉末尾 &，直接拼接密钥
function yipaySign(params: Record<string, string>, key: string, signMode: string): string {
  const keys = Object.keys(params).sort();

  let signStr = '';
  for (const k of keys) {
    if (!params[k]) continue;
    signStr += `${k}=${params[k]}&`;
  }

  if (signMode === 'mpay') {
    if (signStr.endsWith('&')) {
      signStr = signStr.slice(0, -1);
    }
    signStr += key;
    return createHash('md5').update(signStr).digest('hex');
  }

  // 标准易支付（默认）
  signStr += `key=${key}`;
  return createHash('md5').update(signStr).digest('hex');
}

export class YiPayGateway {
  private config: YiPayConfig;

  constructor(config: YiPayConfig) {
    this.config = config;
  }

  name(): string {
    return 'YIPAY';
  }

  async createInvoice(orderNo: string, amount: number, productName: string, payType: string = 'alipay'): Promise<PaymentResult> {
    // 金额转换：分 -> 元
    const money = (amount / 100).toFixed(2);

    const params: Record<string, string> = {
      pid: this.config.pid,
      type: payType,
      out_trade_no: orderNo,
      notify_url: this.config.notifyUrl,
      return_url: this.config.returnUrl,
      name: productName,
      money,
    };
    params.sign = yipaySign(params, this.config.key, this.config.signMode);
    params.sign_type = 'MD5';

    if (this.config.signMode === 'mpay') {
      const endpoint = this.config.gatewayUrl.replace(/\/$/, '') + '/mapi.php';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });

      if (!response.ok) {
        throw new Error(`mpay request failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.code !== 1) {
        throw new Error(`mpay returned error: ${result.msg}`);
      }

      const paymentResult: PaymentResult = {
        payUrl: result.payurl || '',
        payAmount: result.really_price || money,
        expiresAt: result.expires_at || Math.floor(Date.now() / 1000) + 900,
        returnUrl: this.config.returnUrl,
      };

      if (result.code_type === 0) {
        paymentResult.qrContent = result.pay_code;
      } else {
        let qrImageUrl = result.pay_code;
        if (qrImageUrl && !qrImageUrl.startsWith('http')) {
          const baseUrl = this.config.gatewayUrl.replace(/\/$/, '') + '/';
          qrImageUrl = new URL(qrImageUrl, baseUrl).toString();
        }
        paymentResult.qrImageUrl = qrImageUrl;
      }

      return paymentResult;
    }

    // 标准易支付
    const queryString = new URLSearchParams(params).toString();
    const payUrl = this.config.gatewayUrl.replace(/\/$/, '') + '/submit.php?' + queryString;

    return {
      payUrl,
      payAmount: money,
      qrContent: payUrl,
      expiresAt: Math.floor(Date.now() / 1000) + 900,
      returnUrl: this.config.returnUrl,
    };
  }

  verifyCallback(params: Record<string, string>): CallbackResult | null {
    const tradeStatus = params.trade_status;
    if (tradeStatus !== 'TRADE_SUCCESS') {
      return null;
    }

    // 验证签名
    const signParams: Record<string, string> = {
      pid: params.pid,
      trade_no: params.trade_no,
      out_trade_no: params.out_trade_no,
      type: params.type,
      name: params.name,
      money: params.money,
      trade_status: params.trade_status,
    };
    const expectedSign = yipaySign(signParams, this.config.key, this.config.signMode);
    if (expectedSign.toLowerCase() !== (params.sign || '').toLowerCase()) {
      return null;
    }

    // 验证 pid
    if (params.pid !== this.config.pid) {
      return null;
    }

    if (!params.out_trade_no || !params.trade_no || !params.money) {
      return null;
    }

    return {
      channel: this.name(),
      orderNo: params.out_trade_no,
      transactionId: params.trade_no,
      amount: params.money,
      currency: 'CNY',
      payType: params.type,
    };
  }
}
