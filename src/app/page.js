"use client";

import React, { useEffect, useRef, useState } from "react";
import Script from "next/script";
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
  RefreshCw, // ⬅ 운영 모드 버튼 아이콘
} from "lucide-react";

/* ===== 운영 모드 관련 토픽 ===== */
const TOPIC_MODE = "farm/line1/mode"; // 현재 모드(flow|ras), retain 권장
const TOPIC_CMD_MODE = "farm/line1/cmd/mode"; // 전환 명령(flow|ras)

/* ----------------- 작은 UI 헬퍼들 ----------------- */
const KPI = ({ label, value, unit, Icon }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-100 shadow-inner">
    <div className="py-4 px-4 flex flex-col items-center text-center gap-1">
      {Icon ? <Icon className="w-5 h-5 text-sky-300 mb-1" /> : null}
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 whitespace-nowrap">
          {label}
        </div>
        <div className="text-xl font-bold">
          {value}
          {unit ? (
            <span className="text-sm text-slate-400"> {unit}</span>
          ) : null}
        </div>
      </div>
    </div>
  </div>
);

/* Section: className 지원 + flex 레이아웃(내용이 높이를 채움) */
const Section = ({ title, right, children, className = "" }) => (
  <div
    className={`rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-100 flex flex-col ${className}`}
  >
    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
      <div className="text-base font-semibold tracking-tight flex items-center gap-2 whitespace-nowrap">
        <span className="inline-block w-1.5 h-4 rounded-full bg-sky-400" />
        {title}
      </div>
      {right}
    </div>
    <div className="p-4 flex-1">{children}</div>
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
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{children}</span>;
};

const Button = ({
  children,
  onClick,
  variant = "solid",
  size = "md",
  icon: Icon,
}) => {
  const base =
    "rounded-xl transition active:scale-[0.99] inline-flex items-center justify-center";
  const v =
    variant === "ghost"
      ? "text-slate-300 hover:text-white hover:bg-slate-800/60"
      : "bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700";
  const s = size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4";
  return (
    <button onClick={onClick} className={`${base} ${v} ${s}`}>
      {Icon ? <Icon className="w-4 h-4 mr-2" /> : null}
      {children}
    </button>
  );
};

const Input = (props) => (
  <input
    {...props}
    className={`w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-sky-500 ${
      props.className || ""
    }`}
  />
);
const Label = ({ children }) => (
  <label className="text-xs text-slate-300">{children}</label>
);

