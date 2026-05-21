import React, { useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Search, Settings, Trash2 } from "lucide-react";

function MemoIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="#FFFDF8" stroke="#D9D4CE" strokeWidth="0.8" />
      <rect x="2" y="2" width="12" height="3.2" rx="2.2" fill="#FFD85C" />
      <circle cx="5" cy="7.5" r="0.7" fill="#FF8FA3" />
      <circle cx="5" cy="10" r="0.7" fill="#7EA6FF" />
      <path d="M6.5 7.5H10.5" stroke="#FF8FA3" strokeWidth="1" strokeLinecap="round" />
      <path d="M6.5 10H10" stroke="#7EA6FF" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.5 9.5L9.5 6.5" stroke="#B87CFF" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.8 4.5L8.2 3.1C9.2 2.1 10.8 2.1 11.8 3.1C12.8 4.1 12.8 5.7 11.8 6.7L10.4 8.1" stroke="#56B7FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.2 11.5L7.8 12.9C6.8 13.9 5.2 13.9 4.2 12.9C3.2 11.9 3.2 10.3 4.2 9.3L5.6 7.9" stroke="#FF6FA0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STORAGE_KEY = "xl-calendar-app-v2-live-functions";
const DRIVE_FILE_NAME = "xl-calendar-data.json";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const APP_VERSION = "1.0.2";
const DRIVE_TOKEN_STORAGE_KEY = "xl-google-drive-token";
const DEFAULT_UPDATE_INFO_URL = "https://raw.githubusercontent.com/tea90g/xl-calendar-update/main/latest.json";
const pad = (n) => String(n).padStart(2, "0");
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (dateKey, amount) => {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + amount);
  return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const addMonthsSafe = (dateKey, amount) => {
  const base = new Date(`${dateKey}T00:00:00`);
  const d = new Date(base);
  d.setMonth(base.getMonth() + amount);
  if (d.getDate() !== base.getDate()) return null;
  return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const cx = (...v) => v.filter(Boolean).join(" ");

declare global {
  interface Window {
    __XL_GOOGLE_AUTH__?: (payload: { clientId: string; clientSecret?: string; scope: string }) => Promise<{ ok?: boolean; access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error?: string }>;
    __XL_GET_ACTIVE_PROGRAM_DETAIL__?: () => Promise<{ processName?: string; title?: string; label?: string }>;
    __XL_STATE__?: {
      saveCalendarState?: (data: unknown) => Promise<void>;
      loadCalendarState?: () => Promise<unknown>;
    };
    __XL_AUTO_LAUNCH__?: {
      get?: () => Promise<boolean>;
      set?: (enabled: boolean) => Promise<boolean>;
    };
    electron?: {
      saveCalendarState?: (data: unknown) => Promise<void>;
      loadCalendarState?: () => Promise<unknown>;
    };
  }
}


const DEFAULT_CATEGORIES = [
  { id: "trpg", label: "TRPG", color: "#cfeaed" },
  { id: "deadline", label: "마감", color: "#f3d7dd" },
  { id: "outing", label: "외출", color: "#f4ebc9" },
  { id: "etc", label: "기타", color: "#e4e7ec" },
];

const HIDDEN_CATEGORIES = {
  routine: { id: "routine", label: "MONTHLY ROUTINE", color: "#e4e7ec" },
  "kr-holiday": { id: "kr-holiday", label: "한국 공휴일", color: "#f8d7df" },
  holiday: { id: "holiday", label: "일본 祝日", color: "#e5def8" },
};

const COLOR_POOL = ["#cfeaed", "#f3d7dd", "#f4ebc9", "#d9d2ea", "#dbe7d3", "#d6e5f3", "#f1ddd2", "#d8dde7"];

const ANNIVERSARY_COLORS = [
  { id: "cream", label: "크림", color: "#F4ECE7", tape: "rgba(255,255,255,0.82)", heart: "#DDB9A5" },
  { id: "pink", label: "핑크", color: "#F5E5E7", tape: "rgba(255,255,255,0.82)", heart: "#DCAEB8" },
  { id: "sky", label: "하늘", color: "#E7EEF5", tape: "rgba(255,255,255,0.82)", heart: "#AFC4D8" },
  { id: "lavender", label: "보라", color: "#ECE8F5", tape: "rgba(255,255,255,0.82)", heart: "#C5B8DF" },
  { id: "mint", label: "민트", color: "#E8F1EC", tape: "rgba(255,255,255,0.82)", heart: "#B7CEC1" },
  { id: "beige", label: "베이지", color: "#EEE5D9", tape: "rgba(255,255,255,0.82)", heart: "#CFB99F" },
  { id: "gray", label: "그레이", color: "#E9E9E9", tape: "rgba(255,255,255,0.82)", heart: "#BDBDBD" },
];

const getAnniversaryColor = (id) => ANNIVERSARY_COLORS.find((c) => c.id === id) || ANNIVERSARY_COLORS[0];

const getAnniversaryPalette = (item = {}) => {
  const base = getAnniversaryColor(item.colorId);
  const custom = String(item.customColor || "").trim();
  if (!custom) return base;
  return {
    ...base,
    color: custom,
    tape: custom,
    heart: custom,
  };
};

const KR_HOLIDAYS = {
  2025: [["2025-01-01", "새해첫날"], ["2025-03-01", "삼일절"], ["2025-05-05", "어린이날"], ["2025-06-06", "현충일"], ["2025-08-15", "광복절"], ["2025-10-03", "개천절"], ["2025-10-09", "한글날"], ["2025-12-25", "크리스마스"]],
  2026: [["2026-01-01", "새해첫날"], ["2026-02-16", "설날 연휴"], ["2026-02-17", "설날"], ["2026-02-18", "설날 연휴"], ["2026-03-01", "삼일절"], ["2026-03-02", "삼일절 대체공휴일"], ["2026-05-05", "어린이날"], ["2026-05-24", "부처님오신날"], ["2026-05-25", "부처님오신날 대체공휴일"], ["2026-06-03", "지방선거일"], ["2026-06-06", "현충일"], ["2026-08-15", "광복절"], ["2026-08-17", "광복절 대체공휴일"], ["2026-10-03", "개천절"], ["2026-10-05", "개천절 대체공휴일"], ["2026-10-09", "한글날"], ["2026-12-25", "크리스마스"]],
  2027: [["2027-01-01", "새해첫날"], ["2027-02-06", "설날"], ["2027-02-08", "설날 연휴"], ["2027-03-01", "삼일절"], ["2027-05-05", "어린이날"], ["2027-05-13", "부처님오신날"], ["2027-06-06", "현충일"], ["2027-08-15", "광복절"], ["2027-10-03", "개천절"], ["2027-10-09", "한글날"], ["2027-12-25", "크리스마스"]],
  2028: [["2028-01-01", "새해첫날"], ["2028-01-26", "설날"], ["2028-01-27", "설날 연휴"], ["2028-03-01", "삼일절"], ["2028-05-02", "부처님오신날"], ["2028-05-05", "어린이날"], ["2028-06-06", "현충일"], ["2028-08-15", "광복절"], ["2028-10-03", "개천절"], ["2028-10-09", "한글날"], ["2028-12-25", "크리스마스"]],
  2029: [["2029-01-01", "새해첫날"], ["2029-02-13", "설날"], ["2029-02-14", "설날 연휴"], ["2029-03-01", "삼일절"], ["2029-05-05", "어린이날"], ["2029-05-20", "부처님오신날"], ["2029-06-06", "현충일"], ["2029-08-15", "광복절"], ["2029-10-03", "개천절"], ["2029-10-09", "한글날"], ["2029-12-25", "크리스마스"]],
  2030: [["2030-01-01", "새해첫날"], ["2030-02-05", "설날"], ["2030-03-01", "삼일절"], ["2030-05-05", "어린이날"], ["2030-05-09", "부처님오신날"], ["2030-06-06", "현충일"], ["2030-08-15", "광복절"], ["2030-10-03", "개천절"], ["2030-10-09", "한글날"], ["2030-12-25", "크리스마스"]],
};

const JP_HOLIDAYS = {
  2025: [["2025-01-01", "元日"], ["2025-01-13", "成人の日"], ["2025-02-11", "建国記念の日"], ["2025-02-23", "天皇誕生日"], ["2025-03-20", "春分の日"], ["2025-04-29", "昭和の日"], ["2025-05-03", "憲法記念日"], ["2025-05-04", "みどりの日"], ["2025-05-05", "こどもの日"], ["2025-07-21", "海の日"], ["2025-08-11", "山の日"], ["2025-09-15", "敬老の日"], ["2025-09-23", "秋分の日"], ["2025-10-13", "スポーツの日"], ["2025-11-03", "文化の日"], ["2025-11-23", "勤労感謝の日"]],
  2026: [["2026-01-01", "元日"], ["2026-01-12", "成人の日"], ["2026-02-11", "建国記念の日"], ["2026-02-23", "天皇誕生日"], ["2026-03-20", "春分の日"], ["2026-04-29", "昭和の日"], ["2026-05-03", "憲法記念日"], ["2026-05-04", "みどりの日"], ["2026-05-05", "こどもの日"], ["2026-07-20", "海の日"], ["2026-08-11", "山の日"], ["2026-09-21", "敬老の日"], ["2026-09-23", "秋分の日"], ["2026-10-12", "スポーツの日"], ["2026-11-03", "文化の日"], ["2026-11-23", "勤労感謝の日"]],
  2027: [["2027-01-01", "元日"], ["2027-01-11", "成人の日"], ["2027-02-11", "建国記念の日"], ["2027-02-23", "天皇誕生日"], ["2027-03-21", "春分の日"], ["2027-04-29", "昭和の日"], ["2027-05-03", "憲法記念日"], ["2027-05-04", "みどりの日"], ["2027-05-05", "こどもの日"], ["2027-07-19", "海の日"], ["2027-08-11", "山の日"], ["2027-09-20", "敬老の日"], ["2027-09-23", "秋分の日"], ["2027-10-11", "スポーツの日"], ["2027-11-03", "文化の日"], ["2027-11-23", "勤労感謝の日"]],
  2028: [["2028-01-01", "元日"], ["2028-01-10", "成人の日"], ["2028-02-11", "建国記念の日"], ["2028-02-23", "天皇誕生日"], ["2028-03-20", "春分の日"], ["2028-04-29", "昭和の日"], ["2028-05-03", "憲法記念日"], ["2028-05-04", "みどりの日"], ["2028-05-05", "こどもの日"], ["2028-07-17", "海の日"], ["2028-08-11", "山の日"], ["2028-09-18", "敬老の日"], ["2028-09-22", "秋分の日"], ["2028-10-09", "スポーツの日"], ["2028-11-03", "文化の日"], ["2028-11-23", "勤労感謝の日"]],
  2029: [["2029-01-08", "成人の日"], ["2029-02-11", "建国記念の日"], ["2029-02-23", "天皇誕生日"], ["2029-03-20", "春分の日"], ["2029-04-29", "昭和の日"], ["2029-05-03", "憲法記念日"], ["2029-05-04", "みどりの日"], ["2029-05-05", "こどもの日"], ["2029-07-16", "海の日"], ["2029-08-11", "山の日"], ["2029-09-17", "敬老の日"], ["2029-09-23", "秋分の日"], ["2029-10-08", "スポーツの日"], ["2029-11-03", "文化の日"], ["2029-11-23", "勤労感謝の日"]],
  2030: [["2030-01-14", "成人の日"], ["2030-02-11", "建国記念の日"], ["2030-02-23", "天皇誕生日"], ["2030-03-20", "春分の日"], ["2030-04-29", "昭和の日"], ["2030-05-03", "憲法記念日"], ["2030-05-04", "みどりの日"], ["2030-05-05", "こどもの日"], ["2030-07-15", "海の日"], ["2030-08-11", "山の日"], ["2030-09-16", "敬老の日"], ["2030-09-23", "秋分の日"], ["2030-10-14", "スポーツの日"], ["2030-11-03", "文化の日"], ["2030-11-23", "勤労感謝の日"]],
};

const STARTER_EVENTS = [
  ["2025-10-01", "원고 콘티", "", "etc"], ["2025-10-01", "수정", "", "etc"],
  ["2025-10-03", "석가탄신일", "", "deadline"], ["2025-10-03", "憲法記念日", "", "deadline"],
  ["2025-10-04", "대체공휴일", "", "deadline"], ["2025-10-04", "みどりの日", "", "deadline"],
  ["2025-10-05", "어린이날", "", "jp"], ["2025-10-05", "선물 체크", "", "jp"],
  ["2025-10-06", "振替休日", "", "outing"], ["2025-10-07", "릴리스 작업\n(3p~5p)", "", "outing"],
  ["2025-10-08", "TRPG 세션", "19:00", "trpg"], ["2025-10-08", "외출\n저녁 약속", "", "jp"], ["2025-10-08", "원고 마감", "", "deadline"], ["2025-10-08", "콘티 회의", "13:00", "deadline"], ["2025-10-08", "회의", "10:00", "jp"],
  ["2025-10-11", "상품 발주\n(재료 확인)", "", "jp"], ["2025-10-14", "인터뷰", "14:00", "deadline"],
  ["2025-10-19", "외출", "", "jp"], ["2025-10-19", "친구 만나기", "", "jp"], ["2025-10-19", "저녁 약속", "", "jp"],
  ["2025-10-25", "TRPG 세션", "", "trpg"], ["2025-10-25", "시나리오 테스트\n(밤 9시~)", "", "trpg"],
  ["2025-10-28", "최종 검수", "", "deadline"], ["2025-10-31", "바다의 날", "", "outing"], ["2025-10-31", "海の日", "", "outing"], ["2025-11-05", "端午の節句", "", "outing"],
].map(([date, title, startTime, categoryId], sortOrder) => ({ id: uid(), date, title, startTime, categoryId, memo: "", url: "", repeatRule: "none", sortOrder }));

const STARTER_TODOS = [
  { id: uid(), text: "원고 마감", done: true, fixed: true, day: 5 },
  { id: uid(), text: "회의 자료 정리", done: false, fixed: true, day: 10 },
  { id: uid(), text: "택배 보내기", done: true, fixed: true, day: 15 },
];

function starterState() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    events: STARTER_EVENTS,
    todos: STARTER_TODOS,
    routineDoneByMonth: {},
    categories: DEFAULT_CATEGORIES,
    image: null,
    anniversaries: [],
    showAnniversaryPanel: true,
    timerImages: { work: "", other: "", away: "" },
    selectedImageSlot: "work",
    fixedImageMode: false,
    showJapanHolidays: true,
    showFixedList: true,
    showTodayList: true,
    showTimerBar: true,
    searchText: "",
    filterCategoryId: "all",
    workSeconds: 0,
    otherSeconds: 0,
    awaySeconds: 0,
    trackedPrograms: [],
    driveClientId: "",
    driveClientSecret: "",
    driveAutoSync: false,
    driveLastSyncedAt: "",
    updateLastCheckedAt: "",
    updateDismissedVersion: "",
    autoLaunchOnStartup: false,
  };
}

function getElectronStateApi() {
  if (typeof window === "undefined") return null;
  return window.electron || window.__XL_STATE__ || null;
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...starterState(), ...JSON.parse(raw), workSeconds: 0, otherSeconds: 0, awaySeconds: 0 } : starterState();
  } catch {
    return starterState();
  }
}

function buildCalendar(year, month) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), key: makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate()), current: d.getMonth() + 1 === month, dow: d.getDay() };
  });
}

async function getActiveProgramName() {
  if (typeof window === "undefined") return "";

  if (typeof window.__XL_GET_ACTIVE_PROGRAM__ === "function") {
    const value = await window.__XL_GET_ACTIVE_PROGRAM__();
    return String(value || "").trim();
  }

  return "";
}

function normalizeProgramName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.exe\b/g, "")
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龥]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactProgramName(value) {
  return normalizeProgramName(value).replace(/\s+/g, "");
}

function isTrackedProgram(activeProgram, trackedPrograms = []) {
  const active = normalizeProgramName(activeProgram);
  const activeCompact = compactProgramName(activeProgram);

  if (!active && !activeCompact) return false;

  return trackedPrograms.some((program) => {
    const target = normalizeProgramName(program);
    const targetCompact = compactProgramName(program);

    if (!target && !targetCompact) return false;

    return (
      active === target ||
      activeCompact === targetCompact ||
      active.includes(target) ||
      target.includes(active) ||
      activeCompact.includes(targetCompact) ||
      targetCompact.includes(activeCompact)
    );
  });
}

function isIgnoredTrackingProgram(value) {
  const name = normalizeProgramName(value);
  if (!name) return true;

  const ignored = [
    "xl calendar",
    "calendar clone app",
    "electron",
    "powershell",
    "pwsh",
    "cmd",
    "conhost",
    "windowsterminal",
    "windows terminal",
    "applicationframehost",
    "explorer",
  ];

  return ignored.some((item) => name === item || name.includes(item));
}

function compareVersion(a, b) {
  const aa = String(a || "0").split(".").map((x) => Number(x) || 0);
  const bb = String(b || "0").split(".").map((x) => Number(x) || 0);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    if ((aa[i] || 0) > (bb[i] || 0)) return 1;
    if ((aa[i] || 0) < (bb[i] || 0)) return -1;
  }
  return 0;
}

function fmtTime(sec) {  const safe = Math.max(0, Math.floor(sec || 0));
  return `${pad(Math.floor(safe / 3600))}:${pad(Math.floor((safe % 3600) / 60))}:${pad(safe % 60)}`;
}

