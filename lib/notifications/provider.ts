export type NotificationRecipient = {
  userId: string;
  name: string;
  wechatOpenId?: string | null;
};

export type NotificationEventInput = {
  id: string;
  eventType: string;
  childId: string | null;
  payload: Record<string, unknown>;
};

export type NotificationSendResult = {
  ok: boolean;
  provider: "mock" | "wechat";
  messageId?: string;
  error?: string;
};

export type NotificationProvider = {
  name: "mock" | "wechat";
  send: (input: {
    event: NotificationEventInput;
    recipient: NotificationRecipient;
  }) => Promise<NotificationSendResult>;
};

function getProviderName(): "mock" | "wechat" {
  const value = String(process.env.NOTIFICATION_PROVIDER ?? "mock").trim().toLowerCase();
  return value === "wechat" ? "wechat" : "mock";
}

async function sendByMock(input: {
  event: NotificationEventInput;
  recipient: NotificationRecipient;
}): Promise<NotificationSendResult> {
  const eventName = input.event.eventType;
  const target = `${input.recipient.name}(${input.recipient.userId})`;
  const messageId = `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  console.info("[notification][mock] send", {
    messageId,
    eventName,
    target,
    childId: input.event.childId,
  });

  return {
    ok: true,
    provider: "mock",
    messageId,
  };
}

async function sendByWechat(input: {
  event: NotificationEventInput;
  recipient: NotificationRecipient;
}): Promise<NotificationSendResult> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    return {
      ok: false,
      provider: "wechat",
      error: "missing WECHAT_APP_ID or WECHAT_APP_SECRET",
    };
  }

  const openId = String(input.recipient.wechatOpenId ?? "").trim();
  if (!openId) {
    return {
      ok: false,
      provider: "wechat",
      error: "missing recipient wechat_openid",
    };
  }

  const templateId = String(process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID ?? "").trim();
  if (!templateId) {
    return {
      ok: false,
      provider: "wechat",
      error: "missing WECHAT_SUBSCRIBE_TEMPLATE_ID",
    };
  }

  const tokenRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
    { method: "GET" }
  );
  const tokenBody = (await tokenRes.json()) as { access_token?: string; errcode?: number; errmsg?: string };
  const accessToken = String(tokenBody.access_token ?? "").trim();

  if (!accessToken) {
    return {
      ok: false,
      provider: "wechat",
      error: `get access_token failed: ${tokenBody.errmsg ?? "unknown"}`,
    };
  }

  const page = String(process.env.WECHAT_MINI_PROGRAM_PAGE ?? "pages/index/index").trim();
  const nowText = new Date().toLocaleString("zh-CN", { hour12: false });
  const sendPayload = {
    touser: openId,
    template_id: templateId,
    page,
    data: {
      thing1: { value: input.event.eventType.slice(0, 20) || "托育提醒" },
      thing2: { value: input.recipient.name.slice(0, 20) || "家长" },
      time3: { value: nowText.slice(0, 20) },
    },
  };

  const sendRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendPayload),
    }
  );
  const sendBody = (await sendRes.json()) as { errcode?: number; errmsg?: string; msgid?: number };

  if ((sendBody.errcode ?? 0) !== 0) {
    return {
      ok: false,
      provider: "wechat",
      error: `wechat send failed: ${sendBody.errmsg ?? "unknown"}`,
    };
  }

  const messageId = sendBody.msgid ? String(sendBody.msgid) : `wechat-${Date.now()}`;

  return {
    ok: true,
    provider: "wechat",
    messageId,
  };
}

export function createNotificationProvider(): NotificationProvider {
  const name = getProviderName();

  if (name === "wechat") {
    return {
      name,
      send: sendByWechat,
    };
  }

  return {
    name: "mock",
    send: sendByMock,
  };
}
