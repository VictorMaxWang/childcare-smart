import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPage() {
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
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold text-slate-950">隐私政策</h1>
        </div>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-600">
          <section>
            <h2 className="text-base font-semibold text-slate-900">处理的数据</h2>
            <p className="mt-2">
              系统会处理账号身份、机构与班级关系、幼儿档案、健康与成长记录、家园消息，以及用户主动上传的图片、音频和材料。
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-slate-900">处理目的</h2>
            <p className="mt-2">
              数据仅用于完成授权范围内的照护记录、沟通协作、风险跟进、统计分析和用户主动发起的 AI 辅助任务。
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-slate-900">访问与存储</h2>
            <p className="mt-2">
              访问按机构、班级、监护关系和角色隔离。私密附件通过受保护接口读取，不应被复制到公开链接或无关设备。
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-slate-900">未成年人保护</h2>
            <p className="mt-2">
              创建幼儿档案前应取得监护人同意。机构应遵循最小必要原则，及时更正或停止处理不准确、过期或未经授权的数据。
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