function parseDateKey(dateKey) {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split("-").map((v) => Number(v));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getAnniversaryInfo(item, baseKey = null) {
  const sourceDate = parseDateKey(item?.date);
  if (!sourceDate) return null;

  const base = baseKey ? parseDateKey(baseKey) : new Date();
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const origin = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
  const diff = Math.round((today.getTime() - origin.getTime()) / 86400000);
  const abs = Math.abs(diff);

  return {
    ...item,
    targetKey: makeDate(origin.getFullYear(), origin.getMonth() + 1, origin.getDate()),
    dateDisplay: `${origin.getFullYear()}/${pad(origin.getMonth() + 1)}/${pad(origin.getDate())}`,
    diff,
    label: diff === 0 ? "D-DAY" : diff > 0 ? `D+${abs}` : `D-${abs}`,
  };
}

function addYearsSafe(dateKey, amount) {
  const base = parseDateKey(dateKey);
  if (!base) return null;
  const d = new Date(base);
  d.setFullYear(base.getFullYear() + amount);
  if (d.getMonth() !== base.getMonth() || d.getDate() !== base.getDate()) return null;
  return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function pushAnniversaryMark(map, key, mark) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(mark);
}

function repeatCopies(event, year, month) {
  if (!event.repeatRule || event.repeatRule === "none") return [];
  const excluded = Array.isArray(event.excludedDates) ? event.excludedDates : [];
  const untilKey = event.repeatUntil || "";
  const list = [];
  for (let i = 1; i <= 36; i += 1) {
    let key = null;
    if (event.repeatRule === "weekly") key = addDays(event.date, i * 7);
    if (event.repeatRule === "monthly") key = addMonthsSafe(event.date, i);
    if (!key) continue;
    if (untilKey && key > untilKey) break;
    if (excluded.includes(key)) continue;
    const d = new Date(`${key}T00:00:00`);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      list.push({ ...event, id: `gen-${event.id}-${key}`, baseEventId: event.id, baseRepeatId: event.baseRepeatId || event.id, date: key, isGenerated: true });
    }
  }
  return list;
}


function getEventContinuousKey(ev) {
  if (!ev || ev.isRoutine || ev.isHoliday) return "";
  const groupId = ev.repeatGroupId || ev.cloneGroupId || ev.baseRepeatId || ev.baseEventId || "";
  const contentKey = [
    String(ev.title || "").trim(),
    String(ev.startTime || "").trim(),
    String(ev.categoryId || "").trim(),
    String(ev.memo || "").trim(),
    String(ev.url || "").trim(),
  ].join("||");
  // Same repeated/cloned group should only merge visually while its visible contents still match.
  // If one middle date is edited, contentKey changes and it splits out as its own card.
  return groupId ? `group:${groupId}::${contentKey}` : `content:${contentKey}`;
}

function isNextDateKey(a, b) {
  return addDays(a, 1) === b;
}

