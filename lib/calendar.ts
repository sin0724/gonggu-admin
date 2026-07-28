/**
 * 캘린더 연동 유틸 — 구글 캘린더 붙이기용 ICS 생성과 "캘린더에 추가" 링크.
 *
 * 연동 방식은 두 갈래다.
 *  1) 구독(권장): 구글 캘린더 → 다른 캘린더 추가 → URL로 추가 에 /api/calendar/ics
 *     피드 주소를 넣으면 이후 등록/수정한 일정이 자동으로 따라온다(구글이 주기적으로 당겨감).
 *  2) 단건 추가: 일정마다 "구글 캘린더에 추가" 링크로 내 캘린더에 즉시 하나만 넣는다.
 *
 * 공구 일정은 대부분 종일(all-day)이라 종일 이벤트는 DATE 값으로,
 * 시각이 있는 일정만 UTC 타임스탬프로 내보낸다.
 */

export interface CalendarEvent {
  /** 피드 안에서 안정적으로 유지되어야 하는 식별자 (보통 DB row id) */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO 문자열 또는 YYYY-MM-DD */
  start: string;
  /** 종료 시각. 종일 일정이면 마지막 날(포함 기준) */
  end?: string | null;
  allDay: boolean;
  url?: string | null;
  /** 마지막 수정 시각 — 구글이 변경을 감지하는 데 쓴다 */
  updatedAt?: string | null;
}

const CRLF = "\r\n";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYYMMDD (로컬 날짜 기준) */
function toDateValue(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** YYYYMMDDTHHMMSSZ (UTC) */
function toUtcValue(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** "2026-07-28" 또는 ISO 문자열 → Date. 날짜만 오면 로컬 자정으로 본다. */
function parse(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/** ICS 텍스트 이스케이프 — 쉼표/세미콜론/역슬래시/줄바꿈 */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 권장대로 75옥텟에서 접기 (한글은 UTF-8 3바이트라 여유 있게 자름) */
function fold(line: string): string {
  if (line.length <= 70) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 70));
  rest = rest.slice(70);
  while (rest.length > 69) {
    parts.push(` ${rest.slice(0, 69)}`);
    rest = rest.slice(69);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join(CRLF);
}

/** ICS 캘린더 문서 생성 */
export function buildIcs(
  events: CalendarEvent[],
  options: { name?: string; description?: string } = {}
): string {
  const name = options.name ?? "공구 캠페인 일정";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//gonggu-admin//campaign schedules//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
    // 구독 캘린더 갱신 주기 힌트 (구글은 참고만 하고 자체 주기로 당겨간다)
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  if (options.description) {
    lines.push(`X-WR-CALDESC:${esc(options.description)}`);
  }

  const stamp = toUtcValue(new Date());

  for (const ev of events) {
    const start = parse(ev.start);
    if (Number.isNaN(start.getTime())) continue;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}@gonggu-admin`);
    lines.push(`DTSTAMP:${stamp}`);

    if (ev.allDay) {
      const endInclusive = ev.end ? parse(ev.end) : start;
      // ICS의 종일 DTEND는 배타적이라 마지막 날 +1일
      const exclusive = new Date(
        Number.isNaN(endInclusive.getTime()) ? start : endInclusive
      );
      exclusive.setDate(exclusive.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${toDateValue(start)}`);
      lines.push(`DTEND;VALUE=DATE:${toDateValue(exclusive)}`);
    } else {
      const end = ev.end ? parse(ev.end) : new Date(start.getTime() + 3600_000);
      lines.push(`DTSTART:${toUtcValue(start)}`);
      lines.push(
        `DTEND:${toUtcValue(Number.isNaN(end.getTime()) ? new Date(start.getTime() + 3600_000) : end)}`
      );
    }

    lines.push(fold(`SUMMARY:${esc(ev.title)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`));
    if (ev.url) lines.push(fold(`URL:${esc(ev.url)}`));
    if (ev.updatedAt) {
      const updated = new Date(ev.updatedAt);
      if (!Number.isNaN(updated.getTime())) {
        lines.push(`LAST-MODIFIED:${toUtcValue(updated)}`);
        // 수정할 때마다 올라가야 구글이 변경분을 반영한다
        lines.push(`SEQUENCE:${Math.floor(updated.getTime() / 1000) % 100000}`);
      }
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

/**
 * 팀 공용 구글 캘린더 ID (예: xxx@group.calendar.google.com).
 * 설정해두면 "구글 캘린더에 추가"가 개인 캘린더 대신 이 캘린더를 기본으로 잡는다.
 */
export const TEAM_CALENDAR_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID?.trim() || null;

function toBase64(value: string): string {
  // 캘린더 ID는 ASCII라 btoa/Buffer 어느 쪽이든 동일한 결과가 나온다
  if (typeof btoa === "function") return btoa(value);
  return Buffer.from(value, "utf-8").toString("base64");
}

/** 팀 캘린더를 구글에서 바로 여는 주소. cid는 캘린더 ID의 base64. */
export function teamCalendarLink(): string | null {
  if (!TEAM_CALENDAR_ID) return null;
  return `https://calendar.google.com/calendar/u/0?cid=${toBase64(TEAM_CALENDAR_ID)}`;
}

/**
 * 구글 캘린더 "일정 만들기" 링크 — 클릭하면 미리 채워진 등록 화면이 열린다.
 * 종일 일정의 dates 종료값도 배타적이라 +1일 해야 한다.
 *
 * TEAM_CALENDAR_ID가 있으면 src로 넘겨 그 캘린더에 저장되게 한다.
 * (구글 계정에 해당 캘린더의 쓰기 권한이 있어야 실제로 선택된다)
 */
export function googleCalendarUrl(ev: CalendarEvent): string {
  const start = parse(ev.start);
  let dates: string;

  if (ev.allDay) {
    const endInclusive = ev.end ? parse(ev.end) : start;
    const exclusive = new Date(
      Number.isNaN(endInclusive.getTime()) ? start : endInclusive
    );
    exclusive.setDate(exclusive.getDate() + 1);
    dates = `${toDateValue(start)}/${toDateValue(exclusive)}`;
  } else {
    const end = ev.end ? parse(ev.end) : new Date(start.getTime() + 3600_000);
    dates = `${toUtcValue(start)}/${toUtcValue(end)}`;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
    ctz: "Asia/Seoul",
  });
  if (ev.description) params.set("details", ev.description);
  if (ev.location) params.set("location", ev.location);
  if (TEAM_CALENDAR_ID) params.set("src", TEAM_CALENDAR_ID);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
