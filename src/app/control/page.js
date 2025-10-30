"use client";

import React, { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RefreshCw,
  PlayCircle,
  PauseCircle,
  AlertTriangle,
  Thermometer,
  Beaker,
  ArrowRightLeft,
  Waves,
  Gauge,
  Server,
  BarChart2,
} from "lucide-react";

/* MQTT Topics */
const TOPIC_MODE = "farm/line1/mode";
const TOPIC_CMD_MODE = "farm/line1/cmd/mode";

/* 공용 UI */
const Section = ({ title, right, children, className = "" }) => (
  <div
    className={`rounded-xl border border-slate-800 bg-slate-900/30 text-slate-100 ${className}`}
  >
    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
      <div className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
        <span className="inline-block w-1.5 h-4 rounded-full bg-sky-400" />
        {title}
      </div>
      {right}
    </div>
    <div className="p-4">{children}</div>
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
    <span className={`text-xs px-2.5 py-1 rounded ${cls}`}>{children}</span>
  );
};

const Button = ({ children, onClick, variant = "solid", icon: Icon }) => {
  const base =
    "rounded-lg transition active:scale-[0.99] inline-flex items-center justify-center";
  const v =
    variant === "ghost"
      ? "text-slate-300 hover:text-white hover:bg-slate-800/60"
      : "bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700";
  return (
    <button onClick={onClick} className={`${base} ${v} h-10 px-4 text-[14px]`}>
      {Icon ? <Icon className="w-4 h-4 mr-2" /> : null}
      {children}
    </button>
  );
};

