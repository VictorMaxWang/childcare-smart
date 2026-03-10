export type WechatSessionResult = {
  openid: string;
  unionid?: string;
  sessionKey?: string;
};

export async function exchangeWechatCodeForSession(code: string): Promise<WechatSessionResult> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("missing WECHAT_APP_ID or WECHAT_APP_SECRET");
  }

  const normalizedCode = String(code ?? "").trim();
  if (!normalizedCode) {
    throw new Error("wechat code is required");
  }

  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}` +
    `&js_code=${encodeURIComponent(normalizedCode)}&grant_type=authorization_code`;

  const response = await fetch(url, { method: "GET" });
  const body = (await response.json()) as {
    openid?: string;
    unionid?: string;
    session_key?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (!response.ok) {
    throw new Error(`wechat jscode2session http error: ${response.status}`);
  }

  if (!body.openid) {
    throw new Error(`wechat jscode2session failed: ${body.errmsg ?? "unknown"}`);
  }

  return {
    openid: body.openid,
    unionid: body.unionid,
    sessionKey: body.session_key,
  };
}
