/**
 * 구글 캘린더 API 연동 (서버 전용) — 서비스 계정으로 팀 공용 캘린더에 직접 쓴다.
 *
 * ICS 구독은 구글이 자체 주기(수 시간)로 당겨가서 즉시성이 없고, 구독한
 * 캘린더는 남에게 재공유도 안 된다. 그래서 앱이 팀 캘린더에 직접 밀어넣는다.
 * 팀 캘린더는 이미 직원들에게 공유돼 있으므로 직원 쪽 추가 작업이 없다.
 *
 * 필요한 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL        서비스 계정 이메일
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  JSON 키의 private_key (\n 이스케이프 허용)
 *   NEXT_PUBLIC_GOOGLE_CALENDAR_ID      대상 캘린더 ID
 *
 * 서비스 계정 이메일을 캘린더 공유 설정에 "변경 권한"으로 넣어야 쓰기가 된다.
 *
 * googleapis 패키지는 무거워서 쓰지 않고, JWT 서명(RS256)과 REST 호출만 직접 한다.
 */

import { createSign } from "crypto";
import { SyncEvent } from "@/lib/calendar-events";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
/** 우리가 만든 이벤트만 골라내기 위한 태그 (사람이 수기로 넣은 일정은 건드리지 않는다) */
const TAG_KEY = "gongguAdmin";
const TAG_VALUE = "1";

export interface GoogleCalendarConfig {
  email: string;
  privateKey: string;
  calendarId: string;
}

/** 환경변수가 다 있으면 설정을 돌려주고, 하나라도 없으면 null */
export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  // Railway 같은 환경에서는 개행이 \n 문자열로 들어오므로 되돌린다
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  ).trim();
  const calendarId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID?.trim();
  if (!email || !privateKey || !calendarId) return null;
  return { email, privateKey, calendarId };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 액세스 토큰 캐시 — 한 요청에서 여러 이벤트를 밀 때 매번 발급받지 않도록 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/** 서비스 계정 JWT를 발급해 액세스 토큰으로 교환한다 */
async function getAccessToken(config: GoogleCalendarConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: config.email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = base64url(signer.sign(config.privateKey));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `구글 토큰 발급 실패: ${body.error ?? res.status} ${body.error_description ?? ""}`
    );
  }

  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** "YYYY-MM-DD" 또는 ISO → 종일 이벤트용 날짜 */
function dateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.slice(0, 10);
}

/** 종일 이벤트의 종료일 +1 (구글도 DTEND가 배타적) */
function exclusiveEnd(value: string): string {
  const d = new Date(`${dateOnly(value)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** SyncEvent → 구글 캘린더 이벤트 리소스 */
function toGoogleEvent(ev: SyncEvent) {
  const start = ev.allDay
    ? { date: dateOnly(ev.start) }
    : { dateTime: new Date(ev.start).toISOString(), timeZone: "Asia/Seoul" };

  const end = ev.allDay
    ? { date: exclusiveEnd(ev.end ?? ev.start) }
    : {
        dateTime: new Date(
          ev.end ?? new Date(new Date(ev.start).getTime() + 3600_000).toISOString()
        ).toISOString(),
        timeZone: "Asia/Seoul",
      };

  return {
    id: ev.googleId,
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    source: ev.url ? { title: "공구 어드민", url: ev.url } : undefined,
    start,
    end,
    // 우리가 만든 이벤트임을 표시 — 정리(reconcile)할 때 이 태그로만 골라낸다
    extendedProperties: { private: { [TAG_KEY]: TAG_VALUE } },
  };
}

async function callApi(
  config: GoogleCalendarConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken(config);
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

const calendarPath = (config: GoogleCalendarConfig) =>
  `/calendars/${encodeURIComponent(config.calendarId)}`;

/**
 * 이벤트 생성 또는 갱신.
 * id가 결정적이라 먼저 update를 시도하고, 없으면(404) insert 한다.
 * 삭제됐던 id로 insert하면 409가 나는데, 그때는 다시 update로 되살린다.
 */
export async function upsertEvent(
  config: GoogleCalendarConfig,
  ev: SyncEvent
): Promise<void> {
  const body = JSON.stringify(toGoogleEvent(ev));
  const base = calendarPath(config);

  const updated = await callApi(
    config,
    `${base}/events/${ev.googleId}`,
    { method: "PUT", body }
  );
  if (updated.ok) return;

  if (updated.status === 404 || updated.status === 410) {
    const inserted = await callApi(config, `${base}/events`, {
      method: "POST",
      body,
    });
    if (inserted.ok) return;
    // 취소 상태로 남아 있던 id — update로 되살린다
    if (inserted.status === 409) {
      const revived = await callApi(config, `${base}/events/${ev.googleId}`, {
        method: "PUT",
        body,
      });
      if (revived.ok) return;
      throw new Error(`이벤트 복구 실패 (${revived.status}): ${await revived.text()}`);
    }
    throw new Error(`이벤트 생성 실패 (${inserted.status}): ${await inserted.text()}`);
  }

  throw new Error(`이벤트 갱신 실패 (${updated.status}): ${await updated.text()}`);
}

/** 이벤트 삭제. 이미 없으면 성공으로 친다. */
export async function deleteEvent(
  config: GoogleCalendarConfig,
  googleEventId: string
): Promise<void> {
  const res = await callApi(
    config,
    `${calendarPath(config)}/events/${googleEventId}`,
    { method: "DELETE" }
  );
  if (res.ok || res.status === 404 || res.status === 410) return;
  throw new Error(`이벤트 삭제 실패 (${res.status}): ${await res.text()}`);
}

/** 우리가 만든 이벤트의 id 목록 (수기 등록 일정은 태그가 없어 제외된다) */
export async function listManagedEventIds(
  config: GoogleCalendarConfig
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "false",
      privateExtendedProperty: `${TAG_KEY}=${TAG_VALUE}`,
      fields: "items(id),nextPageToken",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await callApi(
      config,
      `${calendarPath(config)}/events?${params.toString()}`
    );
    if (!res.ok) {
      throw new Error(`이벤트 목록 조회 실패 (${res.status}): ${await res.text()}`);
    }
    const body = await res.json();
    for (const item of body.items ?? []) if (item.id) ids.push(item.id);
    pageToken = body.nextPageToken;
  } while (pageToken);

  return ids;
}

export interface SyncResult {
  upserted: number;
  deleted: number;
  errors: string[];
}

/**
 * 전체 동기화 — 있어야 할 이벤트는 밀어넣고, 우리가 만들었지만 더 이상
 * 대상이 아닌 이벤트(일정 삭제·캠페인 종료 등)는 지운다.
 */
export async function reconcile(
  config: GoogleCalendarConfig,
  events: SyncEvent[]
): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, deleted: 0, errors: [] };

  const existing = await listManagedEventIds(config);
  const wanted = new Set(events.map((e) => e.googleId));

  for (const ev of events) {
    try {
      await upsertEvent(config, ev);
      result.upserted++;
    } catch (e) {
      result.errors.push(`${ev.title}: ${(e as Error).message}`);
    }
  }

  for (const id of existing) {
    if (wanted.has(id)) continue;
    try {
      await deleteEvent(config, id);
      result.deleted++;
    } catch (e) {
      result.errors.push(`삭제 ${id}: ${(e as Error).message}`);
    }
  }

  return result;
}