const NavButton = ({ href, icon: Icon, children }) => {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "rounded-lg border border-slate-700/60",
        "inline-flex items-center h-10 px-4 w-full justify-start text-[14px]",
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

const Step = ({ idx, text, active }) => (
  <div
    className={`rounded-lg border p-3 flex items-center gap-3 ${
      active
        ? "border-sky-500 bg-sky-900/20"
        : "border-slate-800 bg-slate-900/50"
    }`}
  >
    <div
      className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
        active ? "bg-sky-600" : "bg-slate-700"
      }`}
    >
      {idx}
    </div>
    <div className="text-[14px]">{text}</div>
  </div>
);

/* MQTT Hook */
function useMqtt() {
  const [mode, setMode] = useState("flow");
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
          else if (n++ > 100) rej(new Error("mqtt load timeout"));
          else setTimeout(poll, 50);
        })();
      });

    const urls = [
      (process.env.NEXT_PUBLIC_MQTT_URL || "").trim(),
      "wss://mqtt.eclipseprojects.io:443/mqtt",
      "wss://broker.emqx.io:8084/mqtt",
    ].filter(Boolean);

    const connectOnce = (mqtt, url) =>
      new Promise((resolve, reject) => {
        setMqttStatus("connecting");
        const c = mqtt.connect(url, {
          protocol: "wss",
          clientId: "web_" + Math.random().toString(16).slice(2),
          keepalive: 30,
          clean: true,
        });
        c.on("connect", () => {
          if (cancelled) return;
          setMqttStatus("connected");
          resolve(c);
        });
        c.on("close", () => reject());
      });

    (async () => {
      try {
        const mqtt = await waitMqtt();
        for (const url of urls) {
          try {
            client = await connectOnce(mqtt, url);
            break;
          } catch {}
        }
        if (!client) throw new Error("connect fail");
        clientRef.current = client;
        client.subscribe([TOPIC_MODE]);
        client.on("message", (topic, payload) => {
          const msg = payload.toString();
          setLastMsg(`${new Date().toLocaleTimeString()} ${topic}=${msg}`);
          if (topic === TOPIC_MODE) {
            const v = msg.trim().toLowerCase();
            if (v === "flow" || v === "ras") setMode(v);
          }
        });
      } catch {
        setMqttStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        client?.end(true);
      } catch {}
    };
  }, []);

  const publishMode = (next) => {
    const c = clientRef.current;
    if (!c) return;
    try {
      c.publish(TOPIC_CMD_MODE, next);
      setMode(next);
    } catch {}
  };

  return { mode, mqttStatus, lastMsg, publishMode };
}

/* 메인 페이지 */
export default function ControlPage() {
  const { mode, mqttStatus, lastMsg, publishMode } = useMqtt();
  const isFlow = mode === "flow";
  const isRas = mode === "ras";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <Script
        src="https://unpkg.com/mqtt/dist/mqtt.min.js"
        strategy="afterInteractive"
      />

      {/* 상단바 */}
      <div className="sticky top-0 z-30 backdrop-blur bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-[2000px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-sky-500/80" />
            <div className="text-[15px] font-bold">
              하이브리드 육상 양식 시스템
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone={mqttStatus === "connected" ? "live" : "warn"}>
              MQTT: {mqttStatus}
            </Chip>
            <Chip tone={isFlow ? "sky" : "live"}>
              현재 모드: {isFlow ? "유수식 (FLOW)" : "RAS"}
            </Chip>
            <Chip tone="sky">AQUA.NEXT</Chip>
            <Chip tone="sky">호남대학교 캡스톤 디자인</Chip>
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
                <NavButton href="/sim" icon={BarChart2}>
                  시뮬레이션
                </NavButton>
              </nav>
            </div>
          </div>
        </div>

        {/* 메인 컨텐츠 */}
        <main className="col-span-12 lg:col-span-10">
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 lg:col-span-4">
              <Section
                title="모드 전환"
                right={<Chip tone="secondary">{TOPIC_CMD_MODE}</Chip>}
              >
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                    <div className="text-sm text-slate-400 mb-1">현재</div>
                    <div className="text-2xl font-bold mb-3">
                      {isFlow ? "유수식 FLOW" : "RAS 시스템"}
                    </div>
                    <div className="flex gap-2">
                      {isFlow ? (
                        <Button
                          icon={PauseCircle}
                          onClick={() => publishMode("ras")}
                        >
                          RAS로 전환
                        </Button>
                      ) : (
                        <Button
                          icon={PlayCircle}
                          onClick={() => publishMode("flow")}
                        >
                          유수식 재시작
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        icon={RefreshCw}
                        onClick={() => publishMode(isFlow ? "ras" : "flow")}
                      >
                        전환 트리거
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                    <div className="text-sm font-semibold flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-300" />
                      전환 트리거(자동)
                    </div>
                    <div className="text-sm text-slate-300 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Beaker className="w-4 h-4 text-rose-300" />
                        <span>pH 농도 초과</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Thermometer className="w-4 h-4 text-rose-300" />
                        <span>수온 초과</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      기준치 초과 감지 → <b>유수식 중단</b> →{" "}
                      <b>여과 장치 가동</b> → <b>RAS 발동</b>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="col-span-12 lg:col-span-8 space-y-5">
              <Section
                title="유수식 운영 시퀀스 (기본)"
                right={
                  <Chip tone={isFlow ? "live" : "secondary"}>
                    {isFlow ? "활성" : "대기"}
                  </Chip>
                }
              >
                <div className="grid md:grid-cols-2 gap-3">
                  <Step idx={1} text="바다수조 → 양식수조 1" active={isFlow} />
                  <Step
                    idx={2}
                    text="양식수조 1 → 양식수조 2"
                    active={isFlow}
                  />
                  <Step
                    idx={3}
                    text="양식수조 2 → 양식수조 3"
                    active={isFlow}
                  />
                  <Step
                    idx={4}
                    text="양식수조 3 → 바다수조 (순환 완료)"
                    active={isFlow}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                  <Waves className="w-4 h-4" />
                  기본 모드에서는 위 경로로 물이 순환합니다.
                </div>
              </Section>

              <Section
                title="RAS 시스템 시퀀스"
                right={
                  <Chip tone={isRas ? "live" : "secondary"}>
                    {isRas ? "활성" : "대기"}
                  </Chip>
                }
              >
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 mb-3 text-sm text-slate-300">
                  <div className="font-semibold mb-1.5">
                    유수식 → RAS 전환 시 자동 동작
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-slate-400">
                    <li>
                      바다수조 → 양식수조1 <b>유입 중단</b>
                    </li>
                    <li>
                      양식수조3 → 바다수조 <b>배출 중단</b>
                    </li>
                  </ul>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Step
                    idx={1}
                    text="여과기 ON, 양식수조 3 물 흡입"
                    active={isRas}
                  />
                  <Step idx={2} text="산소공급 → pH 처리" active={isRas} />
                  <Step
                    idx={3}
                    text="(정화수) 양식수조 1 → 2 → 3"
                    active={isRas}
                  />
                  <Step
                    idx={4}
                    text="여과기로 복귀 (순환 유지)"
                    active={isRas}
                  />
                </div>
                <div className="mt-3 rounded-lg border border-emerald-800 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                  <div className="font-semibold mb-1">복귀 조건</div>
                  pH/수온이 기준치 내로 복귀하면 → <b>유수식 재시작</b>{" "}
                  (여과시스템 중단)
                </div>
              </Section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
