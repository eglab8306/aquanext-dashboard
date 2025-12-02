"use client";

import React, { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Gauge,
  Thermometer,
  Activity,
  Wind,
  Waves,
  CloudRain,
  Power,
  ShieldAlert,
  Camera,
  Settings,
  BarChart2,
  Server,
  RefreshCw,
  Droplets,
} from "lucide-react";

/* ===== MQTT Topics ===== */
const TOPIC_MODE = "farm/line1/mode";
const TOPIC_CMD_MODE = "farm/line1/cmd/mode";

/* ====== 현황 탭용 탱크 메타 (실시간) ====== */
/** type: 'grow' | 'filter' | 'sea'  */
const TANKS_META = [
  { id: "A5", label: "양식수조 A5", type: "grow" },
  { id: "F5", label: "양식수조 F5", type: "grow" },
  { id: "A1", label: "양식수조 A1", type: "grow" },
  { id: "FIL", label: "여과수조", type: "filter" },
  { id: "SEA", label: "바다수조", type: "sea" },
];

/* ▼ A5 값을 다른 수조와 기상카드로 복제 */
const MIRROR_SOURCE = "A5";
const MIRROR_TARGETS = ["F5", "A1", "FIL", "SEA"];
const MIRROR_KEYS = new Set(["temp", "do", "ph"]); // 복제할 항목

/* ▼ 로컬 CCTV 이미지 경로 (public/cctv/*.jpg) */
const CCTV_SRC = {
  A5: "/cctv/a5.jpg?v=1",
  F5: "/cctv/f5.jpg?v=1",
  A1: "/cctv/a1.jpg?v=1",
};

/* ===== 공용 UI ===== */
const NavButton = ({ href, icon: Icon, children }) => {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "rounded-lg border border-slate-700/60",
        "inline-flex items-center h-9 px-3",
        active
          ? "bg-slate-700 text-white"
          : "text-slate-300 hover:text-white hover:bg-slate-800/60",
      ].join(" ")}
    >
      {Icon ? <Icon className="w-4 h-4 mr-2" /> : null}
      {children}
    </Link>
  );
};

const KPI = ({ label, value, unit, Icon }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/40 text-slate-100">
    <div className="py-2 px-2 flex flex-col items-center text-center gap-0.5">
      {Icon ? <Icon className="w-4 h-4 text-sky-300 mb-0.5" /> : null}
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 whitespace-nowrap">
          {label}
        </div>
        <div className="text-sm font-bold">
          {value}
          {unit ? (
            <span className="text-[11px] text-slate-400"> {unit}</span>
          ) : null}
        </div>
      </div>
    </div>
  </div>
);

const Section = ({ title, right, children, className = "" }) => (
  <div
    className={`rounded-lg border border-slate-800 bg-slate-900/30 text-slate-100 flex flex-col ${className}`}
  >
    <div className="px-2 py-2 border-b border-slate-800 flex items-center justify-between shrink-0">
      <div className="text-[14px] font-semibold tracking-tight flex items-center gap-2">
        <span className="inline-block w-1.5 h-3.5 rounded-full bg-sky-400" />
        {title}
      </div>
      {right}
    </div>
    <div className="p-2 flex-1">{children}</div>
  </div>
);

