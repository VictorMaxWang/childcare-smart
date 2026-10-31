import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import AppShell from "./Navbar";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { AppProvider } from "@/lib/store";

function renderAnonymousPage(pathname: string, content: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} as never },
    createElement(PathnameContext.Provider, { value: pathname },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
        createElement(AppProvider, null, createElement(AppShell, null, content))))));
}

test("anonymous privacy and terms render their actual document through the client shell before auth resolves", () => {
  for (const [pathname, Component, title] of [["/privacy", PrivacyPage, "隐私政策"], ["/terms", TermsPage, "用户服务协议"]] as const) {
    const html = renderAnonymousPage(pathname, createElement(Component));
    assert.ok(html.includes(title), `${pathname} document was hidden by the client authentication guard`);
    assert.doesNotMatch(html, /正在校验登录状态|正在进入登录页/);
  }
});

test("anonymous private pages still hide business content behind the client authentication guard", () => {
  for (const pathname of ["/", "/parent", "/teacher", "/admin", "/children", "/privacy/private"]) {
    const html = renderAnonymousPage(pathname, createElement("p", null, "PRIVATE_BUSINESS_SENTINEL"));
    assert.doesNotMatch(html, /PRIVATE_BUSINESS_SENTINEL/);
    assert.match(html, /加载中|正在校验登录状态/);
  }
});