const CCTV = ({ title, src }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
    <div className="p-3 flex items-center justify-between">
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
  <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/60 overflow-hidden">
    {tabs.map((t) => (
      <button
        key={t.value}
        onClick={() => onChange(t.value)}
        className={`px-3 py-2 text-sm ${
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

/* ----------------- MQTT 실시간 구독 훅 (CDN) ----------------- */
function useMqttLive() {
  const [data, setData] = useState(() => ({
    rain: 204,
    wave: 1.5,
    temp: 27.3,
    feel: 30.9,
    windDir: 323,
    wind: 3.9,
    powerTotal: 53282,
    mortality: 12.3,
    mode: "flow", // 'flow' = 유수식, 'ras' = RAS
    alerts: { threshold: 3, comms: 2 },
    tanks: [
      {
        id: "A5",
        temp: 27,
        do: 6.9,
        ph: 8.2,
        sal: 17.6,
        fish: 2296,
        avgW: 49.2,
        feed: 6.0,
        mortality: 12.3,
      },
      {
        id: "F5",
        temp: 26.7,
        do: 6.4,
        ph: 7.9,
        sal: 18.2,
        fish: 1980,
        avgW: 46.5,
        feed: 5.4,
        mortality: 12.0,
      },
    ],
  }));
  const [mqttStatus, setMqttStatus] = useState("disconnected");
  const [lastMsg, setLastMsg] = useState("");
  const clientRef = useRef(null); // publish 위해 저장

  useEffect(() => {
    if (typeof window === "undefined") return;
    let client;
    let cancelled = false;

    const waitMqtt = () =>
      new Promise((res, rej) => {
        let n = 0;
        const poll = () => {
          if (window.mqtt) return res(window.mqtt);
          if (n++ > 100) return rej(new Error("mqtt cdn load timeout"));
          setTimeout(poll, 50);
        };
        poll();
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

      // 운영 모드 상태 갱신
      if (topic === TOPIC_MODE) {
        const v = String(value).trim().toLowerCase();
        if (v === "flow" || v === "ras") return { ...prev, mode: v };
        return prev;
      }

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

      if (topic.startsWith("farm/line1/tanks/")) {
        const parts = topic.split("/");
        const tankId = parts[3];
        const metric = parts[4];

        const tanks = prev.tanks.map((t) => ({ ...t }));
        let idx = tanks.findIndex((t) => t.id === tankId);
        if (idx < 0) {
          tanks.push({
            id: tankId,
            temp: 0,
            do: 0,
            ph: 7.5,
            sal: 0,
            fish: 0,
            avgW: 0,
            feed: 0,
            mortality: 0,
          });
          idx = tanks.length - 1;
        }
        if (metric in tanks[idx]) {
          tanks[idx][metric] = num;
        }
        return { ...prev, tanks };
      }

      return prev;
    };

    const connectOnce = (mqtt, url) =>
      new Promise((resolve, reject) => {
        console.log("[MQTT] try:", url);
        setMqttStatus("connecting");

        const c = mqtt.connect(url, {
          protocol: "wss",
          protocolVersion: 4,
          clientId: "web_" + Math.random().toString(16).slice(2),
          clean: true,
          keepalive: 30,
          reconnectPeriod: 0,
          connectTimeout: 10_000,
          username: process.env.NEXT_PUBLIC_MQTT_USERNAME || undefined,
          password: process.env.NEXT_PUBLIC_MQTT_PASSWORD || undefined,
        });

        const cleanup = () => {
          c.removeAllListeners?.();
          try {
            c.end(true);
          } catch {}
        };

        c.on("connect", (pkt) => {
          if (cancelled) {
            cleanup();
            return;
          }
          console.log("[MQTT] connected:", url, pkt);
          setMqttStatus("connected");
          resolve(c);
        });

        c.on("error", (e) =>
          console.warn("[MQTT] error on", url, e?.message || e)
        );
        c.on("close", () => {
          if (mqttStatus !== "connected") {
            console.warn("[MQTT] closed before connected:", url);
            cleanup();
            reject(new Error("closed"));
          }
        });
        c.stream?.on?.("error", (e) =>
          console.warn("[MQTT WS stream error]", url, e?.message || e)
        );
      });

    const connectWithFallback = async (mqtt) => {
      for (const url of CANDIDATES) {
        try {
          const pathOk = /\/mqtt($|\?)/.test(new URL(url).pathname);
          if (!pathOk) {
            console.warn("[MQTT] invalid path (need /mqtt):", url);
            continue;
          }
          const c = await connectOnce(mqtt, url);
          return c;
        } catch (e) {
          console.warn("[MQTT] failed:", e?.message || e);
        }
      }
      throw new Error("all brokers failed");
    };

    (async () => {
      try {
        const mqtt = await waitMqtt();
        const c = await connectWithFallback(mqtt);
        client = c;
        clientRef.current = c;

        client.subscribe(
          ["farm/line1/env/#", "farm/line1/tanks/+/+", TOPIC_MODE],
          { qos: 0 },
          (err) => {
            if (err) console.error("[MQTT] subscribe error:", err);
            else console.log("[MQTT] subscribed topics");
          }
        );

        client.on("message", (topic, payload) => {
          if (cancelled) return;
          const text = payload.toString();
          setLastMsg(`${new Date().toLocaleTimeString()}  ${topic} = ${text}`);
          setData((prev) => apply(prev, topic, text));
        });

        client.on("close", () => !cancelled && setMqttStatus("disconnected"));
        client.on(
          "reconnect",
          () => !cancelled && setMqttStatus("reconnecting")
        );
        client.on("error", (e) => {
          console.error("[MQTT] runtime error:", e);
          !cancelled && setMqttStatus("error");
        });
      } catch (e) {
        console.error("[MQTT] init failed:", e?.message || e);
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

  // UI에서 호출할 퍼블리시(모드 전환) 함수
  const publishMode = (next /* 'flow' | 'ras' */) => {
    const c = clientRef.current;
    if (!c) return;
    try {
      c.publish(TOPIC_CMD_MODE, next, { qos: 0, retain: false }); // 명령 발행
      setData((p) => ({ ...p, mode: next })); // 낙관적 업데이트
    } catch (e) {
      console.warn("[MQTT] publishMode failed:", e?.message || e);
    }
  };

  return { data, mqttStatus, lastMsg, publishMode };
}

/* ================== 페이지 ================== */
export default function Page() {
  const { data: m, mqttStatus, lastMsg, publishMode } = useMqttLive();
  const [tankTab, setTankTab] = useState("A5");
  const [monitorTab, setMonitorTab] = useState("cctv");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 min-w-[1100px]">
      {/* MQTT 브라우저 번들 로드 (CDN) */}
      <Script
        src="https://unpkg.com/mqtt/dist/mqtt.min.js"
        strategy="afterInteractive"
      />

      {/* Top bar */}
      <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60 bg-slate-950/80 border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-sky-500/80" />
            <div className="font-semibold">하이브리드 육상 양식 시스템</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
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
              <span className="text-xs text-slate-400 hidden md:inline">
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

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-4">
        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
                메뉴
              </div>
              <nav className="flex flex-col gap-1">
                <Button variant="solid">
                  <Gauge className="w-4 h-4 mr-2" />
                  모니터링
                </Button>
                <Button variant="ghost">
                  <Server className="w-4 h-4 mr-2" />
                  통합제어
                </Button>
                <Button variant="ghost">
                  <BarChart2 className="w-4 h-4 mr-2" />
                  시뮬레이션
                </Button>
              </nav>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="col-span-12 lg:col-span-10 space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-12 gap-4 items-stretch">
            <div className="col-span-12 lg:col-span-6">
              <Section title="기상" className="h-full">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 justify-items-center">
                  <KPI label="조회" value={m.rain} unit="mm" Icon={CloudRain} />
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
                {/* 2 → 3 열로 변경하고 운영 모드 카드 추가 */}
                <div className="grid grid-cols-3 gap-3 h-full">
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

                  {/* 운영 모드 카드 */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-1 flex flex-col items-center justify-center">
                    <div className="text-xs text-slate-400 mb-1">운영 모드</div>
                    <div className="text-2x3 font-extrabold tracking-tight mb-">
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
                      {m.mode === "flow" ? "전환" : "전환"}
                    </Button>
                  </div>
                </div>
              </Section>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-2">
              <Section title="이상상황 알림" className="h-full">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-0 text-rose-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">임계치초과</span>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-1 rounded bg-rose-900/40 border border-rose-800">
                      3 건
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">통신이상</span>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-1 rounded bg-amber-900/40 border border-amber-800">
                      2 건
                    </span>
                  </div>
                </div>
              </Section>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-12 gap-4 items-stretch">
            <div className="col-span-12 lg:col-span-7">
              <Section title="양식장 계통도" className="h-full">
                <div className="grid grid-cols-3 gap-3 text-slate-300 text-sm">
                  {[
                    { name: "수중펌프 1", power: "150 마력" },
                    { name: "수중펌프 2", power: "150 마력" },
                    { name: "여과기 1", power: "75 마력" },
                    { name: "산소공급기 1", power: "75 마력" },
                    { name: "산소공급기 2", power: "75 마력" },
                    { name: "기포발생기 1", power: "75 마력" },
                  ].map((p, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-800 bg-slate-900/50"
                    >
                      <div className="p-3 space-y-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-slate-400">
                          전력 · 진동 · 유량
                        </div>
                        <div className="text-xs">{p.power}</div>
                      </div>
                    </div>
                  ))}
                  <div className="col-span-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
                    <div className="text-xs text-slate-400 mb-2">
                      유입수 · 센서
                    </div>
                    <div className="text-sm">수온, DO, pH, 염도</div>
                  </div>
                  <div className="col-span-3 grid grid-cols-2 gap-3">
                    {["수조 A5", "수조 F5"].map((n) => (
                      <div
                        key={n}
                        className="rounded-xl border border-slate-800 bg-slate-900/50"
                      >
                        <div className="p-3">
                          <div className="font-medium">{n}</div>
                          <div className="text-xs text-slate-400">
                            수온 · DO · pH
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <Section title="양식장 현황 정보" className="h-full">
                <div className="flex items-center justify-between mb-3">
                  <SimpleTabs
                    tabs={m.tanks.map((t) => ({
                      value: t.id,
                      label: `수조 ${t.id}`,
                    }))}
                    current={tankTab}
                    onChange={setTankTab}
                  />
                </div>
                {m.tanks
                  .filter((t) => t.id === tankTab)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="grid grid-cols-2 md:grid-cols-3 gap-3"
                    >
                      <KPI label="무게(평균개체)" value={t.avgW} unit="g" />
                      <KPI
                        label="개체수(추정)"
                        value={t.fish.toLocaleString()}
                        unit="마리"
                      />
                      <KPI label="폐사율" value={t.mortality} unit="%" />
                      <KPI label="사료 투입량" value={t.feed} unit="kg" />
                      <KPI label="수온" value={t.temp} unit="°C" />
                      <KPI label="용존산소" value={t.do} unit="mg/L" />
                      <KPI label="pH" value={t.ph} />
                      <KPI label="염도" value={t.sal} unit="PPT" />
                    </div>
                  ))}
              </Section>
            </div>
          </div>

          {/* Row 3 */}
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
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                <CCTV
                  title="1번 수조(실험군)"
                  src="https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=1200&auto=format&fit=crop"
                />
                <CCTV
                  title="1번 수조(실험군)"
                  src="https://images.unsplash.com/photo-1529694157871-446a0b9ded01?q=80&w=1200&auto=format&fit=crop"
                />
                <CCTV
                  title="2번 수조(실험군)"
                  src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1200&auto=format&fit=crop"
                />
              </div>
            ) : (
              <div className="text-sm text-slate-300 p-6 bg-slate-900/40 rounded-xl border border-slate-800">
                <p className="mb-2">여기에 실시간 차트를 붙이세요.</p>
                <ul className="list-disc pl-6 space-y-1 text-slate-400">
                  <li>React + (recharts / eCharts 등) 사용</li>
                  <li>MQTT WSS 구독 → 상태 저장 → 선그래프</li>
                  <li>최근 10분/1시간 스위치, 이상구간 하이라이트</li>
                </ul>
              </div>
            )}
          </Section>

          {/* Row 4 */}
          <Section title="임계값/제어">
            <ThresholdEditor />
          </Section>

          <div className="h-4" />
        </div>
      </div>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        © 2025 Aquaculture UI Mock (JS). Replace mock with MQTT live data.
      </footer>
    </div>
  );
}

/* ---------- 임계값 에디터 ---------- */
function ThresholdEditor() {
  const [temp, setTemp] = useState({ min: 20, max: 25 });
  const [ph, setPh] = useState({ min: 7.2, max: 7.8 });
  const [doMin, setDoMin] = useState(6.0);
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <Label>수온 범위 (°C)</Label>
        <div className="mt-1 flex gap-2">
          <Input
            value={temp.min}
            onChange={(e) =>
              setTemp((p) => ({ ...p, min: Number(e.target.value) }))
            }
          />
          <Input
            value={temp.max}
            onChange={(e) =>
              setTemp((p) => ({ ...p, max: Number(e.target.value) }))
            }
          />
        </div>
      </div>
      <div>
        <Label>pH 범위</Label>
        <div className="mt-1 flex gap-2">
          <Input
            value={ph.min}
            onChange={(e) =>
              setPh((p) => ({ ...p, min: Number(e.target.value) }))
            }
          />
          <Input
            value={ph.max}
            onChange={(e) =>
              setPh((p) => ({ ...p, max: Number(e.target.value) }))
            }
          />
        </div>
      </div>
      <div>
        <Label>용존산소 하한 (mg/L)</Label>
        <Input
          className="mt-1"
          value={doMin}
          onChange={(e) => setDoMin(Number(e.target.value))}
        />
      </div>
      <div className="col-span-3">
        <Button className="w-full">임계값 저장 (MQTT Retain)</Button>
      </div>
    </div>
  );
}