function sortEvent(a, b) {
  const al = Number.isFinite(Number(a._displayLane)) ? Number(a._displayLane) : null;
  const bl = Number.isFinite(Number(b._displayLane)) ? Number(b._displayLane) : null;
  if (al !== null || bl !== null) {
    if (al === null) return 1;
    if (bl === null) return -1;
    if (al !== bl) return al - bl;
  }
  if (a.isContinuousPlaceholder && !b.isContinuousPlaceholder) return -1;
  if (!a.isContinuousPlaceholder && b.isContinuousPlaceholder) return 1;
  if (a.isRoutine && !b.isRoutine) return -1;
  if (!a.isRoutine && b.isRoutine) return 1;
  const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 9999;
  const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 9999;
  if (ao !== bo) return ao - bo;
  if (a.startTime && b.startTime && a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
  if (a.startTime && !b.startTime) return -1;
  if (!a.startTime && b.startTime) return 1;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function Modal({ children, size = "w-[390px]" }) {
  return <div style={{ zIndex: 100000 }} className="fixed inset-0 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && e.stopPropagation()}><div className={`${size} relative z-[1] overflow-hidden rounded-[16px] border border-[#e6e6e6] bg-[#fcfcfc] shadow-[0_18px_60px_rgba(0,0,0,0.14)]`}>{children}</div></div>;
}

function ModalHead({ title, sub, onClose }) {
  return <div className="flex items-center justify-between border-b border-dashed border-[#e8e8e8] px-5 py-4"><div><div className="text-[8px] uppercase tracking-[0.22em] text-neutral-300">{sub}</div><div className="mt-1 text-[20px] font-black tracking-[-0.04em] text-[#333]">{title}</div></div><button onClick={onClose} className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1 text-[11px] text-neutral-400">닫기</button></div>;
}

export default function App() {
  const [state, setState] = useState(readState);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [draft, setDraft] = useState({ title: "", startTime: "", categoryId: "etc", memo: "", url: "", repeatRule: "none", repeatUntil: "", rangeStart: "", rangeEnd: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileDriveSettingsOpen, setMobileDriveSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState([]);
  const [imageOpen, setImageOpen] = useState(false);
  const [anniversaryOpen, setAnniversaryOpen] = useState(false);
  const [anniversaryDrafts, setAnniversaryDrafts] = useState([]);
  const [todoAddTarget, setTodoAddTarget] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null);
  const [todoDraft, setTodoDraft] = useState({ text: "", day: 1 });
  const [todoDrafts, setTodoDrafts] = useState([]);
  const todayTodoCleanupRef = useRef(false);
  const [historyStack, setHistoryStack] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const [copyMode, setCopyMode] = useState(false);
  const [driveToken, setDriveToken] = useState(() => {
    try {
      return localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [driveStatus, setDriveStatus] = useState("Google Drive 미연결");
  const [updateStatus, setUpdateStatus] = useState("업데이트 미확인");
  const [backupFiles, setBackupFiles] = useState([]);
  const [backupOpen, setBackupOpen] = useState(false);
  const [activeProgramDebug, setActiveProgramDebug] = useState("");
  const imageRef = useRef(null);
  const idleRef = useRef(Date.now());
  const driveAutoPullRef = useRef(false);
  const driveLastRemoteModifiedRef = useRef("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const electronAPI = getElectronStateApi();
    if (!electronAPI?.saveCalendarState) return;

    const timer = window.setTimeout(() => {
      electronAPI.saveCalendarState({
        ...state,
        workSeconds: 0,
        otherSeconds: 0,
        awaySeconds: 0,
        savedAt: new Date().toISOString(),
      }).catch((err) => console.error("[XL Calendar] renderer save failed", err));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [state.events, state.todos, state.routineDoneByMonth, state.categories, state.image, state.anniversaries, state.showAnniversaryPanel, state.timerImages, state.selectedImageSlot, state.fixedImageMode, state.showJapanHolidays, state.showFixedList, state.showTodayList, state.showTimerBar, state.searchText, state.filterCategoryId, state.year, state.month]);

  useEffect(() => {
    if (todayTodoCleanupRef.current) return;
    todayTodoCleanupRef.current = true;

    setState((s) => {
      const todos = Array.isArray(s.todos) ? s.todos : [];
      const cleanedTodos = todos.filter((todo) => Boolean(todo.fixed) || !todo.done);
      if (cleanedTodos.length === todos.length) return s;
      return { ...s, todos: cleanedTodos };
    });
  }, []);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
      if (savedToken) {
        setDriveToken(savedToken);
        setDriveStatus("Google Drive 자동 연결됨");
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const electronAPI = getElectronStateApi();

    async function loadInitialElectronState() {
      if (!electronAPI?.loadCalendarState) return;
      if (localStorage.getItem(STORAGE_KEY)) return;

      try {
        const loaded = await electronAPI.loadCalendarState();
        const loadedState = loaded?.state || loaded;

        if (!cancelled && loadedState && typeof loadedState === "object") {
          setState(() => ({
            ...starterState(),
            ...loadedState,
            workSeconds: 0,
            otherSeconds: 0,
            awaySeconds: 0,
          }));
        }
      } catch {
        // localStorage/starterState fallback is already active.
      }
    }

    loadInitialElectronState();

    return () => {
      cancelled = true;
    };
  }, []);


  const makeSyncSnapshot = (source = state) => ({
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      ...source,
      workSeconds: 0,
      otherSeconds: 0,
      awaySeconds: 0,
      driveLastSyncedAt: source.driveLastSyncedAt || "",
    },
  });

  const ensureScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  async function connectGoogleDrive() {
    const clientId = String(state.driveClientId || "").trim();
    const clientSecret = String(state.driveClientSecret || "").trim();
    if (!clientId) {
      alert("설정에서 Google OAuth Client ID를 먼저 입력해줘.");
      return;
    }

    try {
      setDriveStatus("Google 로그인 준비 중...");

      if (typeof window.__XL_GOOGLE_AUTH__ === "function") {
        const res = await window.__XL_GOOGLE_AUTH__({
          clientId,
          clientSecret,
          scope: DRIVE_SCOPE,
        });

        if (res?.ok && res?.access_token) {
          setDriveToken(res.access_token);
          try { localStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, res.access_token); } catch {}
          setDriveStatus("Google Drive 연결됨");
          return;
        }

        setDriveStatus(res?.error ? `Google Drive 연결 실패: ${res.error}` : "Google Drive 연결 실패");
        return;
      }

      await ensureScript("https://accounts.google.com/gsi/client");
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (res) => {
          if (res?.access_token) {
            setDriveToken(res.access_token);
            try { localStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, res.access_token); } catch {}
            setDriveStatus("Google Drive 연결됨");
          } else {
            setDriveStatus("Google Drive 연결 실패");
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch {
      setDriveStatus("Google Drive 연결 실패");
    }
  }

  async function driveRequest(path, options = {}) {
    if (!driveToken) throw new Error("Google Drive가 연결되어 있지 않아요.");
    const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${driveToken}`, ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(await res.text());
    return res;
  }

  async function findDriveFile() {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
    const res = await driveRequest(`/files?q=${q}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`);
    const data = await res.json();
    return data.files?.[0] || null;
  }

  async function getDriveFileMetadata() {
    const file = await findDriveFile();
    return file || null;
  }

  async function saveToGoogleDrive(nextState = state) {
    try {
      setDriveStatus("Google Drive 저장 중...");
      const file = await findDriveFile();
      const metadata = file
        ? { name: DRIVE_FILE_NAME }
        : { name: DRIVE_FILE_NAME, parents: ["appDataFolder"] };
      const payload = new Blob([JSON.stringify(makeSyncSnapshot(nextState), null, 2)], { type: "application/json" });
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", payload);
      const url = file
        ? `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart&fields=id,name,modifiedTime`
        : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime";
      const method = file ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${driveToken}` }, body: form });
      if (!res.ok) throw new Error(await res.text());

      let now = new Date().toISOString();
      try {
        const updated = await res.json();
        if (updated?.modifiedTime) now = updated.modifiedTime;
      } catch {}

      driveLastRemoteModifiedRef.current = now;
      setState((s) => ({ ...s, driveLastSyncedAt: now }));
      setDriveStatus("Google Drive 저장 완료");
    } catch (err) {
      const message = err?.message ? String(err.message) : "알 수 없는 오류";
      console.error("[XL Calendar] Google Drive save failed", err);
      setDriveStatus(`Google Drive 저장 실패: ${message.slice(0, 160)}`);
    }
  }

  async function loadFromGoogleDrive() {
    try {
      setDriveStatus("Google Drive 불러오는 중...");
      const file = await findDriveFile();
      if (!file) {
        setDriveStatus("Google Drive에 저장된 데이터 없음");
        return;
      }
      const res = await driveRequest(`/files/${file.id}?alt=media`);
      const data = await res.json();
      const loaded = data.state || data;
      const syncedAt = file.modifiedTime || new Date().toISOString();
      driveLastRemoteModifiedRef.current = syncedAt;
      setState((s) => ({ ...starterState(), ...s, ...loaded, driveClientId: s.driveClientId, driveClientSecret: s.driveClientSecret, driveLastSyncedAt: syncedAt }));
      setDriveStatus("Google Drive 불러오기 완료");
    } catch {
      setDriveStatus("Google Drive 불러오기 실패");
    }
  }

  const syncPayload = useMemo(() => JSON.stringify({
    events: state.events,
    todos: state.todos,
    routineDoneByMonth: state.routineDoneByMonth,
    categories: state.categories,
    image: state.image,
    anniversaries: state.anniversaries,
    showAnniversaryPanel: state.showAnniversaryPanel,
    timerImages: state.timerImages,
    selectedImageSlot: state.selectedImageSlot,
    fixedImageMode: state.fixedImageMode,
    showJapanHolidays: state.showJapanHolidays,
    showFixedList: state.showFixedList,
    showTodayList: state.showTodayList,
    showTimerBar: state.showTimerBar,
    filterCategoryId: state.filterCategoryId,
    year: state.year,
    month: state.month,
  }), [state.events, state.todos, state.routineDoneByMonth, state.categories, state.image, state.anniversaries, state.showAnniversaryPanel, state.timerImages, state.selectedImageSlot, state.fixedImageMode, state.showJapanHolidays, state.showFixedList, state.showTodayList, state.showTimerBar, state.filterCategoryId, state.year, state.month]);

  useEffect(() => {
    if (!state.driveAutoSync || !driveToken) return;
    const timer = setTimeout(() => saveToGoogleDrive(state), 2500);
    return () => clearTimeout(timer);
  }, [syncPayload, state.driveAutoSync, driveToken]);


  async function autoPullFromGoogleDrive() {
    if (!state.driveAutoSync || !driveToken || driveAutoPullRef.current) return;

    try {
      driveAutoPullRef.current = true;
      const file = await getDriveFileMetadata();

      if (!file?.id || !file.modifiedTime) return;

      const remoteTime = new Date(file.modifiedTime).getTime();
      const localTime = state.driveLastSyncedAt ? new Date(state.driveLastSyncedAt).getTime() : 0;
      const knownRemoteTime = driveLastRemoteModifiedRef.current ? new Date(driveLastRemoteModifiedRef.current).getTime() : 0;
      const baseline = Math.max(localTime || 0, knownRemoteTime || 0);

      if (!baseline || remoteTime > baseline + 1500) {
        await loadFromGoogleDrive();
      }
    } catch (err) {
      const message = err?.message ? String(err.message) : "알 수 없는 오류";
      console.error("[XL Calendar] Google Drive auto pull failed", err);
      setDriveStatus(`Google Drive 자동 불러오기 실패: ${message.slice(0, 120)}`);
    } finally {
      driveAutoPullRef.current = false;
    }
  }

  useEffect(() => {
    if (!state.driveAutoSync || !driveToken) return;

    const first = window.setTimeout(() => {
      autoPullFromGoogleDrive();
    }, 3500);

    const interval = window.setInterval(() => {
      autoPullFromGoogleDrive();
    }, 60000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [state.driveAutoSync, driveToken, state.driveLastSyncedAt]);

  async function checkForUpdate({ silent = false } = {}) {
    const url = String(state.updateInfoUrl || DEFAULT_UPDATE_INFO_URL).trim();
    if (!url) {
      if (!silent) setUpdateStatus("업데이트 정보 URL이 비어 있어요.");
      return;
    }
    try {
      if (!silent) setUpdateStatus("업데이트 확인 중...");
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("update check failed");
      const info = await res.json();
      const latest = String(info.version || "").trim();
      const hasUpdate = latest && compareVersion(latest, APP_VERSION) > 0;
      const now = new Date().toISOString();
      setState((s) => ({ ...s, updateLastCheckedAt: now }));
      if (hasUpdate && state.updateDismissedVersion !== latest) {
        setUpdateStatus(`새 버전 ${latest} 있음`);
        const message = info.message ? `

${info.message}` : "";
        const open = confirm(`새 버전이 있어요.
현재 버전: ${APP_VERSION}
최신 버전: ${latest}${message}

다운로드 페이지를 열까요?`);
        if (open && info.downloadUrl) window.open(info.downloadUrl, "_blank", "noopener,noreferrer");
        if (!open) setState((s) => ({ ...s, updateDismissedVersion: latest }));
      } else {
        if (!silent) setUpdateStatus("최신 버전이에요.");
      }
    } catch {
      if (!silent) setUpdateStatus("업데이트 확인 실패");
    }
  }

  useEffect(() => {
    const url = String(state.updateInfoUrl || DEFAULT_UPDATE_INFO_URL).trim();
    if (!url) return;
    const last = state.updateLastCheckedAt ? new Date(state.updateLastCheckedAt).getTime() : 0;
    const oneDay = 24 * 60 * 60 * 1000;
    if (!last || Date.now() - last > oneDay) checkForUpdate({ silent: true });
  }, []);

  useEffect(() => {
    const mark = () => { idleRef.current = Date.now(); };
    ["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach((n) => window.addEventListener(n, mark, { passive: true }));
    return () => ["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach((n) => window.removeEventListener(n, mark));
  }, []);

  useEffect(() => {
    const defaultTrackedProgramsCleaned = true;
    if (!defaultTrackedProgramsCleaned) return;

    setState((s) => {
      const cleaned = (s.trackedPrograms || []).filter((program) => {
        const name = normalizeProgramName(program);
        return (
          name !== "clip studio" &&
          name !== "chrome" &&
          !isIgnoredTrackingProgram(program)
        );
      });

      if (cleaned.length === (s.trackedPrograms || []).length) return s;
      return { ...s, trackedPrograms: cleaned };
    });
  }, []);
  useEffect(() => {
    const t = setInterval(async () => {
      const activeProgram = await getActiveProgramName();
      setActiveProgramDebug(activeProgram || "(감지 없음)");

      setState((s) => {
        const idleMs = Date.now() - idleRef.current;
        const away = idleMs >= 15000;
        const tracked = isTrackedProgram(activeProgram, s.trackedPrograms || []);

        if (away) {
          return {
            ...s,
            awaySeconds: s.awaySeconds + 1,
          };
        }

        if (tracked) {
          return {
            ...s,
            workSeconds: s.workSeconds + 1,
          };
        }

        return {
          ...s,
          otherSeconds: s.otherSeconds + 1,
        };
      });
    }, 1000);

    return () => clearInterval(t);
  }, [state.trackedPrograms]);

  const todayKey = makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const days = useMemo(() => buildCalendar(state.year, state.month), [state.year, state.month]);
  const routineMonthKey = `${state.year}-${pad(state.month)}`;
  const cat = (id) => state.categories.find((c) => c.id === id) || HIDDEN_CATEGORIES[id] || state.categories.at(-1) || DEFAULT_CATEGORIES.at(-1);
  const pushHistory = () => setHistoryStack((p) => [...p.slice(-19), JSON.stringify(state.events)]);
  const undo = () => setHistoryStack((p) => {
    const next = [...p];
    const last = next.pop();
    if (last) setState((s) => ({ ...s, events: JSON.parse(last) }));
    return next;
  });

  const visibleMonths = useMemo(
    () => Array.from(
      new Map(days.map((d) => [`${d.year}-${pad(d.month)}`, { year: d.year, month: d.month }])).values()
    ),
    [days]
  );

  const generatedEvents = useMemo(
    () => visibleMonths.flatMap(({ year, month }) => state.events.flatMap((ev) => repeatCopies(ev, year, month))),
    [state.events, visibleMonths]
  );
  const routineEvents = useMemo(() => {
    return visibleMonths.flatMap(({ year, month }) => {
      const monthKey = `${year}-${pad(month)}`;
      const lastDay = new Date(year, month, 0).getDate();

      return state.todos
        .filter((t) => t.fixed && t.day)
        .map((t) => ({
          id: `routine-${t.id}-${monthKey}`,
          date: makeDate(year, month, Math.min(Number(t.day) || 1, lastDay)),
          title: t.text,
          categoryId: "routine",
          isRoutine: true,
          done: Boolean(state.routineDoneByMonth?.[monthKey]?.[t.id]),
          routineTodoId: t.id,
        }));
    });
  }, [state.todos, state.routineDoneByMonth, visibleMonths]);
  const holidayEvents = useMemo(() => {
    const visibleYears = [...new Set(days.map((d) => d.year))];
    return visibleYears.flatMap((year) => {
      const kr = (KR_HOLIDAYS[year] || []).map(([date, title]) => ({ id: `kr-${date}`, date, title, categoryId: "kr-holiday", isHoliday: true }));
      const jp = state.showJapanHolidays ? (JP_HOLIDAYS[year] || []).map(([date, title]) => ({ id: `jp-${date}`, date, title, categoryId: "holiday", isHoliday: true })) : [];
      return [...kr, ...jp];
    });
  }, [days, state.showJapanHolidays]);

  const scheduleEvents = useMemo(() => [...state.events, ...generatedEvents, ...routineEvents], [state.events, generatedEvents, routineEvents]);
  const allEvents = useMemo(() => [...scheduleEvents, ...holidayEvents], [scheduleEvents, holidayEvents]);
  const holidayMeta = useMemo(() => {
    const map = new Map();
    holidayEvents.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, { kr: [], jp: [] });
      if (ev.categoryId === "kr-holiday") map.get(ev.date).kr.push(ev.title);
      if (ev.categoryId === "holiday") map.get(ev.date).jp.push(ev.title);
    });
    return map;
  }, [holidayEvents]);
  const visibleEvents = useMemo(() => {
    const q = state.searchText.trim().toLowerCase();
    return allEvents.filter((ev) => {
      if (state.filterCategoryId !== "all" && ev.categoryId !== state.filterCategoryId) return false;
      if (!q) return true;
      return [ev.title, ev.memo, ev.url, cat(ev.categoryId)?.label].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [allEvents, state.searchText, state.filterCategoryId, state.categories]);
  const byDate = useMemo(() => {
    const map = new Map();
    const occupied = new Map();
    const visibleDateKeys = new Set(days.map((d) => d.key));
    const dayMeta = new Map(days.map((d) => [d.key, d]));
    const normalEvents = visibleEvents.filter((ev) => !ev.isHoliday);
    const grouped = new Map();
    const consumedIds = new Set();

    const getOccupied = (date) => {
      if (!occupied.has(date)) occupied.set(date, new Set());
      return occupied.get(date);
    };

    const reserveLane = (dates) => {
      let lane = 0;
      while (dates.some((date) => getOccupied(date).has(lane))) lane += 1;
      dates.forEach((date) => getOccupied(date).add(lane));
      return lane;
    };

    const pushDisplay = (date, item) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    };

    normalEvents.forEach((ev) => {
      const key = getEventContinuousKey(ev);
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(ev);
    });

    grouped.forEach((list) => {
      const sorted = [...list]
        .filter((ev) => ev.date && visibleDateKeys.has(ev.date))
        .sort((a, b) => a.date.localeCompare(b.date) || sortEvent(a, b));

      let i = 0;
      while (i < sorted.length) {
        const segment = [sorted[i]];
        let j = i + 1;

        while (j < sorted.length && isNextDateKey(segment[segment.length - 1].date, sorted[j].date)) {
          segment.push(sorted[j]);
          j += 1;
        }

        if (segment.length >= 2) {
          let cursor = 0;

          while (cursor < segment.length) {
            const chunkStart = segment[cursor];
            const startMeta = dayMeta.get(chunkStart.date);
            const roomInWeek = startMeta ? 7 - startMeta.dow : 1;
            const chunkLength = Math.min(roomInWeek, segment.length - cursor);
            const chunkEvents = segment.slice(cursor, cursor + chunkLength);
            const chunkDates = chunkEvents.map((item) => item.date);
            const chunkEnd = chunkEvents[chunkEvents.length - 1];
            const lane = reserveLane(chunkDates);

            const displayEvent = {
              ...chunkStart,
              _displayLane: lane,
              continuousSpan: chunkLength,
              continuesFromPrev: cursor > 0,
              continuesNext: cursor + chunkLength < segment.length,
              continuousDisplayTitle: chunkStart.title,
              continuousEndDate: chunkEnd.date,
              continuousItems: chunkEvents.map((item) => ({
                id: item.id,
                date: item.date,
                title: item.title,
                startTime: item.startTime,
                categoryId: item.categoryId,
                memo: item.memo,
                url: item.url,
                repeatRule: item.repeatRule,
                repeatUntil: item.repeatUntil,
                repeatGroupId: item.repeatGroupId,
                cloneGroupId: item.cloneGroupId,
                baseRepeatId: item.baseRepeatId,
                baseEventId: item.baseEventId,
                isGenerated: item.isGenerated,
              })),
            };

            pushDisplay(chunkStart.date, displayEvent);

            chunkEvents.slice(1).forEach((item) => {
              pushDisplay(item.date, {
                id: `placeholder-${displayEvent.id || chunkStart.id}-${item.date}-${lane}`,
                date: item.date,
                _displayLane: lane,
                isContinuousPlaceholder: true,
                isContinuousHitbox: true,
                continuousTarget: item,
                continuousItems: chunkEvents.map((entry) => ({
                  id: entry.id,
                  date: entry.date,
                  title: entry.title,
                  startTime: entry.startTime,
                  categoryId: entry.categoryId,
                  memo: entry.memo,
                  url: entry.url,
                  repeatRule: entry.repeatRule,
                  repeatUntil: entry.repeatUntil,
                  repeatGroupId: entry.repeatGroupId,
                  cloneGroupId: entry.cloneGroupId,
                  baseRepeatId: entry.baseRepeatId,
                  baseEventId: entry.baseEventId,
                  isGenerated: entry.isGenerated,
                })),
              });
            });

            chunkEvents.forEach((ev) => consumedIds.add(ev.id));
            cursor += chunkLength;
          }
        }

        i = j;
      }
    });

    normalEvents.forEach((ev) => {
      if (consumedIds.has(ev.id)) return;
      const lane = reserveLane([ev.date]);
      pushDisplay(ev.date, { ...ev, _displayLane: lane });
    });

    for (const date of visibleDateKeys) {
      const lanes = occupied.get(date);
      if (!lanes || lanes.size === 0) continue;
      const maxLane = Math.max(...lanes);
      const existing = new Set((map.get(date) || []).map((item) => item._displayLane).filter((lane) => Number.isFinite(Number(lane))));
      for (let lane = 0; lane <= maxLane; lane += 1) {
        if (!existing.has(lane)) {
          pushDisplay(date, {
            id: `lane-spacer-${date}-${lane}`,
            date,
            _displayLane: lane,
            isContinuousPlaceholder: true,
          });
        }
      }
    }

    for (const [date, list] of map.entries()) map.set(date, [...list].sort(sortEvent));
    return map;
  }, [visibleEvents, days]);

  function goMonth(delta) {
    setState((s) => {
      const d = new Date(s.year, s.month - 1 + delta, 1);
      return { ...s, year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }
  function jumpMonth(m) { setState((s) => ({ ...s, month: m })); }
  function openNew(date) {
    setSelectedDate(date);
    setEditingEvent(null);
    setDraft({ title: "", startTime: "", categoryId: state.categories[0]?.id || "etc", memo: "", url: "", repeatRule: "none", repeatUntil: "", rangeStart: date, rangeEnd: "" });
  }
  function openEdit(ev) {
    if (ev.isRoutine || ev.isHoliday) return;
    setSelectedDate(ev.date);
    setEditingEvent(ev.id);
    setDraft({
      title: ev.title || "",
      startTime: ev.startTime || "",
      categoryId: ev.categoryId || "etc",
      memo: ev.memo || "",
      url: ev.url || "",
      repeatRule: ev.repeatRule || "none",
      repeatUntil: ev.repeatUntil || "",
      rangeStart: ev.date || "",
      rangeEnd: "",
      _editTargetId: ev.id,
      _editTargetDate: ev.date,
      _editTargetBaseEventId: ev.baseEventId || "",
      _editTargetBaseRepeatId: ev.baseRepeatId || "",
      _editTargetRepeatGroupId: ev.repeatGroupId || "",
      _editTargetCloneGroupId: ev.cloneGroupId || "",
      _editTargetIsGenerated: Boolean(ev.isGenerated),
      _editTargetSortOrder: ev.sortOrder || 0,
    });
  }
  function getRepeatRootId(target) {
    if (!target) return null;
    return target.baseRepeatId || target.repeatGroupId || target.cloneGroupId || target.baseEventId || (target.repeatRule && target.repeatRule !== "none" ? target.id : null);
  }
  function isSameRepeatRoot(event, rootId) {
    if (!rootId) return false;
    return event.id === rootId || event.baseRepeatId === rootId || event.repeatGroupId === rootId || event.cloneGroupId === rootId || event.baseEventId === rootId;
  }
  function buildRangeEvents(baseDate, baseDraft) {
    const startKey = baseDraft.rangeStart || baseDate;
    const endKey = baseDraft.rangeEnd || "";
    if (!startKey || !endKey || endKey < startKey) return null;

    const groupId = `range-${uid()}`;
    const dates = [];
    let current = startKey;
    for (let guard = 0; guard < 370 && current && current <= endKey; guard += 1) {
      dates.push(current);
      current = addDays(current, 1);
    }

    if (!dates.length) return null;

    return dates.map((date, index) => ({
      id: uid(),
      date,
      sortOrder: (byDate.get(date)?.length || 0) + index,
      title: baseDraft.title.trim(),
      startTime: baseDraft.startTime || "",
      categoryId: baseDraft.categoryId || "etc",
      memo: baseDraft.memo || "",
      url: baseDraft.url || "",
      repeatRule: "none",
      repeatGroupId: groupId,
    }));
  }

  function saveEvent() {
    if (!selectedDate || !draft.title.trim()) return;
    pushHistory();

    const cleanDraft = {
      title: draft.title.trim(),
      startTime: draft.startTime || "",
      categoryId: draft.categoryId || "etc",
      memo: draft.memo || "",
      url: draft.url || "",
      repeatRule: draft.repeatRule || "none",
      repeatUntil: draft.repeatUntil || "",
    };

    if (editingEvent) {
      const target = allEvents.find((e) => e.id === editingEvent) || {
        id: editingEvent,
        date: draft._editTargetDate || selectedDate,
        baseEventId: draft._editTargetBaseEventId || "",
        baseRepeatId: draft._editTargetBaseRepeatId || "",
        repeatGroupId: draft._editTargetRepeatGroupId || "",
        cloneGroupId: draft._editTargetCloneGroupId || "",
        isGenerated: Boolean(draft._editTargetIsGenerated),
        sortOrder: draft._editTargetSortOrder || 0,
      };

      const editDate = target.date || draft._editTargetDate || selectedDate;
      const targetGroupIds = [
        target.repeatGroupId,
        target.cloneGroupId,
        target.baseRepeatId,
        target.baseEventId,
        draft._editTargetRepeatGroupId,
        draft._editTargetCloneGroupId,
        draft._editTargetBaseRepeatId,
        draft._editTargetBaseEventId,
      ].filter(Boolean);

      const isSameEditTarget = (event) => {
        if (!event) return false;
        if (event.id === editingEvent) return true;
        if (event.date !== editDate) return false;
        return targetGroupIds.some((groupId) =>
          event.repeatGroupId === groupId ||
          event.cloneGroupId === groupId ||
          event.baseRepeatId === groupId ||
          event.baseEventId === groupId ||
          event.id === groupId
        );
      };

      setState((s) => {
        let didUpdate = false;
        let didExcludeBase = false;

        const nextEvents = s.events.map((event) => {
          const shouldExcludeGenerated =
            target?.isGenerated &&
            target.baseEventId &&
            event.id === target.baseEventId;

          if (shouldExcludeGenerated) {
            didExcludeBase = true;
            return {
              ...event,
              excludedDates: [...new Set([...(event.excludedDates || []), editDate])],
            };
          }

          if (isSameEditTarget(event)) {
            didUpdate = true;
            return {
              ...event,
              ...cleanDraft,
              date: editDate,
              repeatRule: "none",
              repeatUntil: "",
              repeatGroupId: undefined,
              cloneGroupId: undefined,
              baseRepeatId: undefined,
              baseEventId: undefined,
              isGenerated: false,
            };
          }

          return event;
        });

        if (!didUpdate) {
          nextEvents.push({
            id: uid(),
            date: editDate,
            sortOrder: target.sortOrder || draft._editTargetSortOrder || 0,
            ...cleanDraft,
            repeatRule: "none",
            repeatUntil: "",
          });
        }

        return { ...s, events: nextEvents };
      });
    } else {
      const rangedEvents = draft.rangeMode ? buildRangeEvents(selectedDate, draft) : null;
      if (rangedEvents) {
        setState((s) => ({ ...s, events: [...s.events, ...rangedEvents] }));
      } else {
        setState((s) => ({ ...s, events: [...s.events, { id: uid(), date: selectedDate, sortOrder: (byDate.get(selectedDate)?.length || 0), baseRepeatId: cleanDraft.repeatRule !== "none" ? `repeat-${uid()}` : undefined, ...cleanDraft }] }));
      }
    }
    setSelectedDate(null); setEditingEvent(null);
  }
  function deleteEvent() {
    if (!editingEvent) return;
    pushHistory();
    const target = allEvents.find((e) => e.id === editingEvent) || {
      id: editingEvent,
      date: draft._editTargetDate || selectedDate,
      baseEventId: draft._editTargetBaseEventId || "",
      isGenerated: Boolean(draft._editTargetIsGenerated),
    };
    if (target?.isGenerated && target.baseEventId) {
      setState((s) => ({ ...s, events: s.events.map((e) => e.id === target.baseEventId ? { ...e, excludedDates: [...new Set([...(e.excludedDates || []), target.date])] } : e) }));
    } else setState((s) => ({ ...s, events: s.events.filter((e) => e.id !== editingEvent) }));
    setSelectedDate(null); setEditingEvent(null);
  }
  function duplicateEvent(ev) {
    if (!ev || ev.isRoutine || ev.isHoliday) return;
    pushHistory();
    const clean = {
      ...ev,
      id: uid(),
      isGenerated: false,
      baseEventId: undefined,
      baseRepeatId: undefined,
      repeatGroupId: undefined,
      excludedDates: undefined,
      repeatRule: "none",
      repeatUntil: "",
      sortOrder: (byDate.get(ev.date)?.length || 0) + 1,
      title: `${ev.title}`,
    };
    setState((s) => ({ ...s, events: [...s.events, clean] }));
  }
  function saveGroup() {
    const target = allEvents.find((e) => e.id === editingEvent);
    const repeatId = getRepeatRootId(target);
    if (!repeatId || !draft.title.trim()) return;
    pushHistory();
    setState((s) => ({
      ...s,
      events: s.events.map((e) => isSameRepeatRoot(e, repeatId)
        ? { ...e, title: draft.title.trim(), startTime: draft.startTime || "", categoryId: draft.categoryId || "etc", memo: draft.memo || "", url: draft.url || "", repeatRule: draft.repeatRule || "none", repeatUntil: draft.repeatUntil || "", baseRepeatId: e.baseRepeatId || repeatId }
        : e),
    }));
    setSelectedDate(null);
    setEditingEvent(null);
  }

  function deleteGroup() {
    const target = allEvents.find((e) => e.id === editingEvent);
    const repeatId = getRepeatRootId(target);
    if (!repeatId) return;
    pushHistory();
    setState((s) => ({
      ...s,
      events: s.events.filter((e) => !isSameRepeatRoot(e, repeatId)),
    }));
    setSelectedDate(null);
    setEditingEvent(null);
  }
  function moveEvent(ev, date, clone = false, beforeId = null) {
    if (ev.isRoutine || ev.isHoliday) return;
    pushHistory();
    setState((s) => {
      const sourceId = ev.baseEventId && ev.isGenerated ? ev.baseEventId : ev.id;
      const source = s.events.find((e) => e.id === sourceId) || ev;
      const groupRoot = source.cloneGroupId || source.baseRepeatId || source.repeatGroupId || source.id;
      const isGeneratedMove = Boolean(ev.isGenerated && ev.baseEventId && !clone);

      const moved = clone || ev.isGenerated
        ? {
            ...ev,
            id: uid(),
            date,
            isGenerated: false,
            baseEventId: undefined,
            baseRepeatId: undefined,
            repeatGroupId: undefined,
            cloneGroupId: clone ? groupRoot : undefined,
            excludedDates: undefined,
            repeatRule: "none",
            repeatUntil: "",
          }
        : { ...source, date };

      let nextEvents;

      if (isGeneratedMove) {
        nextEvents = [
          ...s.events.map((e) =>
            e.id === sourceId
              ? { ...e, excludedDates: [...new Set([...(e.excludedDates || []), ev.date])] }
              : e
          ),
          moved,
        ];
      } else {
        nextEvents = clone || ev.isGenerated ? [...s.events, moved] : s.events.map((e) => e.id === sourceId ? moved : e);
      }

      if (clone && !source.cloneGroupId) {
        nextEvents = nextEvents.map((e) => e.id === sourceId ? { ...e, cloneGroupId: groupRoot } : e);
      }

      const sameDate = nextEvents.filter((e) => e.date === date && !e.isHoliday && !e.isRoutine && e.id !== moved.id).sort(sortEvent);
      const insertAt = beforeId ? Math.max(0, sameDate.findIndex((e) => e.id === beforeId || `gen-${e.id}-${date}` === beforeId)) : sameDate.length;
      const ordered = [...sameDate];
      ordered.splice(insertAt < 0 ? sameDate.length : insertAt, 0, moved);
      const orderMap = new Map(ordered.map((e, i) => [e.id, i]));
      nextEvents = nextEvents.map((e) => e.date === date && orderMap.has(e.id) ? { ...e, sortOrder: orderMap.get(e.id) } : e);
      return { ...s, events: nextEvents };
    });
  }
  function loadImage(file, slot = null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setState((s) => slot ? { ...s, timerImages: { ...s.timerImages, [slot]: String(reader.result) }, image: String(reader.result) } : { ...s, image: String(reader.result) });
    reader.readAsDataURL(file);
  }
  function openTodoAdd(fixed) {
    const isFixed = Boolean(fixed);
    setEditingTodo(null);
    setTodoAddTarget(isFixed ? "fixed" : "today");
    setTodoDrafts(
      state.todos
        .filter((todo) => Boolean(todo.fixed) === isFixed)
        .map((todo) => ({ ...todo }))
    );
    setTodoDraft({ text: "", day: new Date(state.year, state.month - 1, 1).getDate() });
  }
  function openTodoEdit(todo) {
    if (!todo) return;
    openTodoAdd(Boolean(todo.fixed));
  }
  function closeTodoModal() {
    setTodoAddTarget(null);
    setEditingTodo(null);
    setTodoDraft({ text: "", day: 1 });
    setTodoDrafts([]);
  }
  function saveTodoManager() {
    if (!todoAddTarget) return;
    const fixed = todoAddTarget === "fixed";
    const cleaned = todoDrafts
      .map((todo, index) => ({
        ...todo,
        id: todo.id || uid(),
        text: String(todo.text || "").trim(),
        fixed,
        day: fixed ? Math.max(1, Math.min(31, Number(todo.day) || 1)) : undefined,
        done: Boolean(todo.done),
        sortOrder: index,
      }))
      .filter((todo) => todo.text);

    setState((s) => ({
      ...s,
      todos: [
        ...s.todos.filter((todo) => Boolean(todo.fixed) !== fixed),
        ...cleaned,
      ],
      routineDoneByMonth: fixed
        ? Object.fromEntries(Object.entries(s.routineDoneByMonth || {}).map(([monthKey, doneMap]) => {
            const validIds = new Set(cleaned.map((todo) => todo.id));
            const next = Object.fromEntries(Object.entries(doneMap || {}).filter(([todoId]) => validIds.has(todoId)));
            return [monthKey, next];
          }))
        : s.routineDoneByMonth,
    }));
    closeTodoModal();
  }
  function toggleTodo(todo) {
    if (todo.fixed) {
      setState((s) => ({
        ...s,
        routineDoneByMonth: {
          ...s.routineDoneByMonth,
          [routineMonthKey]: {
            ...(s.routineDoneByMonth?.[routineMonthKey] || {}),
            [todo.id]: !Boolean(s.routineDoneByMonth?.[routineMonthKey]?.[todo.id]),
          },
        },
      }));
      return;
    }
    setState((s) => ({ ...s, todos: s.todos.map((t) => t.id === todo.id ? { ...t, done: !t.done } : t) }));
  }
  function deleteTodo(todo) {
    setState((s) => ({
      ...s,
      todos: s.todos.filter((t) => t.id !== todo.id),
      routineDoneByMonth: todo.fixed
        ? Object.fromEntries(Object.entries(s.routineDoneByMonth || {}).map(([monthKey, doneMap]) => {
            const next = { ...(doneMap || {}) };
            delete next[todo.id];
            return [monthKey, next];
          }))
        : s.routineDoneByMonth,
    }));
  }
  function openCategoryEditor() { setCategoryDrafts(state.categories.map((c) => ({ ...c }))); setCategoryOpen(true); }
  function saveCategories() { setState((s) => ({ ...s, categories: categoryDrafts.length ? categoryDrafts.map((c) => ({ ...c, label: c.label.trim() || "무제" })) : DEFAULT_CATEGORIES })); setCategoryOpen(false); }
  function openAnniversaryEditor() {
    const drafts = Array.isArray(state.anniversaries) ? state.anniversaries : [];
    setAnniversaryDrafts(drafts.length ? drafts.map((item) => ({ colorId: "cream", customColor: "", ...item })) : [{ id: uid(), title: "", date: "", image: "", colorId: "cream" }]);
    setAnniversaryOpen(true);
  }
  function saveAnniversaries() {
    const cleaned = anniversaryDrafts
      .map((item, index) => ({
        id: item.id || uid(),
        title: String(item.title || "").trim(),
        date: item.date || "",
        image: item.image || "",
        colorId: item.colorId || "cream",
        customColor: item.customColor || "",
        sortOrder: index,
      }))
      .filter((item) => item.title || item.date || item.image);

    setState((s) => ({ ...s, anniversaries: cleaned }));
    setAnniversaryOpen(false);
  }
  async function openBackupManager() {
    try {
      const api = window.electron || window.xlBackupApi;
      if (!api?.listCalendarBackups) {
        alert("로컬 백업 관리는 EXE 앱에서만 사용할 수 있어요. 웹에서는 Google Drive 불러오기를 사용해 주세요.");
        return;
      }

      const files = await api.listCalendarBackups();
      const normalized = Array.isArray(files)
        ? files.map((file) => (typeof file === "string" ? file : file?.name || file?.fileName || "")).filter(Boolean)
        : [];
      setBackupFiles(normalized);
      setBackupOpen(true);
    } catch {
      alert("백업 목록을 불러오지 못했어요.");
    }
  }

  async function restoreBackupFile(fileName) {
    const safeFileName = typeof fileName === "string" ? fileName : fileName?.name || fileName?.fileName || "";
    try {
      const api = window.electron || window.xlBackupApi;
      if (!api?.restoreCalendarBackup) return;

      if (!safeFileName) return;

      const restored = await api.restoreCalendarBackup(safeFileName);
      const next = restored?.state || restored;

      if (next) {
        setState((s) => ({
          ...s,
          ...next,
        }));
      }

      setBackupOpen(false);
      alert("백업 복구 완료!");
    } catch {
      alert("백업 복구 실패");
    }
  }

  const anniversaryItems = useMemo(() => {
    return (Array.isArray(state.anniversaries) ? state.anniversaries : [])
      .map((item, index) => ({ ...item, sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index }))
      .map((item) => getAnniversaryInfo(item, todayKey))
      .filter(Boolean)
      .sort((a, b) => {
        const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 9999;
        const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 9999;
        if (ao !== bo) return ao - bo;
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
  }, [state.anniversaries, todayKey]);

  const anniversaryMarksByDate = useMemo(() => {
    const map = new Map();
    if (!days.length) return map;

    const startKey = days[0].key;
    const endKey = days[days.length - 1].key;
    const source = Array.isArray(state.anniversaries) ? state.anniversaries : [];

    source.forEach((raw) => {
      const info = getAnniversaryInfo(raw, todayKey);
      if (!info?.targetKey) return;
      const palette = getAnniversaryPalette(info);
      const baseTitle = info.title || "기념일";

      for (let n = 1; n <= 200; n += 1) {
        const dayCount = n * 100;
        const key = addDays(info.targetKey, dayCount);
        if (key > endKey) break;
        if (key >= startKey) {
          pushAnniversaryMark(map, key, {
            id: `${info.id || baseTitle}-${dayCount}`,
            title: `${baseTitle} · ${dayCount}일`,
            color: palette.heart || palette.tape || "#e7a3b2",
          });
        }
      }

      for (let year = 1; year <= 80; year += 1) {
        const key = addYearsSafe(info.targetKey, year);
        if (!key) continue;
        if (key > endKey) break;
        if (key >= startKey) {
          pushAnniversaryMark(map, key, {
            id: `${info.id || baseTitle}-${year}y`,
            title: `${baseTitle} · ${year}주년`,
            color: palette.heart || palette.tape || "#e7a3b2",
          });
        }
      }
    });

    return map;
  }, [state.anniversaries, days, todayKey]);

  const activeProgramName = activeProgramDebug;
  const idleMsNow = Date.now() - idleRef.current;
  const isAwayNow = idleMsNow >= 15000;
  const isTrackedNow = isTrackedProgram(activeProgramName, state.trackedPrograms || []);

  const activeImageSlot = state.fixedImageMode
    ? state.selectedImageSlot
    : isAwayNow
      ? "away"
      : isTrackedNow
        ? "work"
        : "other";
  const activeImage = state.timerImages?.[activeImageSlot] || state.image;
  const totalFocus = Math.max(1, state.workSeconds + state.otherSeconds);
  const focusRatio = Math.round((state.workSeconds / totalFocus) * 100);

  return (
    <div className="min-h-screen overflow-hidden bg-transparent p-0 text-[#111]" style={{ fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", "맑은 고딕", "Segoe UI", sans-serif', textRendering: "geometricPrecision", WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" }}>
      <MobileCalendar
        state={state}
        setState={setState}
        days={days}
        byDate={byDate}
        holidayMeta={holidayMeta}
        anniversaryMarksByDate={anniversaryMarksByDate}
        cat={cat}
        goMonth={goMonth}
        openNew={openNew}
        openEdit={openEdit}
        duplicateEvent={duplicateEvent}
        deleteEventById={(id) => { pushHistory(); setState((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) })); }}
        driveStatus={driveStatus}
        driveConnected={Boolean(driveToken)}
        onDriveConnect={connectGoogleDrive}
        onDriveLoad={loadFromGoogleDrive}
        onDriveSave={() => saveToGoogleDrive(state)}
        onOpenSettings={() => setMobileDriveSettingsOpen(true)}
      />
      <div className="relative mx-auto hidden h-screen min-h-[760px] w-full max-w-none overflow-visible rounded-[12px] border border-[#d2d2d2] bg-white shadow-[0_10px_34px_rgba(0,0,0,0.055)] md:flex">
        <aside className="flex w-[clamp(260px,19vw,312px)] shrink-0 flex-col overflow-hidden rounded-l-[12px] border-r border-[#e7e7e7] bg-[#fbfbfb] px-[clamp(20px,2vw,34px)] py-[clamp(24px,3vh,40px)] pb-[40px]">
          <div
            className="flex items-center justify-center gap-[12px] text-[31px] tracking-[3px] text-[#172536]"
            style={{
              fontFamily:
                '"Avenir Next","SF Pro Display","Pretendard","Apple SD Gothic Neo",sans-serif',
              fontWeight: 820,
              letterSpacing: '0.045em',
              textRendering: 'geometricPrecision',
            }}
          ><button onClick={() => goMonth(-1)} className="text-[17px] font-[700] tracking-normal text-[#c9c1bc]"
                style={{
                  fontFamily: '"SF Pro Rounded","Pretendard","Apple SD Gothic Neo",sans-serif',
                }}>&lt;</button><span>{state.year}.{pad(state.month)}</span><button onClick={() => goMonth(1)} className="text-[17px] font-[700] tracking-normal text-[#c9c1bc]"
                style={{
                  fontFamily: '"SF Pro Rounded","Pretendard","Apple SD Gothic Neo",sans-serif',
                }}>&gt;</button></div>
          <div className="mx-auto mt-[19px] mb-[23px] block h-[4px] w-[132px] shrink-0 rounded-full bg-[#d4d4d4]" />
          <div className="group relative flex w-full items-center justify-center overflow-visible rounded-[10px]">
            {activeImage ? <img src={activeImage} alt="calendar" className="block h-auto w-full rounded-[10px] object-contain" /> : <button onClick={() => setImageOpen(true)} className="flex h-[149px] w-full items-center justify-center rounded-[10px] text-[15px] font-bold text-[#999]">이미지 추가</button>}
            <div className="absolute right-[9px] top-[9px] flex gap-[6px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {activeImage && <button onClick={(e) => { e.stopPropagation(); setState((s) => ({ ...s, image: "", timerImages: { work: "", other: "", away: "" } })); }} className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/85 text-[15px] font-black text-[#c88a96] shadow-[0_8px_17px_rgba(0,0,0,0.12)] hover:bg-white">×</button>}
              <button onClick={() => setImageOpen(true)} className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/85 shadow-[0_8px_17px_rgba(0,0,0,0.12)] hover:bg-white"><MousePointer2 size={12} fill="#111" /></button>
            </div>
            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => { loadImage(e.target.files?.[0], state.selectedImageSlot); e.currentTarget.value = ""; }} />
          </div>
          {state.showFixedList && <Section title="MY LIST · 고정" onAdd={() => openTodoAdd(true)}>{state.todos.filter((t) => t.fixed).map((t) => <Todo key={t.id} todo={t} routineMonthKey={routineMonthKey} routineDoneByMonth={state.routineDoneByMonth} onToggle={toggleTodo} onEdit={openTodoEdit} />)}</Section>}
          {state.showTodayList && <Section title="MY LIST · 해야 할 일" onAdd={() => openTodoAdd(false)}>{state.todos.filter((t) => !t.fixed).length ? state.todos.filter((t) => !t.fixed).map((t) => <Todo key={t.id} todo={t} onToggle={toggleTodo} onEdit={openTodoEdit} />) : <div className="mt-[18px] px-[6px] text-center text-[11px] leading-[1.3] tracking-[-0.01em] text-[#b1b1b1]">오늘 할 일을 메모해 보세요.</div>}</Section>}
          <Section title="CATEGORY" noTop onAdd={openCategoryEditor}><div className="mt-[19px] space-y-[12px]">{state.categories.map((c) => <div key={c.id} className="flex w-full items-center justify-between text-[14px] font-[600] tracking-[0em]"><span className="flex items-center gap-[12px]"><span className="h-[16px] w-[16px] rounded-full" style={{ background: c.color }} />{c.label}</span><span className="text-[11px] font-semibold tracking-[-0.018em] text-[#aaa19c]">{scheduleEvents.filter((e) => e.categoryId === c.id && e.date.startsWith(`${state.year}-${pad(state.month)}`)).length}</span></div>)}</div></Section>
          {state.showAnniversaryPanel && <AnniversaryPanel items={anniversaryItems} onEdit={openAnniversaryEditor} />}
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-r-[12px] bg-white pl-[clamp(2px,0.8vw,14px)] pr-[52px] pt-0">
          <div className="mx-auto flex h-[52px] w-[calc(100%+52px)] max-w-none items-center justify-between rounded-none border-b border-[#e5e5e5] bg-[#fcfcfc] pl-[13px] pr-[8px] text-[12px] text-[#aaa] shadow-[0_3px_8px_rgba(0,0,0,0.025)]" style={{ WebkitAppRegion: "drag" }}>
            <div className="flex items-center gap-[10px] font-bold text-[#8f8f8f]" style={{ WebkitAppRegion: "no-drag" }}><button onClick={() => { const now = new Date(); const key = makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate()); setState((s) => ({ ...s, year: now.getFullYear(), month: now.getMonth() + 1 }));  }} className="rounded-full border border-[#e6e6e6] bg-white px-[12px] py-[5px] text-[11px] font-[600] tracking-[-0.01em] text-[#777] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:bg-[#f7f7f7]">오늘</button><div className="flex items-center gap-2"><Search size={13} /><input value={state.searchText} onChange={(e) => setState((s) => ({ ...s, searchText: e.target.value }))} placeholder="검색" className="h-[27px] w-[180px] rounded-full border border-[#e8e8e8] bg-white px-3 text-[12px] outline-none" /></div><select value={state.filterCategoryId} onChange={(e) => setState((s) => ({ ...s, filterCategoryId: e.target.value }))} className="h-[27px] rounded-full border border-[#e8e8e8] bg-white px-2 outline-none"><option value="all">전체</option>{state.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}<option value="routine">루틴</option></select><button onClick={undo} className="rounded-full border border-[#e6e6e6] bg-white px-[12px] py-[5px] text-[11px] font-[600] tracking-[-0.01em] text-[#777] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:bg-[#f7f7f7]">UNDO</button></div>
            <div className="flex items-center gap-2 pr-[10px]" style={{ WebkitAppRegion: "no-drag" }}><button onClick={() => setGuideOpen(true)} className="rounded-full border border-[#e6e6e6] bg-white px-[12px] py-[5px] text-[11px] font-[600] tracking-[0.02em] text-[#777] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:bg-[#f7f7f7]">GUIDE</button><button onClick={() => setSettingsOpen(true)} className="flex items-center gap-[5px] rounded-full border border-[#e6e6e6] bg-white px-[12px] py-[5px] text-[11px] font-[600] tracking-[-0.01em] text-[#777] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:bg-[#f7f7f7]"><Settings size={13} />설정</button><WindowControls /></div>
          </div>
          <div className="mx-auto flex min-h-0 flex-1 flex-col w-full max-w-none"><div className="grid h-[28px] grid-cols-7 items-center text-center text-[14px] font-[600] tracking-[0em] text-[#555555]"><span className="text-[#FF8DA1]">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span className="text-[#7EA6FF]">토</span></div>
            <div className="grid flex-1 auto-rows-fr grid-cols-7 overflow-hidden rounded-[8px] border border-[#ececec] bg-[#fcfcfc] min-h-0">{days.map((d) => <DayCell key={d.key} d={d} events={byDate.get(d.key) || []} holidayMeta={holidayMeta.get(d.key)} anniversaryMarks={anniversaryMarksByDate.get(d.key) || []} cat={cat} hoverDate={hoverDate} todayKey={todayKey} dragging={dragging} setDragging={setDragging} setHoverDate={setHoverDate} setCopyMode={setCopyMode} copyMode={copyMode} openNew={openNew} openEdit={openEdit} moveEvent={moveEvent} setState={setState} routineMonthKey={routineMonthKey} />)}</div>
          </div>
          <MonthTabs state={state} setState={setState} jumpMonth={jumpMonth} />
          {state.showTimerBar && <TimerBar state={state} setState={setState} focusRatio={focusRatio} />}

          <button
            type="button"
            onClick={() => window.open("https://x.com/murmurxl", "_blank", "noopener,noreferrer")}
            className="absolute bottom-[10px] right-[18px] z-[3] select-none text-[10px] tracking-[0.08em] text-[#cfcac5] transition hover:text-[#aaa39d]"
            style={{
              fontFamily: '"SF Pro Display","Avenir Next","Pretendard",sans-serif',
              letterSpacing: "0.09em",
            }}
          >
            — XL Calendar
          </button>
        </main>
      </div>

      {selectedDate && <EventModal selectedDate={selectedDate} editingEvent={editingEvent} draft={draft} setDraft={setDraft} state={state} target={allEvents.find((e) => e.id === editingEvent)} onClose={() => { setSelectedDate(null); setEditingEvent(null); }} onSave={saveEvent} onDelete={deleteEvent} onSaveGroup={saveGroup} onDeleteGroup={deleteGroup} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
      {settingsOpen && <SettingsModal state={state} setState={setState} driveStatus={driveStatus} driveConnected={Boolean(driveToken)} updateStatus={updateStatus} onDriveConnect={connectGoogleDrive} onDriveSave={() => saveToGoogleDrive(state)} onDriveLoad={loadFromGoogleDrive} onCheckUpdate={() => checkForUpdate()} onBackup={openBackupManager} activeProgramDebug={activeProgramDebug} onClose={() => setSettingsOpen(false)} />}
      {categoryOpen && <CategoryModal drafts={categoryDrafts} setDrafts={setCategoryDrafts} onClose={() => setCategoryOpen(false)} onSave={saveCategories} />}
      {anniversaryOpen && <AnniversaryModal drafts={anniversaryDrafts} setDrafts={setAnniversaryDrafts} onClose={() => setAnniversaryOpen(false)} onSave={saveAnniversaries} />}
      {imageOpen && <ImageModal state={state} setState={setState} imageRef={imageRef} onClose={() => setImageOpen(false)} />}
      {mobileDriveSettingsOpen && (
        <div style={{ zIndex: 100001 }} className="fixed inset-0 flex items-end justify-center bg-black/35 p-3 md:hidden">
          <div className="w-full max-w-[420px] rounded-[22px] bg-white p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[18px] font-[900] tracking-[-0.04em] text-[#333]">Google Drive 연동</div>
                <div className="mt-1 text-[11px] font-[700] text-[#a1a1a1]">모바일 동기화 설정</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDriveSettingsOpen(false)}
                className="rounded-full border border-[#ececec] bg-white px-3 py-2 text-[12px] font-[900] text-[#888]"
              >
                닫기
              </button>
            </div>

            <div className="space-y-3">
              <input
                value={state.driveClientId || ""}
                onChange={(e) => setState((s) => ({ ...s, driveClientId: e.target.value }))}
                placeholder="Google OAuth Client ID"
                className="h-[46px] w-full rounded-[14px] border border-[#e7e7e7] bg-[#fafafa] px-4 text-[13px] font-[700] text-[#444] outline-none"
              />

              <input
                type="password"
                value={state.driveClientSecret || ""}
                onChange={(e) => setState((s) => ({ ...s, driveClientSecret: e.target.value }))}
                placeholder="Google OAuth Client Secret"
                className="h-[46px] w-full rounded-[14px] border border-[#e7e7e7] bg-[#fafafa] px-4 text-[13px] font-[700] text-[#444] outline-none"
              />

              <div className="rounded-[14px] border border-dashed border-[#dfe8f7] bg-[#f8fbff] px-3 py-2 text-[11px] font-[800] text-[#8a98ad]">
                {driveStatus || "Google Drive 미연결"}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={connectGoogleDrive}
                  className="h-[40px] rounded-[12px] border border-[#e4e8ef] bg-white text-[12px] font-[900] text-[#68758a]"
                >
                  연결
                </button>
                <button
                  type="button"
                  onClick={loadFromGoogleDrive}
                  disabled={!driveToken}
                  className="h-[40px] rounded-[12px] border border-[#e4e8ef] bg-white text-[12px] font-[900] text-[#68758a] disabled:opacity-40"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => saveToGoogleDrive(state)}
                  disabled={!driveToken}
                  className="h-[40px] rounded-[12px] border border-[#e4e8ef] bg-white text-[12px] font-[900] text-[#68758a] disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {backupOpen && (
        <div className="fixed inset-0 z-[30000] flex items-center justify-center bg-black/15 p-4">
          <div className="w-[420px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[16px] border border-[#e8e8e8] bg-[#fffefc] shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between border-b border-[#eeeeee] px-5 py-4">
              <div>
                <div className="text-[9px] font-[700] tracking-[0.22em] text-[#b8b8b8]">BACKUP</div>
                <div className="mt-1 text-[18px] font-[800] tracking-[-0.04em] text-[#444]">백업 복구</div>
              </div>
              <button
                onClick={() => setBackupOpen(false)}
                className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1 text-[11px] font-[700] text-[#888]"
              >
                닫기
              </button>
            </div>

            <div className="max-h-[380px] overflow-y-auto px-4 py-4">
              {backupFiles.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[#aaa]">
                  백업 파일이 없어요.
                </div>
              ) : (
                <div className="space-y-2">
                  {backupFiles.map((file) => (
                    <button
                      key={typeof file === "string" ? file : file?.name || file?.fileName || "백업 파일"}
                      onClick={() => restoreBackupFile(file)}
                      className="flex w-full items-center justify-between rounded-[12px] border border-[#ececec] bg-white px-4 py-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition hover:bg-[#fafafa]"
                    >
                      <span className="min-w-0 truncate pr-3 text-[12px] text-[#555]">
                        {typeof file === "string" ? file : file?.name || file?.fileName || "백업 파일"}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#f6f6f6] px-2 py-1 text-[10px] font-[800] text-[#888]">
                        복구
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {todoAddTarget && <TodoManageModal target={todoAddTarget} drafts={todoDrafts} setDrafts={setTodoDrafts} onSave={saveTodoManager} onClose={closeTodoModal} />}
    </div>
  );
}

function WindowControls() {
  const canControl = typeof window !== "undefined" && window.__XL_WINDOW__;
  const btn = "grid h-[28px] w-[34px] place-items-center rounded-[8px] text-[13px] font-bold text-[#888] transition hover:bg-[#f2f2f2] hover:text-[#555]";
  return <div className="ml-[4px] flex items-center gap-[2px]" style={{ WebkitAppRegion: "no-drag" }}>
    <button className={btn} onClick={() => canControl && window.__XL_WINDOW__.minimize()}>—</button>
    <button className={btn} onClick={() => canControl && window.__XL_WINDOW__.toggleMaximize()}>□</button>
    <button className={`${btn} hover:bg-[#ffe8ea] hover:text-[#c66]`} onClick={() => canControl && window.__XL_WINDOW__.close()}>×</button>
  </div>;
}

function MobileCalendar({
  state,
  setState,
  days,
  byDate,
  holidayMeta,
  anniversaryMarksByDate,
  cat,
  goMonth,
  openNew,
  openEdit,
  duplicateEvent,
  deleteEventById,
  driveStatus,
  driveConnected,
  onDriveConnect,
  onDriveLoad,
  onDriveSave,
  onOpenSettings,
}) {
  const [activeDate, setActiveDate] = useState(
    makeDate(state.year, state.month, Math.min(new Date().getDate(), new Date(state.year, state.month, 0).getDate()))
  );

  const activeEvents = (byDate.get(activeDate) || []).filter((ev) => !ev.isHoliday);
  const activeDay = activeDate ? Number(activeDate.split("-")[2]) : "";

  const [pendingAction, setPendingAction] = useState(null);

  function startDuplicate(ev) {
    if (!ev || ev.isRoutine || ev.isHoliday) return;
    setPendingAction({ type: "duplicate", event: ev });
  }

  function startMove(ev) {
    if (!ev || ev.isRoutine || ev.isHoliday) return;
    setPendingAction({ type: "move", event: ev });
  }

  function applyPendingAction(targetDate) {
    if (!pendingAction?.event) return;

    const ev = pendingAction.event;

    if (pendingAction.type === "duplicate") {
      const copied = {
        ...ev,
        id: uid(),
        date: targetDate,
        isGenerated: false,
        baseEventId: undefined,
        baseRepeatId: undefined,
        repeatGroupId: undefined,
        cloneGroupId: ev.cloneGroupId || ev.baseRepeatId || ev.repeatGroupId || ev.id,
        excludedDates: undefined,
        repeatRule: "none",
        sortOrder: (byDate.get(targetDate)?.length || 0) + 1,
      };

      setState((s) => ({ ...s, events: [...s.events, copied] }));
    }

    if (pendingAction.type === "move") {
      setState((s) => ({
        ...s,
        events: s.events.map((item) => {
          const itemId = item.id;
          const targetId = ev.baseEventId && ev.isGenerated ? ev.baseEventId : ev.id;
          if (itemId !== targetId) return item;

          return {
            ...item,
            date: targetDate,
            sortOrder: (byDate.get(targetDate)?.length || 0) + 1,
          };
        }),
      }));
    }

    setActiveDate(targetDate);
    setPendingAction(null);
  }

  return (
    <div className="md:hidden min-h-[calc(100vh-12px)] overflow-y-auto rounded-[14px] border border-[#e5e5e5] bg-white p-[14px] pb-[96px] shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="sticky top-0 z-20 -mx-[14px] mb-[12px] border-b border-[#ededed] bg-white/95 px-[14px] pb-[12px] pt-[4px] backdrop-blur">
        <div className="flex items-center justify-between">
          <button onClick={() => goMonth(-1)} className="rounded-full px-3 py-2 text-[18px] text-[#aaa]">‹</button>
          <div className="text-[22px] font-[700] tracking-[1px] text-[#172536]">{state.year}.{pad(state.month)}</div>
          <button onClick={() => goMonth(1)} className="rounded-full px-3 py-2 text-[18px] text-[#aaa]">›</button>
        </div>
      </div>


      {pendingAction && (
        <div className="mb-[10px] rounded-[14px] border border-[#ffe2c4] bg-[#fff7ef] px-4 py-3 text-[12px] font-[800] text-[#9b6b42] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          {pendingAction.type === "duplicate"
            ? "복제할 날짜를 캘린더에서 선택해주세요."
            : "이동할 날짜를 캘린더에서 선택해주세요."}

          <button
            onClick={() => setPendingAction(null)}
            className="ml-2 text-[#c58a55]"
          >
            취소
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 text-center text-[12px] font-[600] text-[#777]">
        <span className="text-[#FF8DA1]">일</span>
        <span>월</span>
        <span>화</span>
        <span>수</span>
        <span>목</span>
        <span>금</span>
        <span className="text-[#7EA6FF]">토</span>
      </div>

      <div className="mt-[8px] grid grid-cols-7 overflow-hidden rounded-[10px] border border-[#ececec] bg-[#fcfcfc]">
        {days.map((d) => {
          const key = d.key;
          const events = byDate.get(key) || [];
          const meta = holidayMeta.get(key);
          const anniversaryMarks = anniversaryMarksByDate?.get(key) || [];
          const holidayTitle = meta
            ? [
                ...(meta.kr || []).map((name) => `🇰🇷 ${name}`),
                ...(meta.jp || []).map((name) => `🇯🇵 ${name}`),
              ].join("\n")
            : "";
          const anniversaryTitle = anniversaryMarks.map((mark) => mark.title).join("\n");
          const isActive = key === activeDate;

          return (
            <button
              key={key}
             
              onClick={() => { setActiveDate(key); if (pendingAction) applyPendingAction(key); }}
              className={cx(
                "min-h-[74px] border-b border-r border-[#efefef] bg-white p-[5px] pt-[7px] text-left align-top last:border-r-0",
                isActive && "bg-[#fff7f8] ring-2 ring-[#ffdfe6] ring-inset"
              )}
            >
              <div className="flex items-start gap-[3px]" title={[holidayTitle, anniversaryTitle].filter(Boolean).join("\n") || undefined}>
                <div className={`text-[12px] font-[600] ${!d.current ? "text-[#c9cfd3]" : meta?.kr?.length ? "text-[#FF8DA1]" : meta?.jp?.length ? "text-[#7EA6FF]" : d.dow === 0 ? "text-[#FF8DA1]" : d.dow === 6 ? "text-[#7EA6FF]" : "text-[#222]"}`}>{d.day}</div>
                {meta?.kr?.length ? <span className="h-[5px] w-[5px] rounded-full bg-[#FFB6C3]" /> : meta?.jp?.length ? <span className="h-[5px] w-[5px] rounded-full bg-[#9AB9FF]" /> : null}
                {anniversaryMarks.slice(0, 2).map((mark, index) => (
                  <span
                    key={mark.id || `${mark.title}-${index}`}
                    className="text-[8px] font-black leading-none drop-shadow-[0_1px_0_rgba(255,255,255,0.88)]"
                    style={{ color: mark.color || "#e7a3b2" }}
                  >
                    ♥
                  </span>
                ))}
              </div>

              <div className="mt-[3px] space-y-[2px]">
                {events.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between rounded-[6px] px-[5px] py-[4px] text-[9px] font-[700] text-[#333] shadow-[0_2px_5px_rgba(82,68,58,0.08)]"
                    style={{ backgroundColor: cat(ev.categoryId).color }}
                  >
                    <span className="h-[6px] w-[18px] rounded-full bg-white/55" />
                    <span className="flex items-center gap-[2px] text-[8px]">
                      {ev.memo ? <span>📝</span> : null}
                      {ev.url ? <span>🔗</span> : null}
                    </span>
                  </div>
                ))}
                {events.length > 2 && <div className="text-[9px] text-[#aaa]">+{events.length - 2}</div>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-[14px] rounded-[16px] border border-[#ececec] bg-[#fbfbfb] p-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.035)]">
        <div className="mb-[10px] flex items-center justify-between">
          <div>
            <div className="text-[18px] font-[900] tracking-[-0.05em] text-[#333]">{activeDay}일 일정</div>
            <div className="mt-[2px] text-[10px] font-[700] text-[#b3b3b3]">아래 패널에서 추가 · 수정 · 복제 · 이동 · 삭제</div>
          </div>
          <button
            onClick={() => openNew(activeDate)}
            className="rounded-full bg-white px-[14px] py-[8px] text-[13px] font-[900] text-[#777] shadow-[0_3px_10px_rgba(0,0,0,0.08)]"
          >
            ＋ 추가
          </button>
        </div>

        {activeEvents.length === 0 ? (
          <div className="rounded-[13px] border border-dashed border-[#e5e5e5] bg-[#fafafa] px-3 py-8 text-center text-[12px] font-[700] text-[#aaa]">
            선택한 날짜에 일정이 없습니다.
          </div>
        ) : (
          <div className="space-y-[10px]">
            {activeEvents.map((ev) => (
              <div key={ev.id} className="rounded-[14px] bg-white p-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.055)]">
                <button onClick={() => openEdit(ev)} className="block w-full text-left">
                  <div className="flex items-start gap-[8px]">
                    <span className="mt-[4px] h-[10px] w-[10px] shrink-0 rounded-full" style={{ backgroundColor: cat(ev.categoryId).color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-[900] leading-[1.35] text-[#333]">{ev.title}</span>
                      {ev.startTime && <span className="mt-[5px] inline-block rounded-[6px] bg-[#f6f6f6] px-[7px] py-[2px] font-mono text-[10px] font-[800] text-[#666]">{ev.startTime}</span>}
                      {ev.memo && <span className="mt-[6px] block whitespace-pre-wrap text-[11px] leading-[1.4] text-[#777]">{ev.memo}</span>}

                      {ev.url && (
                        <span className="mt-[6px] flex items-center gap-[5px] text-[11px] font-[700] text-[#8a8a8a]">
                          <span>🔗</span>
                          <span className="truncate">{ev.url}</span>
                        </span>
                      )}
                    </span>
                  </div>
                </button>

                <div className="mt-[10px] grid grid-cols-4 gap-[6px]">
                  <button onClick={() => openEdit(ev)} className="rounded-[9px] border border-[#e8e8e8] bg-white px-[8px] py-[7px] text-[11px] font-[900] text-[#777]">수정</button>
                  <button onClick={() => startDuplicate(ev)} className="rounded-[9px] border border-[#e8e8e8] bg-white px-[8px] py-[7px] text-[11px] font-[900] text-[#777]">복제</button>
                  <button onClick={() => startMove(ev)} className="rounded-[9px] border border-[#e8e8e8] bg-white px-[8px] py-[7px] text-[11px] font-[900] text-[#777]">이동</button>
                  <button onClick={() => deleteEventById(ev.id)} className="rounded-[9px] border border-[#f1d9d9] bg-[#fff6f6] px-[8px] py-[7px] text-[11px] font-[900] text-[#c77]">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-[14px] rounded-[14px] border border-dashed border-[#dfe8f7] bg-[#f8fbff] p-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[10px] font-[800] tracking-[-0.02em] text-[#8a98ad]">
          <span>Google Drive 동기화</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-[170px] truncate text-right">{driveStatus || "미연결"}</span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="grid h-[24px] w-[24px] shrink-0 place-items-start rounded-full border border-[#e2e7ef] bg-white text-[12px] text-[#7d8aa0] shadow-[0_2px_6px_rgba(0,0,0,0.04)]"
              aria-label="Google Drive 설정"
            >
              ⚙
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={onDriveConnect} className="h-[34px] rounded-[11px] border border-[#e4e8ef] bg-white text-[12px] font-[900] text-[#68758a] shadow-[0_2px_8px_rgba(0,0,0,0.035)]">연결</button>
          <button onClick={onDriveLoad} disabled={!driveConnected} className="h-[34px] rounded-[11px] border border-[#e4e8ef] bg-white text-[12px] font-[900] text-[#68758a] shadow-[0_2px_8px_rgba(0,0,0,0.035)] disabled:opacity-40">불러오기</button>
          <button onClick={onDriveSave} disabled={!driveConnected} className="h-[34px] rounded-[11px] border border-[#e4e8ef] bg-white text-[12px] font-[900] text-[#68758a] shadow-[0_2px_8px_rgba(0,0,0,0.035)] disabled:opacity-40">저장</button>
        </div>
      </div>
    </div>
  );
}


function DayCell({ d, events, holidayMeta, anniversaryMarks = [], cat, hoverDate, todayKey, dragging, setDragging, setHoverDate, setCopyMode, copyMode, openNew, openEdit, moveEvent, setState, routineMonthKey }) {
  const holidayTitle = holidayMeta
    ? [
        ...(holidayMeta.kr || []).map((name) => `🇰🇷 ${name}`),
        ...(holidayMeta.jp || []).map((name) => `🇯🇵 ${name}`),
      ].join("\n")
    : "";
  const anniversaryTitle = (anniversaryMarks || []).map((mark) => mark.title).join("\n");

  return <div data-date={d.key} onDragOver={(e) => { e.preventDefault(); setHoverDate(d.key); }} onDrop={(e) => { e.preventDefault(); const raw = e.dataTransfer.getData("text/plain"); if (raw) moveEvent(JSON.parse(raw), d.key, copyMode); setDragging(null); setHoverDate(null); setCopyMode(false); }} onDoubleClick={() => openNew(d.key)} className={cx("relative h-full min-h-[clamp(102px,12vh,160px)] border-b border-r border-[#efefef] bg-[#fdfdfd] px-[clamp(8px,0.9vw,13px)] py-[clamp(8px,1vh,13px)] [&:nth-child(7n)]:border-r-0", hoverDate === d.key && "ring-2 ring-[#d8eeee] ring-inset", todayKey === d.key && d.current && "before:absolute before:inset-0 before:bg-[#dcdcdc]/30 before:pointer-events-none ring-1 ring-[#dfe5e8] ring-inset")}>
    {!d.current && <span className="pointer-events-none absolute inset-0 z-0 bg-[#f1f1f1]/75" />}
    <div className="relative z-[30] mb-[2px] flex items-start justify-between gap-1">
      <button onClick={() => openNew(d.key)} className={`text-[14px] font-[600] tracking-[0em] ${!d.current ? "text-[#c9cfd3]" : holidayMeta?.kr?.length ? "text-[#ff8da1]" : holidayMeta?.jp?.length ? "text-[#7EA6FF]" : d.dow === 0 ? "text-[#FF8DA1]" : d.dow === 6 ? "text-[#7EA6FF]" : "text-[#555555]"}`}>{d.day}</button>
      {(holidayMeta || anniversaryMarks.length > 0) && d.current && (
        <div className="group/holiday relative z-[40] flex max-w-[126px] shrink-0 flex-wrap justify-end gap-[2px] pt-[1px]">
          {holidayMeta?.kr?.length > 0 && <span className="rounded-full bg-[#fff1f4] px-[5px] py-[2px] text-[10px] font-black leading-none text-[#c796a5]">🇰🇷 공휴일</span>}
          {holidayMeta?.jp?.length > 0 && <span className="rounded-full bg-[#f1f6ff] px-[5px] py-[2px] text-[10px] font-black leading-none text-[#7EA6FF]">🇯🇵 祝日</span>}
          {anniversaryMarks.slice(0, 3).map((mark, index) => (
            <span
              key={mark.id || `${mark.title}-${index}`}
              className="text-[12px] font-black leading-none drop-shadow-[0_1px_0_rgba(255,255,255,0.88)]"
              style={{ color: mark.color || "#e7a3b2" }}
            >
              ♥
            </span>
          ))}
          {(holidayTitle || anniversaryTitle) && (
            <span className="pointer-events-none absolute right-0 top-[22px] z-[60] hidden w-max max-w-[240px] whitespace-pre-line rounded-[8px] border border-[#e6e0da] bg-white px-3 py-2 text-left text-[11px] font-[600] leading-[1.45] text-[#544b44] shadow-[0_8px_20px_rgba(52,40,34,0.16)] group-hover/holiday:inline-block">
              {[holidayTitle, anniversaryTitle].filter(Boolean).join("\n")}
            </span>
          )}
        </div>
      )}
    </div>
    <div className="relative z-[1] mt-[8px] flex flex-col gap-0 pb-[18px]">{events.slice(0, 5).map((ev, index) => ev.isContinuousPlaceholder ? (
  ev.isContinuousHitbox ? (
    <button
      key={ev.id}
      type="button"
      aria-label="이어진 일정 수정"
      title="이어진 일정 수정"
      className="relative z-[40] h-[31px] w-full shrink-0 cursor-pointer rounded-[10px] bg-transparent hover:bg-black/[0.015]"
      onClick={(e) => {
        e.stopPropagation();
        if (ev.continuousTarget) {
          openEdit(ev.continuousTarget);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const raw = e.dataTransfer.getData("text/plain");
        if (raw && ev.continuousTarget) {
          moveEvent(JSON.parse(raw), d.key, copyMode, ev.continuousTarget.id);
        }
        setDragging(null);
        setHoverDate(null);
        setCopyMode(false);
      }}
    />
  ) : (
    <div key={ev.id} className="pointer-events-none h-[31px] shrink-0" />
  )
) : ev.isRoutine ? <RoutineCard key={ev.id} ev={ev} setState={setState} routineMonthKey={routineMonthKey} dim={!d.current} /> : <EventCard key={ev.id} ev={ev} index={index} dim={!d.current} cat={cat(ev.categoryId)} dragging={dragging?.id === ev.id} onEdit={(target) => openEdit(target || ev)} onDragStart={(e) => { if (ev.isHoliday) return e.preventDefault(); const dragTarget = Array.isArray(ev.continuousItems) && ev.continuousItems.length ? ev.continuousItems[0] : ev; setDragging(dragTarget); setCopyMode(e.altKey || e.ctrlKey || e.metaKey); e.dataTransfer.setData("text/plain", JSON.stringify(dragTarget)); }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const raw = e.dataTransfer.getData("text/plain"); if (raw) moveEvent(JSON.parse(raw), d.key, copyMode, ev.id); setDragging(null); setHoverDate(null); setCopyMode(false); }} onDragEnd={() => { setDragging(null); setHoverDate(null); setCopyMode(false); }} />)}{events.length > 5 && <button className="mt-[2px] text-[8px] font-bold text-[#aaa]" onClick={() => alert(events.map((e) => e.title).join("\n"))}>+{events.length - 5}</button>}</div>
  </div>;
}

function EventCard({ ev, cat, dragging, onEdit, onDragStart, onDragOver, onDrop, onDragEnd, index = 0, dim = false }) {
  const holiday = ev.isHoliday;
  const lines = String(ev.title || "").split("\n");
  const hasTimeBadge = ev.startTime && lines.length <= 1;
  const hasMemo = Boolean(String(ev.memo || "").trim());
  const hasUrl = Boolean(String(ev.url || "").trim());
  const normalizedUrl = hasUrl && !/^https?:\/\//i.test(ev.url) ? `https://${ev.url}` : ev.url;
  const infoTitle = [hasMemo ? `메모: ${ev.memo}` : "", hasUrl ? `링크: ${ev.url}` : ""].filter(Boolean).join("\n");
  const continuousSpan = Math.max(1, Number(ev.continuousSpan) || 1);
  const isContinuousDisplay = continuousSpan > 1 || ev.continuesFromPrev || ev.continuesNext;
  const randomTilt = 0;
  const displayLines = String(ev.continuousDisplayTitle || ev.title || "").split("\n");
  const continuousItems = Array.isArray(ev.continuousItems) ? ev.continuousItems : [];

  function handleEventClick(e) {
    e.stopPropagation();

    if (continuousItems.length > 1) {
      const menu = continuousItems
        .map((item, idx) => `${idx + 1}. ${item.date}${item.startTime ? ` ${item.startTime}` : ""} ${item.title || ""}`.trim())
        .join("\n");
      const selected = window.prompt(`수정할 날짜를 선택해 주세요.\n\n${menu}`, "1");
      if (selected === null) return;

      const index = Number(selected) - 1;
      const target = continuousItems[index];

      if (target) {
        onEdit(target);
        return;
      }

      alert("선택 번호를 확인해 주세요.");
      return;
    }

    onEdit(ev);
  }

  return (
    <button
      draggable={!holiday}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={handleEventClick}
      className={cx(
        "group relative isolate block overflow-visible rounded-[10px] px-[11px] pb-[7px] pt-[7px] text-left transition-all duration-[120ms] ease-out hover:z-[500] hover:-translate-y-[0.5px] focus:z-[500] active:translate-y-[0.5px]",
        isContinuousDisplay ? "z-[30]" : "z-[1] w-full",
        hasTimeBadge && "py-[6px]",

        index > 0 && "mt-[-2px]",
        dragging && "opacity-50 ring-2 ring-[#d8c6ee]"
      )}
      style={{
        width: continuousSpan > 1 ? `calc(${continuousSpan * 100}% + ${(continuousSpan - 1) * 20}px)` : "100%",
        backgroundColor: cat.color,
        transform: `rotate(${randomTilt}deg)`,
        opacity: dim ? 0.42 : 1,
        boxShadow:
          "0 -1px 2px rgba(54,42,34,0.04), 0 4px 8px rgba(82,68,58,0.06), 0 10px 18px rgba(82,68,58,0.04), inset 0 1px 0 rgba(255,255,255,0.88)",
        filter: "none",
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-[10px] opacity-[0.028] mix-blend-multiply"
        style={{
          backgroundImage: "radial-gradient(rgba(72,56,44,0.2) 0.36px, transparent 0.36px), radial-gradient(rgba(255,255,255,0.88) 0.44px, transparent 0.44px)",
          backgroundSize: "12px 12px, 18px 18px",
          backgroundPosition: "0 0, 5px 7px",
        }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-[10px] opacity-[0.03]"
        style={{
          backgroundImage: "repeating-none 0px, rgba(255,255,255,0.88) 1px, transparent 1px, transparent 4px)",
        }}
      />
      <span
        className="pointer-events-none absolute left-[-4px] top-[-4px] z-[5] h-[11px] w-[26px] rotate-[-17deg] rounded-[2px]"
        style={{
          background: "rgba(255,255,255,0.6)",
          opacity: 0.6,
          border: "1px solid rgba(124,119,112,0.33)",
          boxShadow: "0 1px 3px rgba(50,50,50,0.08), inset 0 1px 0 rgba(255,255,255,0.45)",
        }}
      />

      {ev.continuesFromPrev && (
        <span className="absolute left-[6px] top-1/2 z-[4] -translate-y-1/2 text-[13px] font-black text-[#9a948d] opacity-80">→</span>
      )}
      {ev.continuesNext && (
        <span className="absolute right-[6px] top-1/2 z-[4] -translate-y-1/2 text-[13px] font-black text-[#9a948d] opacity-80">→</span>
      )}

      <span className={cx("relative z-[2] block pr-[4px]", hasTimeBadge && "flex items-center gap-[1px]")}>
        {hasTimeBadge && (
          <span className="inline-flex h-[17px] min-w-[36px] translate-x-[-5px] items-center justify-center rounded-full border border-[#eee7e1] bg-[#fff] px-[5px] py-0 text-[9px] font-[700] leading-none tracking-[-0.01em] text-[#3f3934] shadow-none">
            {ev.startTime}
          </span>
        )}
        <span
          className="block whitespace-pre-line text-[12px] font-medium leading-[1.28] tracking-[0em] text-[#2f2a26]"
          style={{ textRendering: "geometricPrecision", WebkitFontSmoothing: "antialiased", fontWeight: 500, paddingLeft: ev.continuesFromPrev ? 18 : 0, paddingRight: ev.continuesNext ? 16 : 0 }}
        >
          {displayLines.map((line, i) => <React.Fragment key={i}>{line}{i < displayLines.length - 1 && <br />}</React.Fragment>)}
        </span>
        {ev.startTime && !hasTimeBadge && <span className="mt-[2px] block text-[10px] font-bold leading-[1.3] tracking-[-0.01em] text-[#3f3934]">{ev.startTime}</span>}
      </span>

      {(hasMemo || hasUrl) && (
        <span className="absolute right-[-6px] top-[-4px] z-[8] flex items-center gap-[3px]">
          {hasMemo && (
            <span
              className="relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#f2cfd8] bg-[#fff6f8] text-[10px] shadow-[0_2px_6px_rgba(214,168,180,0.22)] backdrop-blur-[1px]"
              onClick={(e) => e.stopPropagation()}
            >
              <MemoIcon size={10} />
              <span className="pointer-events-none absolute right-0 top-[22px] z-[60] hidden w-max max-w-[190px] rounded-[8px] border border-[#e6e0da] bg-white px-3 py-2 text-left text-[11px] font-[600] leading-[1.45] text-[#544b44] shadow-[0_8px_20px_rgba(52,40,34,0.16)] group-hover:inline-block">
                {ev.memo}
              </span>
            </span>
          )}
          {hasUrl && (
            <span
              className="relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#d9d2f4] bg-[#f8f6ff] text-[10px] shadow-[0_2px_6px_rgba(170,160,220,0.22)] backdrop-blur-[1px]"
              onClick={(e) => { e.stopPropagation(); window.open(normalizedUrl, "_blank", "noopener,noreferrer"); }}
            >
              <LinkIcon size={10} />
              <span className="pointer-events-none absolute right-0 top-[22px] z-[60] hidden max-w-[220px] truncate rounded-[8px] border border-[#e6e0da] bg-white px-3 py-2 text-left text-[11px] font-[600] leading-[1.45] text-[#544b44] shadow-[0_8px_20px_rgba(52,40,34,0.16)] group-hover:inline-block">
                {ev.url}
              </span>
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function RoutineCard({ ev, setState, routineMonthKey, dim = false }) {
  return <button onClick={(e) => { e.stopPropagation(); setState((s) => ({ ...s, routineDoneByMonth: { ...s.routineDoneByMonth, [routineMonthKey]: { ...(s.routineDoneByMonth?.[routineMonthKey] || {}), [ev.routineTodoId]: !ev.done } } })); }} className={cx("block w-full bg-transparent px-[2px] py-[1px] text-left text-[11px] font-bold text-[#777] transition-opacity", dim && "opacity-45", ev.done && "opacity-40 line-through")}>✓ {ev.title}</button>;
}


function AnniversaryPanel({ items = [], onEdit }) {
  const visible = (items || []).slice(0, 5);
  const hasItems = visible.length > 0;

  const paperTexture = {
    backgroundImage:
      "radial-gradient(rgba(75,60,45,0.03) 0.42px, transparent 0.62px)",
    backgroundSize: "6px 6px, 100% 100%",
  };

  return (
    <div className="mt-auto pt-[46px]">
      <div className="-ml-[10px] w-[calc(100%+20px)] space-y-[7px]">
        {hasItems ? visible.map((item) => {
          const palette = getAnniversaryPalette(item);
          return (
            <button
              key={item.id || `${item.title}-${item.date}`}
              type="button"
              onClick={onEdit}
              className="group/anniv relative flex min-h-[78px] w-full items-start overflow-visible rounded-[10px] px-[16px] py-[13px] pr-[102px] text-left transition hover:-translate-y-[0.25px]"
              style={{
                backgroundColor: palette.color,
                border: "1px solid rgba(125,115,105,0.13)",
                transform: `rotate(${[-1.7, 1.25, -1.05, 1.45][visible.indexOf(item)%4]}deg)`,
                ...paperTexture,
                boxShadow: "0 6px 14px rgba(64,52,42,0.085), 0 2px 5px rgba(64,52,42,0.045)",
              }}
            >
              <span
                className="pointer-events-none absolute left-[-6px] top-[-7px] z-[4] h-[12px] w-[42px] rotate-[-17deg] rounded-[2px]"
                style={{
                  backgroundColor: "rgba(255,255,255,0.58)",
                  opacity: 1,
                  border: "1px solid rgba(145,140,132,0.24)",
                  boxShadow: "0 2px 5px rgba(50,50,50,0.08), inset 0 1px 0 rgba(255,255,255,0.56)",
                }}
              />
              <span className="relative z-[2] min-w-0 leading-none">
                <span className="block truncate text-[11px] font-[800] leading-[0.98] tracking-[-0.02em] text-[#3f3833]">{item.title || "기념일"}</span>
                <span className="mt-[0px] block text-[9px] font-[700] leading-[0.98] tracking-[-0.01em] text-[#8f867e]">{item.dateDisplay || item.targetKey}</span>
                <span className="mt-[2px] block text-[22px] font-[900] leading-[0.92] tracking-[-0.055em] text-[#22201f]">{item.label}</span>
              </span>
              {item.image && (
                <img
                  src={item.image}
                  alt="anniversary"
                  className="pointer-events-none absolute bottom-[7px] right-[16px] z-[1] h-[63px] max-w-[96px] object-contain"
                />
              )}
              <span className="absolute right-[-5px] top-[-7px] z-[5] grid h-[27px] w-[27px] place-items-start rounded-full border border-[#ece9e5] bg-white/95 text-[12px] font-black text-[#111] opacity-0 shadow-[0_3px_7px_rgba(0,0,0,0.075)] transition-opacity group-hover/anniv:opacity-100">✎</span>
            </button>
          );
        }) : (
          <button
            type="button"
            onClick={onEdit}
            className="group/anniv relative flex min-h-[62px] w-full items-start rounded-[10px] bg-[#fffaf0] px-[15px] py-[9px] text-left opacity-75"
            style={{ ...paperTexture, boxShadow: "0 2px 4px rgba(64,52,42,0.035)" }}
          >
            <span className="text-[11px] font-[800] leading-[1.1] text-[#aaa19a]">기념일 스티커를 추가해 보세요.</span>
            <span className="absolute right-[-5px] top-[-7px] grid h-[27px] w-[27px] place-items-start rounded-full border border-[#ece9e5] bg-white/95 text-[12px] font-black text-[#111] opacity-0 shadow-[0_3px_7px_rgba(0,0,0,0.075)] transition-opacity group-hover/anniv:opacity-100">✎</span>
          </button>
        )}
      </div>
      {items.length > visible.length && <button type="button" onClick={onEdit} className="mt-[7px] w-full text-center text-[10px] font-[800] text-[#aaa19c]">+{items.length - visible.length} 더보기</button>}
    </div>
  );
}

function AnniversaryModal({ drafts, setDrafts, onClose, onSave }) {
  function addItem() {
    setDrafts((items) => [...items, { id: uid(), title: "", date: "", image: "", colorId: "cream", customColor: "" }]);
  }

  function updateItem(index, patch) {
    setDrafts((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index) {
    setDrafts((items) => items.filter((_, i) => i !== index));
  }

  function moveItem(index, delta) {
    setDrafts((items) => {
      const next = [...items];
      const target = index + delta;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function loadItemImage(index, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateItem(index, { image: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <Modal size="w-[520px]">
      <ModalHead sub="d-day stickers" onClose={onClose} />
      <div className="max-h-[72vh] space-y-3 overflow-y-auto p-5">
        <div className="rounded-[14px] border border-dashed border-[#e7e0d8] bg-[#fffdf9] px-4 py-3 text-[11px] font-[700] leading-[1.55] text-[#9a9189]">
          데스크톱 사이드바 최하단에만 스티커처럼 표시돼요. 모바일 화면에는 스티커 카드는 표시하지 않습니다.
        </div>
        <div className="space-y-3">
          {drafts.map((item, index) => (
            <div key={item.id || index} className="rounded-[14px] border border-[#ececec] bg-white p-3 shadow-[0_1px_4px_rgba(0,0,0,0.025)]">
              <div className="flex gap-3">
                <label className="flex h-[68px] w-[78px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[10px] bg-[#f7f4ef] text-[18px] text-[#c8bfb6]">
                  {item.image ? <img src={item.image} alt="d-day" className="h-full w-full object-contain" /> : <span>♡</span>}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { loadItemImage(index, e.target.files?.[0]); e.currentTarget.value = ""; }} />
                </label>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={item.title || ""}
                    onChange={(e) => updateItem(index, { title: e.target.value })}
                    placeholder="기념일 이름"
                    className="h-[32px] w-full rounded-[10px] border border-[#e5e5e5] bg-[#fffefe] px-3 text-[12px] font-[700] text-[#555] outline-none"
                  />
                  <input
                    type="date"
                    value={item.date || ""}
                    onChange={(e) => updateItem(index, { date: e.target.value })}
                    className="h-[32px] w-full rounded-[10px] border border-[#e5e5e5] bg-[#fffefe] px-3 text-[12px] font-[700] text-[#777] outline-none"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-8 gap-2">
                {ANNIVERSARY_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => updateItem(index, { colorId: c.id, customColor: "" })}
                    className={cx("h-[24px] rounded-[10px] border transition", !item.customColor && (item.colorId || "cream") === c.id ? "border-[#6f6860] ring-2 ring-[#e8e1da]" : "border-[#e7e1da]")}
                    style={{ background: c.color }}
                  />
                ))}
                <label
                  title="직접 색상 선택"
                  className={cx("relative flex h-[24px] cursor-pointer items-center justify-center rounded-[10px] border text-[13px] font-black text-[#777] transition", item.customColor ? "border-[#6f6860] ring-2 ring-[#e8e1da]" : "border-[#e7e1da]")}
                  style={{ background: item.customColor || "#fff" }}
                >
                  +
                  <input
                    type="color"
                    value={item.customColor || getAnniversaryColor(item.colorId || "cream").color}
                    onChange={(e) => updateItem(index, { customColor: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[10px] font-[700] text-[#aaa]">
                  {item.customColor ? `직접 색상 ${item.customColor}` : "프리셋 색상"}
                </div>
                {item.customColor && (
                  <button type="button" onClick={() => updateItem(index, { customColor: "" })} className="text-[10px] font-[800] text-[#aaa]">직접색 해제</button>
                )}
              </div>
              <div className="mt-3 flex justify-between gap-2">
                <div className="flex gap-1">
                  <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} className="h-[30px] w-[30px] rounded-[8px] border bg-[#fafafa] text-[13px] font-black text-[#777] disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveItem(index, 1)} disabled={index === drafts.length - 1} className="h-[30px] w-[30px] rounded-[8px] border bg-[#fafafa] text-[13px] font-black text-[#777] disabled:opacity-30">↓</button>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateItem(index, { image: "" })} disabled={!item.image} className="rounded-[9px] border border-[#e8e8e8] bg-[#fafafa] px-3 py-2 text-[10px] font-[800] text-[#aaa] disabled:opacity-35">이미지 삭제</button>
                  <button type="button" onClick={() => removeItem(index)} className="rounded-[9px] border border-[#f0d7dc] bg-[#fff9fa] px-3 py-2 text-[10px] font-[900] text-[#c88a96]">삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addItem} className="w-full rounded-[13px] border border-dashed border-[#ded8d2] bg-[#fffefd] py-3 text-[12px] font-[900] text-[#9b9188]">＋ 추가</button>
        <div className="flex justify-end gap-2 border-t border-dashed border-[#e5e5e5] pt-3">
          <button onClick={onClose} className="rounded-[10px] border bg-white px-4 py-2 text-[12px] font-bold text-[#888]">취소</button>
          <button onClick={onSave} className="rounded-[10px] bg-[#333] px-5 py-2 text-[12px] font-black text-white">저장</button>
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children, onAdd, noTop }) {
  return <section className="group/section border-t border-[#dedede] pt-[18px]" style={{ marginTop: noTop ? 22 : 22 }}><div className="flex items-center justify-between text-[15px] font-[900] tracking-[0em]"><span>{title}</span><button type="button" aria-label={`${title} 편집`} title="편집" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd?.(); }} className="grid h-[26px] w-[26px] place-items-center rounded-full border border-[#e8e8e8] bg-white/90 text-[12px] font-black leading-none text-[#111] opacity-0 shadow-[0_6px_14px_rgba(0,0,0,0.10)] transition-opacity duration-150 hover:bg-white group-hover/section:opacity-100">✎</button></div>{children}</section>;
}

function Todo({ todo, routineMonthKey, routineDoneByMonth, onToggle, onEdit }) {
  const done = todo.fixed && routineMonthKey ? Boolean(routineDoneByMonth?.[routineMonthKey]?.[todo.id]) : Boolean(todo.done);
  return <div className={`group mt-[16px] flex items-center gap-[10px] text-[14px] font-[600] tracking-[0em] ${done ? "text-[#aaa] line-through" : "text-[#555]"}`}>
    <input type="checkbox" checked={done} onChange={(e) => { e.stopPropagation(); onToggle?.(todo); }} className="h-[15px] w-[15px] shrink-0 accent-[#cfcfcf]" />
    <button type="button" onClick={() => onToggle?.(todo)} className="min-w-0 flex-1 truncate text-left">{todo.text}</button>
    {todo.day && <span className="shrink-0 text-[8px] text-[#aaa]">{todo.day}일</span>}
  </div>;
}

function MonthTabs({ state, setState, jumpMonth }) {
  const tabBase = "flex h-[clamp(46px,6.1vh,75px)] w-[43px] items-center justify-center rounded-r-[7px] rounded-l-[4px] border border-[#dfe5e8] text-[11px] font-[600] tracking-[1.3px] text-[#727983] shadow-[0_3px_6px_rgba(0,0,0,0.085)] transition-all duration-150 ease-out [writing-mode:vertical-rl] hover:-translate-y-[1px] hover:translate-x-[2px] hover:shadow-[0_5px_9px_rgba(0,0,0,0.11)]";
  return <div className="absolute right-[10px] top-[52px] z-20 flex w-[44px] flex-col items-end gap-[3px]"><YearTab label={`< ${state.year - 1}`} onClick={() => setState((s) => ({ ...s, year: s.year - 1 }))} />{["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].map((m, i) => <button key={m} onClick={() => jumpMonth(i + 1)} className={cx(tabBase, state.month === i + 1 ? "w-[50px] translate-x-[4px] bg-[#FFE4E6] shadow-[0_6px_14px_rgba(0,0,0,0.12)]" : "bg-[#F5F5F5]")}>{m}</button>)}<YearTab label={`${state.year + 1} >`} onClick={() => setState((s) => ({ ...s, year: s.year + 1 }))} /></div>;
}

function YearTab({ label, onClick }) {
  return <button onClick={onClick} className="relative flex h-[58px] w-[43px] items-center justify-center rounded-r-[12px] rounded-l-[3px] border border-[#d4dbe3] bg-[#DFE6EE] text-[10px] font-[600] tracking-[1.4px] text-[#707781] shadow-[0_3px_6px_rgba(0,0,0,0.085)] transition-all duration-150 ease-out [writing-mode:vertical-rl] hover:-translate-y-[1px] hover:shadow-[0_5px_9px_rgba(0,0,0,0.11)] ">{label}</button>;
}

function TimerBar({ state, setState, focusRatio }) {
  const data = [["작업 시간", fmtTime(state.workSeconds)], ["그 외 시간", fmtTime(state.otherSeconds)], ["자리 비움 시간", fmtTime(state.awaySeconds)], ["집중 비율", `${focusRatio}%`]];
  return <div className="relative left-0 right-0 h-[78px] overflow-hidden border-t border-[#e4e4e4] bg-white mt-auto"><div className="mx-auto flex h-full w-full max-w-[1288px] items-center justify-center gap-[16px] overflow-x-auto px-[14px] py-[10px]">{data.map(([k, v]) => <div key={k} className="flex shrink-0 items-center gap-[10px] border-r border-[#dcdcdc] pr-[16px] last:border-r-0"><div className="text-[14px] font-[600] tracking-[0em]">{k}</div><span className="rounded-[4px] bg-white px-[10px] py-[6px] font-mono text-[clamp(12px,1.2vw,17px)] font-bold tracking-[1px] shadow-[0_2px_7px_rgba(0,0,0,0.12)]">{v}</span></div>)}</div></div>;
}

function EventModal({ selectedDate, editingEvent, target, draft, setDraft, state, onClose, onSave, onDelete, onSaveGroup, onDeleteGroup }) {
  const repeatRoot = target?.baseRepeatId || target?.repeatGroupId || target?.cloneGroupId || target?.baseEventId || (target?.repeatRule && target.repeatRule !== "none" ? target.id : null);
  return <Modal><ModalHead sub={selectedDate} onClose={onClose} /><div className="space-y-3 p-5"><input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} autoFocus placeholder="일정 이름" className="w-full rounded-[12px] border border-[#ddd] bg-white p-[11px] text-[14px] outline-none" /><input value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} placeholder="시간 예: 13:00" className="w-full rounded-[12px] border border-[#ddd] bg-white p-[11px] text-[14px] outline-none" /><select value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))} className="w-full rounded-[12px] border border-[#ddd] bg-white p-[11px] text-[14px] outline-none">{state.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><select value={draft.repeatRule} onChange={(e) => setDraft((d) => ({ ...d, repeatRule: e.target.value, rangeMode: e.target.value !== "none" ? false : d.rangeMode }))} className="w-full rounded-[12px] border border-[#ddd] bg-white p-[11px] text-[14px] outline-none"><option value="none">반복 안 함</option><option value="weekly">매주 반복</option><option value="monthly">매월 반복</option></select>{draft.repeatRule !== "none" && <div className="space-y-2 rounded-[14px] border border-dashed border-[#e5dfd8] bg-[#fffdf9] p-3"><label className="block text-[11px] font-black tracking-[-0.02em] text-[#8b8178]">반복 종료일</label><input type="date" value={draft.repeatUntil || ""} onChange={(e) => setDraft((d) => ({ ...d, repeatUntil: e.target.value }))} className="w-full rounded-[10px] border border-[#ddd] bg-white p-[9px] text-[13px] outline-none" /></div>}{!editingEvent && <div className="space-y-2 rounded-[14px] border border-dashed border-[#e5dfd8] bg-[#fffdf9] p-3"><label className="flex items-center gap-2 text-[11px] font-black tracking-[-0.02em] text-[#8b8178]"><input type="checkbox" checked={Boolean(draft.rangeMode)} onChange={(e) => setDraft((d) => ({ ...d, rangeMode: e.target.checked, repeatRule: e.target.checked ? "none" : d.repeatRule, repeatUntil: e.target.checked ? "" : d.repeatUntil, rangeStart: d.rangeStart || selectedDate || "" }))} className="h-[14px] w-[14px] accent-[#cfcfcf]" />기간 일정으로 등록</label><div className="text-[11px] font-bold leading-[1.45] text-[#aaa]">여행처럼 시작일~종료일까지 매일 같은 일정이 생성돼요.</div><div className="grid grid-cols-2 gap-2"><label className="block"><span className="mb-1 block text-[10px] font-black text-[#aaa]">시작일</span><input type="date" value={draft.rangeStart || selectedDate || ""} onChange={(e) => setDraft((d) => ({ ...d, rangeStart: e.target.value }))} disabled={!draft.rangeMode} className="w-full rounded-[10px] border border-[#ddd] bg-white p-[9px] text-[13px] outline-none disabled:bg-[#f7f7f7] disabled:text-[#bbb]" /></label><label className="block"><span className="mb-1 block text-[10px] font-black text-[#aaa]">종료일</span><input type="date" value={draft.rangeEnd || ""} onChange={(e) => setDraft((d) => ({ ...d, rangeEnd: e.target.value }))} disabled={!draft.rangeMode} className="w-full rounded-[10px] border border-[#ddd] bg-white p-[9px] text-[13px] outline-none disabled:bg-[#f7f7f7] disabled:text-[#bbb]" /></label></div></div>}<textarea value={draft.memo} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} placeholder="메모" className="h-[80px] w-full resize-none rounded-[12px] border border-[#ddd] bg-white p-[11px] text-[14px] outline-none" /><input value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} placeholder="URL" className="w-full rounded-[12px] border border-[#ddd] bg-white p-[11px] text-[14px] outline-none" /><div className="flex justify-between"><div>{editingEvent && <button onClick={onDelete} className="flex items-center gap-1 rounded-[9px] border border-[#efcaca] bg-[#fff6f6] px-3 py-2 text-[13px] font-bold text-[#c77777] shadow-[0_2px_6px_rgba(120,70,70,0.06)]"><Trash2 size={14} />삭제</button>}</div><button onClick={onSave} className="rounded-[8px] bg-[#111] px-[18px] py-[9px] text-[13px] font-black text-white">저장</button></div>{repeatRoot && <div className="grid grid-cols-2 gap-2 border-t border-dashed border-[#ddd] pt-3"><button onClick={onSaveGroup} className="rounded-[10px] border bg-[#f4f7fa] px-2 py-2 text-[12px] font-bold text-[#667]">반복 전체 수정</button><button onClick={onDeleteGroup} className="rounded-[10px] border bg-[#fff4f4] px-2 py-2 text-[12px] font-bold text-[#c77]">반복 전체 삭제</button></div>}</div></Modal>;
}

function GuideModal({ onClose }) {
  const clientIdGuideUrl = "https://docs.google.com/document/d/10gnHLosLskc2E8M4PRku04PcnttYH1uINTqlOgrQGYo/edit?usp=sharing";
  const sections = [
    {
      title: "일정 복제",
      body: "Ctrl / Alt 를 누른 상태로 드래그하면 일정이 복제돼요. 일반 드래그는 이동이에요.",
    },
    {
      title: "반복 일정",
      body: "매주 / 매월 반복 설정 가능. 반복 일정 수정 시 전체 수정 버튼으로 그룹 전체를 수정할 수 있어요.",
    },
    {
      title: "상태 이미지",
      body: "작업 / 그 외 / 자리비움 이미지를 각각 등록 가능. 고정 OFF 시 자동 전환돼요.",
    },
    {
      title: "Google Drive 연동",
      body: "설정 → Google OAuth Client ID 입력 → 연결 버튼으로 연동. 자동 동기화도 가능하며, Google Drive에 연동하면 모바일에서도 동일한 캘린더 데이터를 확인할 수 있어요.",
      detail: `Client ID 확인 방법:
1. Google Cloud Console 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. API 및 서비스 → 라이브러리 → Google Drive API 사용 설정
4. API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기
5. OAuth 클라이언트 ID 선택
6. 애플리케이션 유형은 웹 애플리케이션 선택
7. 승인된 JavaScript 원본에 앱 주소 추가
8. 생성 후 표시되는 Client ID를 복사해서 설정에 붙여넣기`,
    },
    {
      title: "작업 추적",
      body: "설정 → 실행중 선택 버튼으로 프로그램 등록 가능. 등록된 프로그램 사용 시 작업 시간으로 측정돼요.",
    },
    {
      title: "캘린더 조작",
      body: "일정 더블클릭으로 빠른 생성 가능. 일정끼리 드래그해서 순서 변경도 가능해요. 공휴일 / 메모 / 링크 마크가 있는 일정 위에 마우스를 올리면 자세한 내용이 박스로 표시돼요.",
    },
  ];

  return <Modal size="w-[480px]"><ModalHead sub="calendar usage" onClose={onClose} /><div className="max-h-[74vh] overflow-y-auto p-5"><div className="space-y-3">{sections.map((section) => <div key={section.title} className="rounded-[14px] border border-[#ececec] bg-white px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"><div className="mb-[7px] text-[14px] font-[900] tracking-[-0.02em] text-[#444]">{section.title}</div><div className="whitespace-pre-line text-[12px] font-[600] leading-[1.65] tracking-[-0.012em] text-[#777]">{section.body}</div>{section.detail && <div className="mt-3"><button onClick={() => window.open(clientIdGuideUrl, "_blank", "noopener,noreferrer")} className="rounded-full border border-[#e5e5e5] bg-[#fafafa] px-3 py-[5px] text-[10px] font-[600] tracking-[0.04em] text-[#777]">Client ID 생성 방법 보기</button></div>}</div>)}</div></div></Modal>;
}

function SettingsModal({state, setState, driveStatus, driveConnected, updateStatus, onDriveConnect, onDriveSave, onDriveLoad, onCheckUpdate, onClose, onBackup, activeProgramDebug}) {
  const backupRef = React.useRef(null);
  const [trackedDraft, setTrackedDraft] = useState("");
  const [programChoices, setProgramChoices] = useState([]);
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const [autoLaunchStatus, setAutoLaunchStatus] = useState("EXE에서 사용 가능");
  const autoLaunchSupported = typeof window !== "undefined" && Boolean(window.__XL_AUTO_LAUNCH__?.get && window.__XL_AUTO_LAUNCH__?.set);
  const toggles = [["고정 리스트", "showFixedList"], ["오늘 리스트", "showTodayList"], ["타이머 바", "showTimerBar"], ["디데이", "showAnniversaryPanel"], ["일본 祝日", "showJapanHolidays"], ["재부팅 자동시작", "autoLaunch"]];

  useEffect(() => {
    let cancelled = false;
    async function loadAutoLaunch() {
      if (!autoLaunchSupported) {
        setAutoLaunchStatus("웹에서는 미지원");
        return;
      }
      try {
        const enabled = await window.__XL_AUTO_LAUNCH__.get();
        if (!cancelled) {
          setState((s) => ({ ...s, autoLaunchOnStartup: Boolean(enabled) }));
          setAutoLaunchStatus(Boolean(enabled) ? "" : "");
        }
      } catch {
        if (!cancelled) setAutoLaunchStatus("자동시작 상태 확인 실패");
      }
    }
    loadAutoLaunch();
    return () => {
      cancelled = true;
    };
  }, [autoLaunchSupported]);

  async function toggleAutoLaunch() {
    if (!autoLaunchSupported) {
      setAutoLaunchStatus("EXE 앱에서만 사용할 수 있어요.");
      return;
    }

    const next = !state.autoLaunchOnStartup;
    setAutoLaunchStatus(next ? "자동시작 켜는 중..." : "자동시작 끄는 중...");

    try {
      const enabled = await window.__XL_AUTO_LAUNCH__.set(next);
      setState((s) => ({ ...s, autoLaunchOnStartup: Boolean(enabled) }));
      setAutoLaunchStatus(Boolean(enabled) ? "" : "");
    } catch {
      setAutoLaunchStatus("자동시작 설정 실패");
    }
  }
  function addTrackedProgram(nameFromPicker = "") {
    const name = String(nameFromPicker || trackedDraft).trim();
    if (!name) return;
    setState((s) => {
      const list = s.trackedPrograms || [];
      if (list.includes(name) || list.length >= 5) return s;
      return { ...s, trackedPrograms: [...list, name], selectedTrackedProgram: name };
    });
    setTrackedDraft("");
    setProgramPickerOpen(false);
  }
  async function openProgramPicker() {
    let list = [];
    try {
      if (typeof window !== "undefined" && typeof window.__XL_GET_RUNNING_PROGRAMS__ === "function") {
        list = await window.__XL_GET_RUNNING_PROGRAMS__();
      }
    } catch {}
    if (!Array.isArray(list) || list.length === 0) {
      list = ["CLIP STUDIO", "Chrome", "Discord", "Notion", "Photoshop", "Edge", "KakaoTalk"];
    }
    const current = new Set(state.trackedPrograms || []);
    setProgramChoices([...new Set(list.map((x) => String(x).trim()).filter(Boolean))].filter((x) => !current.has(x)).slice(0, 30));
    setProgramPickerOpen(true);
  }
  function removeTrackedProgram(name) {
    setState((s) => ({
      ...s,
      trackedPrograms: (s.trackedPrograms || []).filter((p) => p !== name),
      selectedTrackedProgram: s.selectedTrackedProgram === name ? (s.trackedPrograms || []).find((p) => p !== name) || "" : s.selectedTrackedProgram,
    }));
  }
  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setState(starterState());
  }
  function backup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `xl-calendar-backup-${state.year}-${pad(state.month)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function loadBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setState({ ...starterState(), ...JSON.parse(String(reader.result)) });
      } catch {
        alert("백업 파일을 읽을 수 없어요.");
      }
    };
    reader.readAsText(file);
  }
  return <Modal size="w-[420px]"><ModalHead sub="settings" onClose={onClose} /><div className="space-y-2 p-5"><div className="grid grid-cols-2 gap-2">{toggles.map(([label, key]) => {
    const isAuto = key === "autoLaunch";
    const checked = isAuto ? state.autoLaunchOnStartup : state[key];
    return <button key={key} onClick={() => isAuto ? toggleAutoLaunch() : setState((s) => ({ ...s, [key]: !s[key] }))} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-[14px] border bg-white px-4 py-3 text-[13px] font-bold"><span className="min-w-0 truncate">{label}</span><span className={cx("relative h-6 w-11 shrink-0 rounded-full border p-[2px]", checked ? "bg-[#c7d9f0] border-[#9cb8db]" : "bg-[#ececec] border-[#dddddd]")}><span className={cx("block h-5 w-5 rounded-full bg-white shadow transition", checked && "translate-x-5 bg-[#ffffff]")} /></span></button>;
  })}</div><div className="mt-4 rounded-[14px] border border-dashed border-[#e5e5e5] bg-[#fafafa] p-3"><div className="mb-2"><div className="mb-2 flex items-center justify-between"><div><div className="text-[11px] font-black tracking-[0.08em] text-[#777]">작업 추적 프로그램</div><div className="text-[8px] text-[#aaa]">최대 5개 등록 가능</div><div className="mt-1 rounded-[8px] bg-white px-2 py-1 text-[10px] font-[700] text-[#999]">현재 감지값: {activeProgramDebug || "(감지 없음)"}</div></div></div><div className="flex gap-2">
  <input
    value={trackedDraft}
    onChange={(e) => setTrackedDraft(e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter") addTrackedProgram(); }}
    disabled={(state.trackedPrograms || []).length >= 5}
    placeholder="직접 입력도 가능"
    className="min-w-0 flex-1 rounded-[9px] border bg-white px-3 py-2 text-[11px] outline-none disabled:opacity-40"
  />
  <button
    type="button"
    onClick={openProgramPicker}
    disabled={(state.trackedPrograms || []).length >= 5}
    className="rounded-[8px] border bg-white px-3 py-2 text-[11px] font-bold text-[#666] disabled:opacity-40"
  >
    실행중 선택
  </button>
  <button
    type="button"
    onClick={() => addTrackedProgram()}
    disabled={(state.trackedPrograms || []).length >= 5 || !trackedDraft.trim()}
    className="rounded-[8px] border bg-white px-3 py-2 text-[11px] font-bold text-[#666] disabled:opacity-40"
  >
    ＋
  </button>
</div>
<div className="mt-2 text-[10px] leading-[1.45] text-[#999]">
  [실행중 선택] 버튼을 누른 뒤 10초 안에 등록할 프로그램 창을 클릭하면 자동으로 등록됩니다.
</div>


{programPickerOpen && (
  <div className="mt-2 max-h-[150px] overflow-y-auto rounded-[10px] border bg-white p-2 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
    {programChoices.length ? (
      programChoices.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => addTrackedProgram(name)}
          className="flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[11px] font-bold text-[#555] hover:bg-[#f5f5f5]"
        >
          <span className="truncate">{name}</span>
          <span className="text-[#aaa]">＋</span>
        </button>
      ))
    ) : (
      <div className="px-3 py-3 text-center text-[11px] text-[#aaa]">
        선택 가능한 실행 프로그램이 없어요.
      </div>
    )}
  </div>
)}

<div className="space-y-2">{state.trackedPrograms.map((program) => <div key={program} className="flex items-center gap-2 rounded-[10px] border bg-white px-3 py-2"><span className="h-[14px] w-[14px] rounded-full border border-[#d6d6d6] bg-[#f6f6f6]" /><span className="flex-1 truncate text-[12px] font-[600] text-[#555]">{program}</span><button onClick={() => removeTrackedProgram(program)} className="text-[13px] text-[#aaa]">×</button></div>)}</div></div></div><div className="mt-4 rounded-[14px] border border-dashed border-[#d9e4f0] bg-[#f8fbff] p-3"><div className="mb-2 text-[11px] font-black tracking-[0.08em] text-[#667]">Google Drive 연동</div><input value={state.driveClientId || ""} onChange={(e) => setState((s) => ({ ...s, driveClientId: e.target.value }))} placeholder="Google OAuth Client ID" className="mb-2 w-full rounded-[10px] border border-[#dfe6ee] bg-white px-3 py-2 text-[11px] outline-none" />
        <input value={state.driveClientSecret || ""} onChange={(e) => setState((s) => ({ ...s, driveClientSecret: e.target.value }))} placeholder="Google OAuth Client Secret" type="password" className="h-[34px] rounded-[10px] border border-[#e5e5e5] bg-white px-3 text-[11px] outline-none" /><div className="mb-2 flex items-center justify-between rounded-[10px] bg-white px-3 py-2 text-[11px] text-[#777]"><span>{driveStatus}</span><span>{state.driveLastSyncedAt ? new Date(state.driveLastSyncedAt).toLocaleString() : "미동기화"}</span></div><div className="grid grid-cols-3 gap-2"><button onClick={onDriveConnect} className="rounded-[10px] border bg-white px-2 py-2 text-[11px] font-bold text-[#667]">연결</button><button onClick={onDriveLoad} disabled={!driveConnected} className="rounded-[10px] border bg-white px-2 py-2 text-[11px] font-bold text-[#667] disabled:opacity-40">불러오기</button><button onClick={onDriveSave} disabled={!driveConnected} className="rounded-[10px] border bg-white px-2 py-2 text-[11px] font-bold text-[#667] disabled:opacity-40">저장</button></div><button onClick={() => setState((s) => ({ ...s, driveAutoSync: !s.driveAutoSync }))} className="mt-2 flex w-full items-center justify-between rounded-[10px] border bg-white px-3 py-2 text-[11px] font-bold text-[#667]"><span>자동 동기화</span><span className={cx("relative h-5 w-9 rounded-full border p-[2px]", state.driveAutoSync ? "bg-[#c7d9f0] border-[#9cb8db]" : "bg-[#ececec] border-[#dddddd]")}><span className={cx("block h-4 w-4 rounded-full bg-white shadow transition", state.driveAutoSync && "translate-x-4")} /></span></button></div><div className="mt-4 rounded-[14px] border border-dashed border-[#e5e5e5] bg-[#fafafa] p-3"><div className="mb-2 flex items-center justify-between"><div><div className="text-[11px] font-black tracking-[0.08em] text-[#777]">업데이트 확인</div><div className="text-[8px] text-[#aaa]">현재 버전 {APP_VERSION}</div></div><button onClick={onCheckUpdate} className="rounded-[8px] border bg-white px-3 py-2 text-[11px] font-bold text-[#666]">확인</button></div><div className="rounded-[10px] bg-white px-3 py-2 text-[11px] text-[#777]">{updateStatus}{state.updateLastCheckedAt ? ` · ${new Date(state.updateLastCheckedAt).toLocaleString()}` : ""}</div></div><div className="mt-4 grid grid-cols-4 gap-2 border-t border-dashed border-[#e5e5e5] pt-4"><button onClick={resetAll} className="rounded-[10px] border bg-[#fafafa] px-3 py-3 text-[12px] font-bold text-[#888]">초기화</button><button onClick={backup} className="rounded-[10px] border bg-[#fafafa] px-3 py-3 text-[12px] font-bold text-[#888]">백업</button><label className="flex cursor-pointer items-center justify-center rounded-[10px] border bg-[#fafafa] px-3 py-3 text-[12px] font-bold text-[#888]">불러오기<input ref={backupRef} type="file" accept="application/json" className="hidden" onChange={(e) => loadBackup(e.target.files?.[0])} /></label><button onClick={onBackup} className="rounded-[10px] border bg-[#fafafa] px-3 py-3 text-[12px] font-bold text-[#888]">백업관리</button></div></div></Modal>;
}

function TodoManageModal({ target, drafts, setDrafts, onSave, onClose }) {
  const isFixed = target === "fixed";
  const title = isFixed ? "fixed list" : "today list";
  const addTodo = () => {
    setDrafts((p) => [
      ...p,
      {
        id: `todo-${uid()}`,
        text: "",
        done: false,
        fixed: isFixed,
        day: isFixed ? 1 : undefined,
      },
    ]);
  };

  return <Modal size="w-[520px]"><ModalHead sub={title} onClose={onClose} /><div className="space-y-3 p-5">
    {drafts.length ? drafts.map((todo, i) => (
      <div key={todo.id || i} className={cx("grid gap-2", isFixed ? "grid-cols-[1fr_82px_58px_28px]" : "grid-cols-[1fr_58px_28px]")}>
        <input
          value={todo.text || ""}
          onChange={(e) => setDrafts((p) => p.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))}
          placeholder="내용 입력"
          className="h-[36px] rounded-[10px] border border-[#ddd] bg-white px-3 text-[13px] outline-none"
        />
        {isFixed && (
          <select
            value={todo.day || 1}
            onChange={(e) => setDrafts((p) => p.map((x, idx) => idx === i ? { ...x, day: Number(e.target.value) || 1 } : x))}
            className="h-[36px] rounded-[10px] border border-[#ddd] bg-white px-2 text-[12px] outline-none"
          >
            {Array.from({ length: 31 }, (_, dayIndex) => dayIndex + 1).map((day) => <option key={day} value={day}>{day}일</option>)}
          </select>
        )}
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setDrafts((p) => { const n = [...p]; if (i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}
            className="h-[32px] w-[24px] rounded-[8px] text-[15px] font-black text-[#333] hover:bg-[#f2f2f2]"
            aria-label="위로 이동"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => setDrafts((p) => { const n = [...p]; if (i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}
            className="h-[32px] w-[24px] rounded-[8px] text-[15px] font-black text-[#333] hover:bg-[#f2f2f2]"
            aria-label="아래로 이동"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDrafts((p) => p.filter((_, idx) => idx !== i))}
          className="h-[32px] rounded-[8px] text-[16px] font-black text-[#333] hover:bg-[#fff0f2] hover:text-[#c77b8a]"
          aria-label="삭제"
        >
          ×
        </button>
      </div>
    )) : <div className="rounded-[12px] border border-dashed border-[#e5e5e5] py-6 text-center text-[12px] font-bold text-[#aaa]">등록된 리스트가 없어요.</div>}
    <button type="button" onClick={addTodo} className="w-full rounded-[12px] border border-dashed border-[#e5e5e5] py-3 text-[13px] font-bold text-[#333]">＋ 추가</button>
    <button type="button" onClick={onSave} className="w-full rounded-[12px] bg-[#111] py-3 text-[13px] font-black text-white">저장</button>
  </div></Modal>;
}

function CategoryModal({ drafts, setDrafts, onClose, onSave }) {
  const normalizeHex = (value) => {
    const raw = String(value || "").trim();
    const withHash = raw.startsWith("#") ? raw : `#${raw}`;
    return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : null;
  };
  const updateColor = (id, value) => {
    setDrafts((p) => p.map((x) => x.id === id ? { ...x, colorInput: value, ...(normalizeHex(value) ? { color: normalizeHex(value), dot: normalizeHex(value) } : {}) } : x));
  };
  return <Modal size="w-[520px]"><ModalHead sub="label" onClose={onClose} /><div className="space-y-3 p-5">{drafts.map((c, i) => {
    const hexValue = c.colorInput ?? c.color;
    const invalid = !normalizeHex(hexValue);
    return <div key={c.id} className="grid grid-cols-[34px_1fr_112px_80px_28px] gap-2"><input type="color" value={normalizeHex(c.color) || "#e4e7ec"} onChange={(e) => updateColor(c.id, e.target.value)} className="h-[36px] w-[34px] cursor-pointer overflow-hidden rounded-[8px] border border-[#ddd] bg-white p-[2px]" /><input value={c.label} onChange={(e) => setDrafts((p) => p.map((x) => x.id === c.id ? { ...x, label: e.target.value } : x))} className="rounded-[10px] border px-3 text-[13px]" /><input value={hexValue} onChange={(e) => updateColor(c.id, e.target.value)} onBlur={(e) => { const fixed = normalizeHex(e.target.value); if (fixed) updateColor(c.id, fixed); }} placeholder="#cfeaed" className={`rounded-[10px] border px-3 font-mono text-[12px] outline-none ${invalid ? "border-[#ffb6c1] bg-[#fff7f8] text-[#cc6678]" : "border-[#ddd]"}`} /><div className="flex gap-1"><button onClick={() => setDrafts((p) => { const n = [...p]; if (i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</button><button onClick={() => setDrafts((p) => { const n = [...p]; if (i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>↓</button></div><button onClick={() => setDrafts((p) => p.filter((x) => x.id !== c.id))}>×</button></div>})}<button onClick={() => setDrafts((p) => [...p, { id: `cat-${uid()}`, label: "새 카테고리", color: COLOR_POOL[p.length % COLOR_POOL.length], dot: COLOR_POOL[p.length % COLOR_POOL.length], colorInput: COLOR_POOL[p.length % COLOR_POOL.length] }])} className="w-full rounded-[12px] border border-dashed py-3 text-[13px] font-bold">＋ 추가</button><button onClick={onSave} className="w-full rounded-[12px] bg-[#111] py-3 text-[13px] font-black text-white">저장</button></div></Modal>;
}

function ImageModal({ state, setState, imageRef, onClose }) {
  const currentSlot = state.selectedImageSlot || "work";
  const hasSlotImage = Boolean(state.timerImages?.[currentSlot]);
  const hasAnyImage = Boolean(state.timerImages?.[currentSlot] || state.image);

  const clearCurrentImage = () => {
    setState((s) => ({
      ...s,
      timerImages: { ...(s.timerImages || {}), [currentSlot]: "" },
      image: currentSlot === (s.selectedImageSlot || "work") ? "" : s.image,
    }));
  };

  const clearAllImages = () => {
    setState((s) => ({
      ...s,
      image: "",
      timerImages: { work: "", other: "", away: "" },
    }));
  };

  return <Modal size="w-[320px]"><ModalHead sub="image" onClose={onClose} /><div className="space-y-3 p-5"><div className="grid grid-cols-4 gap-2"><button onClick={() => setState((s) => ({ ...s, fixedImageMode: !s.fixedImageMode }))} className={cx("rounded-[10px] border px-2 py-2 text-[8px]", state.fixedImageMode && "bg-[#efe5c8]")}>{state.fixedImageMode ? "고정 ON" : "고정 OFF"}</button>{["work", "other", "away"].map((slot) => <button key={slot} onClick={() => setState((s) => ({ ...s, selectedImageSlot: slot }))} className={cx("rounded-[10px] border px-2 py-2 text-[11px]", state.selectedImageSlot === slot && "bg-[#dce7f3]")}>{slot === "work" ? "작업" : slot === "other" ? "그 외" : "자리"}</button>)}</div><div className="grid min-h-[120px] place-items-start overflow-visible rounded-[12px] bg-transparent">{hasAnyImage ? <img src={state.timerImages?.[currentSlot] || state.image} alt="preview" className="block h-auto w-full rounded-[12px] object-contain" /> : <span className="text-[12px] text-[#aaa]">이미지 없음</span>}</div><button onClick={() => imageRef.current?.click()} className="w-full rounded-[12px] border bg-white py-3 text-[13px] font-bold">이미지 변경</button><div className="grid grid-cols-2 gap-2"><button onClick={clearCurrentImage} disabled={!hasSlotImage && !state.image} className="rounded-[12px] border border-[#f0d7dc] bg-[#fff9fa] py-3 text-[12px] font-black text-[#c88a96] disabled:opacity-35">현재 이미지 삭제</button><button onClick={clearAllImages} disabled={!hasAnyImage} className="rounded-[12px] border border-[#e7e7e7] bg-white py-3 text-[12px] font-bold text-[#999] disabled:opacity-35">전체 이미지 삭제</button></div></div></Modal>;
}
