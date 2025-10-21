"use client";
export default function ControlPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-5">
      <h1 className="text-xl font-semibold mb-4">통합제어</h1>
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-slate-200">
        여기서 펌프/밸브/산소공급기 등 제어 UI를 구성하세요.
        {/* 필요하면 MQTT publish 함수 재사용 로직을 이 페이지에도 붙이면 됩니다. */}
      </div>
    </div>
  );
}
