/**
 * 일정 날짜 변환 — DB는 timestamptz, 화면은 한국시간 기준 날짜/시각 입력이다.
 *
 * 브라우저·서버 타임존에 관계없이 항상 같은 값이 나오도록 KST(+9, 서머타임 없음)를
 * 고정 오프셋으로 직접 계산한다. new Date(...).toLocaleString에 맡기면
 * 로컬 타임존이 다른 환경(예: UTC로 도는 서버)에서 하루씩 밀린다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** timestamptz(ISO) → KST 기준 "YYYY-MM-DD" */
export function isoToKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** timestamptz(ISO) → KST 기준 "HH:MM" */
export function isoToKstTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00:00";
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/** "YYYY-MM-DD" (+ "HH:MM") → timestamptz(ISO). 시각 생략 시 KST 자정 */
export function kstToIso(date: string, time?: string | null): string {
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  return new Date(`${date}T${t}:00.000+09:00`).toISOString();
}

/** 로컬 Date 객체 → "YYYY-MM-DD" (캘린더 그리드 셀 키) */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → 로컬 자정 Date */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 오늘(KST) "YYYY-MM-DD" */
export function todayKey(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 두 날짜 키 사이의 일수 (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86_400_000
  );
}

/** 날짜 키에 일수를 더한 새 키 */
export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** "2026-07-28" → "7/28 (화)" */
export function formatDayLabel(key: string): string {
  const d = fromDateKey(key);
  const week = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${week})`;
}