const Chip = ({ children, tone = "secondary" }) => {
  const cls = {
    secondary: "bg-slate-800 text-slate-300 border border-slate-700",
    live: "bg-emerald-900/40 text-emerald-300 border border-emerald-800",
    sky: "bg-sky-900/40 text-sky-300 border border-sky-800",
    danger: "bg-rose-900/40 text-rose-300 border border-rose-800",
    warn: "bg-amber-900/40 text-amber-300 border border-amber-800",
  }[tone];
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded ${cls}`}>{children}</span>
  );
};

const Button = ({
  children,
  onClick,
  variant = "solid",
  size = "md",
  icon: Icon,
}) => {
  const base =
    "rounded-lg transition active:scale-[0.99] inline-flex items-center justify-center";
  const v =
    variant === "ghost"
      ? "text-slate-300 hover:text-white hover:bg-slate-800/60"
      : "bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700";
  const s = size === "sm" ? "h-8 px-2.5 text-sm" : "h-9 px-3";
  return (
    <button onClick={onClick} className={`${base} ${v} ${s}`}>
      {Icon ? <Icon className="w-4 h-4 mr-2" /> : null}
      {children}
    </button>
  );
};

const CCTV = ({ title, src }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
    <div className="p-2.5 flex items-center justify-between">
      <div className="text-sm text-slate-300">{title}</div>
      <div className="flex items-center gap-2">
        <Chip>LIVE</Chip>
        <Camera className="w-4 h-4 text-slate-500" />
      </div>
    </div>
    <div className="aspect-video bg-slate-800">
      <img src={src} alt={title} className="w-full h-full object-cover" />
    </div>
  </div>
);

const SimpleTabs = ({ tabs, current, onChange }) => (
  <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 overflow-hidden">
    {tabs.map((t) => (
      <button
        key={t.value}
        onClick={() => onChange(t.value)}
        className={`px-2.5 py-1.5 text-sm ${
          current === t.value
            ? "bg-slate-700 text-white"
            : "text-slate-300 hover:text-white"
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

/* ===== MQTT 훅 ===== */
function useMqttLive() {
  const [data, setData] = useState(() => ({
    rain: 204,
    wave: 1.5,
    temp: 27.3, // 기상 카드 수온
    feel: 30.9,
    windDir: 323,
    wind: 3.9,
    powerTotal: 53282,
    mortality: 12.3,
    mode: "flow",
    tanks: TANKS_META.map((m) => ({
      id: m.id,
      type: m.type,
      temp: 27,
      do: 6.8,
      ph: 4.0,
      sal: 17.5,
      fish: m.type === "grow" ? 2000 : 0,
      avgW: m.type === "grow" ? 45 : 0,
      feed: m.type === "grow" ? 5.0 : 0,
      mortality: m.type === "grow" ? 12.0 : 0,
    })),
  }));
  const [mqttStatus, setMqttStatus] = useState("disconnected");
  const [lastMsg, setLastMsg] = useState("");
  const clientRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false,
      client;

    const waitMqtt = () =>
      new Promise((res, rej) => {
        let n = 0;
        (function poll() {
          if (window.mqtt) res(window.mqtt);
          else if (n++ > 100) rej(new Error("mqtt cdn load timeout"));
          else setTimeout(poll, 50);
        })();
      });

    const CANDIDATES = [
      (process.env.NEXT_PUBLIC_MQTT_URL || "").trim(),
      "wss://mqtt.eclipseprojects.io:443/mqtt",
      "wss://test.mosquitto.org:443/mqtt",
      "wss://broker.emqx.io:8084/mqtt",
    ].filter(Boolean);

    const apply = (prev, topic, value) => {
      const num =
        typeof value === "string" && !isNaN(Number(value))
          ? parseFloat(value)
          : value;

      // 운영 모드
      if (topic === TOPIC_MODE) {
        const v = String(value).trim().toLowerCase();
        if (v === "flow" || v === "ras") return { ...prev, mode: v };
        return prev;
      }

      // 환경(기상) 토픽
      if (topic.startsWith("farm/line1/env/")) {
        const key = topic.split("/")[3];
        const map = {
          rain: "rain",
          wave: "wave",
          temp: "temp",
          feel: "feel",
          windDir: "windDir",
          wind: "wind",
          powerTotal: "powerTotal",
          mortality: "mortality",
        };
        if (map[key]) return { ...prev, [map[key]]: num };
        return prev;
      }

      // 탱크 토픽
      if (topic.startsWith("farm/line1/tanks/")) {
        const [, , , tankId, metric] = topic.split("/");
        const tanks = prev.tanks.map((t) => ({ ...t }));

        // 탱크 찾기/생성
        let idx = tanks.findIndex((t) => t.id === tankId);
        if (idx < 0) {
          const meta = TANKS_META.find((x) => x.id === tankId) || {
            id: tankId,
            type: "grow",
          };
          tanks.push({
            id: meta.id,
            type: meta.type,
            temp: 0,
            do: 0,
            ph: 4.0,
            sal: 0,
            fish: 0,
            avgW: 0,
            feed: 0,
            mortality: 0,
          });
          idx = tanks.length - 1;
        }

        // 값 업데이트
        if (metric in tanks[idx]) {
          tanks[idx][metric] = num;

          // ▶ A5 값 → 다른 수조로 복제
          if (tankId === MIRROR_SOURCE && MIRROR_KEYS.has(metric)) {
            for (const targetId of MIRROR_TARGETS) {
              const j = tanks.findIndex((t) => t.id === targetId);
              if (j >= 0) tanks[j][metric] = num;
            }
          }

          // ▶ 기상 카드 '수온' 동기화 (A5 수온 수신 시)
          if (tankId === MIRROR_SOURCE && metric === "temp") {
            return { ...prev, tanks, temp: num };
          }
        }
        return { ...prev, tanks };
      }

      return prev;
    };

    const connectOnce = (mqtt, url) =>
      new Promise((resolve, reject) => {
        setMqttStatus("connecting");
        const c = mqtt.connect(url, {
          protocol: "wss",
          protocolVersion: 4,
          clientId: "web_" + Math.random().toString(16).slice(2),
          clean: true,
          keepalive: 30,
          reconnectPeriod: 0,
          connectTimeout: 10000,
          username: process.env.NEXT_PUBLIC_MQTT_USERNAME || undefined,
          password: process.env.NEXT_PUBLIC_MQTT_PASSWORD || undefined,
        });
        const cleanup = () => {
          c.removeAllListeners?.();
          try {
            c.end(true);
          } catch {}
        };
        c.on("connect", () => {
          if (cancelled) {
            cleanup();
            return;
          }
          setMqttStatus("connected");
          resolve(c);
        });
        c.on("error", () => {});
        c.on("close", () => {
          if (mqttStatus !== "connected") {
            cleanup();
            reject(new Error("closed"));
          }
        });
      });

    const connectWithFallback = async (mqtt) => {
      for (const url of CANDIDATES) {
        try {
          const ok = /\/mqtt($|\?)/.test(new URL(url).pathname);
          if (!ok) continue;
          return await connectOnce(mqtt, url);
        } catch {}
      }
      throw new Error("all brokers failed");
    };

    (async () => {
      try {
        const mqtt = await waitMqtt();
        const c = await connectWithFallback(mqtt);
        client = c;
        clientRef.current = c;

        c.subscribe(["farm/line1/env/#", "farm/line1/tanks/+/+", TOPIC_MODE], {
          qos: 0,
        });
        c.on("message", (topic, payload) => {
          if (cancelled) return;
          const text = payload.toString();
          setLastMsg(`${new Date().toLocaleTimeString()}  ${topic} = ${text}`);
          setData((prev) => apply(prev, topic, text));
        });

        c.on("close", () => !cancelled && setMqttStatus("disconnected"));
        c.on("reconnect", () => !cancelled && setMqttStatus("reconnecting"));
        c.on("error", () => !cancelled && setMqttStatus("error"));
      } catch {
        setMqttStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        client?.end(true);
      } catch {}
      clientRef.current = null;
    };
  }, []);

  const publishMode = (next) => {
    const c = clientRef.current;
    if (!c) return;
    try {
      c.publish(TOPIC_CMD_MODE, next, { qos: 0, retain: false });
      setData((p) => ({ ...p, mode: next }));
    } catch {}
  };

  return { data, mqttStatus, lastMsg, publishMode };
}

/* ===== 페이지 ===== */
export default function Page() {
  const { data: m, mqttStatus, lastMsg, publishMode } = useMqttLive();
  const [tankTab, setTankTab] = useState(TANKS_META[0].id);
  const [monitorTab, setMonitorTab] = useState("cctv");
  const currentMeta = TANKS_META.find((t) => t.id === tankTab) || TANKS_META[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <Script
        src="https://unpkg.com/mqtt/dist/mqtt.min.js"
        strategy="afterInteractive"
      />

      {/* Top bar */}
      <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60 bg-slate-950/80 border-b border-slate-800">
        <div className="mx-auto px-4 py-2 flex items-center gap-2">
          <div className="flex items-center gap-2 mr-6">
            <div className="w-5 h-5 rounded bg-sky-500/80" />
            <div className="font-semibold text-[15px]">
              하이브리드 육상 양식 시스템
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Chip
              tone={
                mqttStatus === "connected"
                  ? "live"
                  : mqttStatus === "error"
                  ? "danger"
                  : "warn"
              }
            >
              MQTT: {mqttStatus}
            </Chip>
            {lastMsg ? (
              <span className="text-[11px] text-slate-400 hidden md:inline">
                {lastMsg}
              </span>
            ) : null}
            <Chip tone="live">AQUA.NEXT</Chip>
            <Chip tone="sky">호남대학교 캡스톤 디자인</Chip>
            <Button variant="ghost" size="sm" icon={Bell} />
            <Button variant="ghost" size="sm" icon={Settings} />
          </div>
        </div>
      </div>

      <div className="mx-auto px-4 py-3 grid grid-cols-12 gap-2">
        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                메뉴
              </div>
              <nav className="flex flex-col gap-1.5">
                <NavButton href="/" icon={Gauge}>
                  모니터링
                </NavButton>
                <NavButton href="/control" icon={Server}>
                  통합제어
                </NavButton>
              </nav>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="col-span-12 lg:col-span-10 space-y-3">
          {/* Row 1: 기상/운영/알림 */}
          <div className="grid grid-cols-12 gap-2 items-stretch">
            <div className="col-span-12 lg:col-span-6">
              <Section title="기상" className="h-full">
                <div className="grid grid-cols-6 gap-2">
                  <KPI label="강수" value={m.rain} unit="mm" Icon={CloudRain} />
                  <KPI label="파고" value={m.wave} unit="m" Icon={Waves} />
                  <KPI
                    label="수온"
                    value={m.temp?.toFixed?.(1) ?? m.temp}
                    unit="°C"
                    Icon={Thermometer}
                  />
                  <KPI label="기온" value={m.feel} unit="°C" Icon={Activity} />
                  <KPI label="풍향" value={m.windDir} unit="°" Icon={Wind} />
                  <KPI label="풍속" value={m.wind} unit="m/s" Icon={Wind} />
                </div>
              </Section>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-4">
              <Section title="양식장 운영 정보" className="h-full">
                <div className="grid grid-cols-3 gap-2 h-full">
                  <KPI
                    label="전력량"
                    value={m.powerTotal?.toLocaleString?.() ?? m.powerTotal}
                    unit="kWh"
                    Icon={Power}
                  />
                  <KPI
                    label="폐사율"
                    value={m.mortality}
                    unit="%"
                    Icon={ShieldAlert}
                  />
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2 flex flex-col items-center justify-center">
                    <div className="text-xs text-slate-400 mb-1">운영 모드</div>
                    <div className="text-base font-extrabold tracking-tight mb-1">
                      {m.mode === "flow" ? "유수식" : "RAS"}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={RefreshCw}
                      onClick={() =>
                        publishMode(m.mode === "flow" ? "ras" : "flow")
                      }
                    >
                      전환
                    </Button>
                  </div>
                </div>
              </Section>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-2">
              <Section title="이상상황 알림" className="h-full">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-rose-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>임계치초과</span>
                    </div>
                    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-rose-900/40 border border-rose-800">
                      3 건
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>통신이상</span>
                    </div>
                    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-800">
                      2 건
                    </span>
                  </div>
                </div>
              </Section>
            </div>
          </div>

          {/* Row 2: 계통도 + 현황(탭) */}
          <div className="grid grid-cols-12 gap-2 items-stretch">
            <div className="col-span-12 lg:col-span-7">
              <Section title="양식장 계통도" className="h-full">
                <div className="grid grid-cols-3 gap-2 text-slate-300 text-sm">
                  {[
                    { name: "수중펌프 1", sub: "전력 · 진동 · 유량" },
                    { name: "수중펌프 2", sub: "전력 · 진동 · 유량" },
                    { name: "여과기 1", sub: "전력 · 진동 · 유량" },
                    { name: "산소공급기 1", sub: "전력 · 진동 · 유량" },
                    { name: "산소공급기 2", sub: "전력 · 진동 · 유량" },
                    { name: "기포발생기 1", sub: "전력 · 진동 · 유량" },
                  ].map((p, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-800 bg-slate-900/50"
                    >
                      <div className="p-3 space-y-1.5">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {p.sub}
                        </div>
                        <div className="text-[11px]">75~150 마력</div>
                      </div>
                    </div>
                  ))}
                  <div className="col-span-3 rounded-lg border border-slate-800/80 bg-slate-900/40 p-3">
                    <div className="text-[11px] text-slate-400 mb-1">
                      유입수 · 센서
                    </div>
                    <div className="text-sm">수온, DO, pH, 염도</div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <Section title="양식수조 현황 정보" className="h-full">
                <div className="flex items-center justify-between mb-2">
                  <SimpleTabs
                    tabs={TANKS_META.map((t) => ({
                      value: t.id,
                      label: t.label,
                    }))}
                    current={tankTab}
                    onChange={setTankTab}
                  />
                </div>

                {m.tanks
                  .filter((t) => t.id === tankTab)
                  .map((t) => {
                    const meta = TANKS_META.find((m) => m.id === t.id) || {
                      type: "grow",
                    };
                    const isGrow = meta.type === "grow";
                    const ordered = [
                      ...(isGrow
                        ? [
                            <KPI
                              key="avgw"
                              label="무게(평균개체)"
                              value={t.avgW}
                              unit="g"
                            />,
                            <KPI
                              key="fish"
                              label="개체수(추정)"
                              value={t.fish?.toLocaleString?.() ?? t.fish}
                              unit="마리"
                            />,
                            <KPI
                              key="mort"
                              label="폐사율"
                              value={t.mortality}
                              unit="%"
                            />,
                            <KPI
                              key="feed"
                              label="사료 투입량"
                              value={t.feed}
                              unit="kg"
                            />,
                          ]
                        : []),
                      <KPI
                        key="temp"
                        label="수온"
                        value={t.temp}
                        unit="°C"
                        Icon={Thermometer}
                      />,
                      <KPI
                        key="do"
                        label="용존산소"
                        value={t.do}
                        unit="mg/L"
                        Icon={Droplets}
                      />,
                      <KPI key="ph" label="pH" value={t.ph} />,
                      <KPI key="sal" label="염도" value={t.sal} unit="PPT" />,
                    ];
                    return (
                      <div
                        key={t.id}
                        className="grid grid-cols-2 md:grid-cols-3 gap-2"
                      >
                        {ordered}
                      </div>
                    );
                  })}
              </Section>
            </div>
          </div>

          {/* Row 3: 실시간 모니터링 */}
          <Section
            title="실시간 모니터링"
            right={
              <SimpleTabs
                tabs={[
                  { value: "cctv", label: "CCTV" },
                  { value: "chart", label: "데이터 시각화" },
                ]}
                current={monitorTab}
                onChange={setMonitorTab}
              />
            }
          >
            {monitorTab === "cctv" ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                <CCTV title="양식수조 A5" src={CCTV_SRC.A5} />
                <CCTV title="양식수조 F5" src={CCTV_SRC.F5} />
                <CCTV title="양식수조 A1" src={CCTV_SRC.A1} />
              </div>
            ) : (
              <div className="text-sm text-slate-300 p-4 bg-slate-900/40 rounded-lg border border-slate-800">
                <p className="mb-1.5">여기에 실시간 차트를 붙이세요.</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li>MQTT 구독 → 상태 저장 → 라인 차트</li>
                  <li>최근 10분/1시간 토글, 이상구간 하이라이트</li>
                </ul>
              </div>
            )}
          </Section>

          <div className="h-3" />
        </div>
      </div>

      <footer className="border-t border-slate-800 py-4 text-center text-[11px] text-slate-500">
        © 2025 Aquaculture UI Mock (JS). Replace mock with MQTT live data.
      </footer>
    </div>
  );
}
