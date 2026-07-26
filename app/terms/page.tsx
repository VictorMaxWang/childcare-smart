import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回登录
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold text-slate-950">用户服务协议</h1>
        </div>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-600">
          <section>
            <h2 className="text-base font-semibold text-slate-900">服务范围</h2>
            <p className="mt-2">
              慧育童行用于机构、教师和家长之间的幼儿照护记录、家园沟通与辅助分析。用户应使用真实、合法且获得授权的数据。
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-slate-900">账号与权限</h2>
            <p className="mt-2">
              三类账号拥有不同的数据范围。用户不得共享登录凭据、绕过机构或班级权限，也不得访问与本人无关的幼儿资料。
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-slate-900">AI 辅助边界</h2>
            <p className="mt-2">
              AI、OCR、语音和图片识别结果仅用于整理与提示，必须由具备权限的成人复核，不能替代医生诊断、紧急处置或专业医疗意见。
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-slate-900">使用责任</h2>
            <p className="mt-2">
              用户应及时纠正错误记录，并在发现健康风险、数据泄露或账号异常时停止相关操作并联系机构负责人。
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
