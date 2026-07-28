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

/**
 * 환경변수의 private key를 OpenSSL이 받아들이는 PEM으로 정규화한다.
 *
 * 실무에서 깨지는 경우가 많아 전부 흡수한다:
 *  - JSON에서 값을 따옴표째 복사해 "-----BEGIN…" 으로 들어온 경우
 *  - 개행이 \n 문자열로 이스케이프된 경우 (\\n 으로 이중 이스케이프된 경우 포함)
 *  - 붙여넣기 과정에서 개행이 통째로 사라져 한 줄이 된 경우
 * 이걸 놓치면 서명 단계에서 DECODER routines::unsupported 로만 보여 원인을 찾기 어렵다.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // 이중 이스케이프를 먼저 풀어야 한 번만 남은 것과 섞이지 않는다
  key = key
    .replace(/\\\\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

  // JSON에서 한 줄을 통째로 복사하면 앞에 "private_key": 가, 뒤에 ", 가 붙어 온다.
  // 앞뒤 군더더기와 무관하게 PEM 블록만 뽑아낸다.
  const block = key.match(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/
  );
  if (block) key = block[0];

  // 개행이 하나도 없으면 PEM 본문을 64자씩 끊어 형식을 복원한다
  if (!key.includes("\n")) {
    const m = key.match(
      /^-----BEGIN ([A-Z ]+)-----\s*([\s\S]*?)\s*-----END \1-----$/
    );
    if (m) {
      const body = m[2].replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) ?? [];
      key = `-----BEGIN ${m[1]}-----\n${lines.join("\n")}\n-----END ${m[1]}-----`;
    }
  }

  return `${key.trim()}\n`;
}

/** private key가 PEM 꼴인지 — 진단 메시지에 쓴다 */
export function looksLikePem(key: string): boolean {
  return (
    /^-----BEGIN [A-Z ]*PRIVATE KEY-----\n/.test(key) &&
    /-----END [A-Z ]*PRIVATE KEY-----\n?$/.test(key)
  );
}

/** base64로 감싸 넣은 값도 받아준다 (일부 배포 환경에서 개행 보존용으로 쓰는 방식) */
function tryDecodeBase64(value: string): string | null {
  const t = value.trim();
  if (t.length < 40 || !/^[A-Za-z0-9+/=\s]+$/.test(t)) return null;
  try {
    const decoded = Buffer.from(t, "base64").toString("utf-8");
    if (decoded.includes("PRIVATE KEY") || decoded.trimStart().startsWith("{")) {
      return decoded;
    }
  } catch {
    // base64가 아니었을 뿐
  }
  return null;
}

/**
 * 자격증명 추출 — 넣는 방법이 여러 가지라 전부 받아준다.
 *  1) GOOGLE_SERVICE_ACCOUNT_JSON 에 JSON 키 파일 내용을 통째로
 *  2) GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 에 private_key 값만
 *  3) 2번 자리에 실수로 JSON 파일 전체를 넣은 경우도 알아서 꺼내 쓴다
 * 각 값은 base64로 감싸 넣어도 된다.
 */
function extractCredentials(): { email: string | null; privateKey: string | null } {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null;
  let keySource =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ??
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ??
    null;
  if (!keySource) return { email, privateKey: null };

  const decoded = tryDecodeBase64(keySource);
  if (decoded) keySource = decoded;

  const trimmed = keySource.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      if (!email && typeof json.client_email === "string") {
        email = json.client_email.trim();
      }
      if (typeof json.private_key === "string") {
        return { email, privateKey: normalizePrivateKey(json.private_key) };
      }
    } catch {
      // JSON이 깨진 경우 — 아래 진단에서 형태를 알려준다
    }
    return { email, privateKey: null };
  }

  return { email, privateKey: normalizePrivateKey(keySource) };
}

/** 환경변수가 다 있으면 설정을 돌려주고, 하나라도 없으면 null */
export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const { email, privateKey } = extractCredentials();
  const calendarId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID?.trim();
  if (!email || !privateKey || !calendarId) return null;
  return { email, privateKey, calendarId };
}

/**
 * 넣은 값의 "형태"만 설명한다 — 키 내용은 절대 노출하지 않고
 * 무엇이 잘못 들어갔는지만 판단할 수 있게 한다.
 */
export function describeKeySource(): string {
  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ??
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!raw) return "값 없음 — 환경변수가 비어 있습니다.";

  const t = raw.trim();
  const facts: string[] = [`길이 ${t.length}자`];
  if (tryDecodeBase64(t)) facts.push("base64로 감싸져 있음(자동 해제됨)");
  if (t.startsWith("{")) facts.push("JSON 객체 (파일 전체 — 자동으로 private_key를 꺼냅니다)");
  else if (t.startsWith('"') || t.startsWith("'")) facts.push("따옴표로 시작(자동 제거됨)");
  else if (t.startsWith("-----BEGIN")) facts.push("PEM 헤더로 시작");
  else facts.push("PEM도 JSON도 아닌 형태 — 값이 잘렸거나 잘못 복사되었을 수 있습니다");

  if (!t.includes("PRIVATE KEY")) {
    facts.push("'PRIVATE KEY' 문구가 없음 — 값이 잘렸을 가능성이 큽니다");
  }
  facts.push(`줄 수 ${t.split(/\r?\n/).length}`);
  return facts.join(" · ");
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

  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claim}`);
    signature = base64url(signer.sign(config.privateKey));
  } catch (e) {
    // OpenSSL은 "DECODER routines::unsupported" 같은 메시지만 주므로
    // 실제 원인(키 형식 깨짐)을 짚어준다
    throw new Error(
      `서비스 계정 private key를 읽지 못했습니다 (${(e as Error).message}). ` +
        `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 값이 JSON의 private_key 그대로인지, ` +
        `앞뒤 따옴표가 섞여 들어가지 않았는지 확인해 주세요. ` +
        `/api/calendar/sync?test=1 로 진단할 수 있습니다.`
    );
  }
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
 * 구글 API 오류를 사람이 바로 조치할 수 있는 한국어 메시지로 바꾼다.
 * 원문 JSON을 그대로 토스트에 띄우면 무엇을 해야 하는지 알 수 없다.
 */
async function describeApiError(
  res: Response,
  action: string
): Promise<string> {
  const text = await res.text();
  let reason = "";
  let message = "";
  try {
    const body = JSON.parse(text);
    reason = body.error?.errors?.[0]?.reason ?? "";
    message = body.error?.message ?? "";
  } catch {
    // JSON이 아니면 원문 일부만 쓴다
  }

  if (
    res.status === 403 &&
    (reason === "requiredAccessLevel" || /writer access/i.test(message))
  ) {
    return (
      "캘린더 쓰기 권한이 없습니다. 구글 캘린더에서 해당 캘린더 → 설정 및 공유 → " +
      "'특정 사용자 또는 그룹과 공유'에 서비스 계정 이메일을 추가하고, " +
      "권한을 '일정 변경' 이상으로 지정해 주세요."
    );
  }
  if (res.status === 403 && reason === "rateLimitExceeded") {
    return "구글 API 호출 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (res.status === 404) {
    return (
      "캘린더를 찾을 수 없습니다. NEXT_PUBLIC_GOOGLE_CALENDAR_ID가 맞는지, " +
      "서비스 계정이 그 캘린더의 공유 목록에 있는지 확인해 주세요."
    );
  }
  if (res.status === 401) {
    return "구글 인증이 거부되었습니다. 서비스 계정 키가 유효한지 확인해 주세요.";
  }
  return `${action} 실패 (${res.status}): ${message || text.slice(0, 200)}`;
}

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
      throw new Error(await describeApiError(revived, "이벤트 복구"));
    }
    throw new Error(await describeApiError(inserted, "이벤트 생성"));
  }

  throw new Error(await describeApiError(updated, "이벤트 갱신"));
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
  throw new Error(await describeApiError(res, "이벤트 삭제"));
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
      throw new Error(await describeApiError(res, "이벤트 목록 조회"));
    }
    const body = await res.json();
    for (const item of body.items ?? []) if (item.id) ids.push(item.id);
    pageToken = body.nextPageToken;
  } while (pageToken);

  return ids;
}

/**
 * 연동 진단 — 토큰 발급과 캘린더 접근까지 실제로 시도해 어디서 막혔는지 알려준다.
 * 키 자체는 절대 응답에 담지 않는다.
 */
export async function diagnose(config: GoogleCalendarConfig): Promise<{
  ok: boolean;
  serviceAccountEmail: string;
  calendarId: string;
  privateKeyLooksLikePem: boolean;
  privateKeyLines: number;
  keySourceShape: string;
  tokenIssued: boolean;
  calendarAccessible: boolean;
  error: string | null;
  hint: string | null;
}> {
  const base = {
    serviceAccountEmail: config.email,
    calendarId: config.calendarId,
    privateKeyLooksLikePem: looksLikePem(config.privateKey),
    privateKeyLines: config.privateKey.split("\n").filter(Boolean).length,
    // 넣은 값의 형태(내용 아님) — 무엇이 잘못 들어갔는지 판단용
    keySourceShape: describeKeySource(),
  };

  try {
    await getAccessToken(config);
  } catch (e) {
    return {
      ...base,
      ok: false,
      tokenIssued: false,
      calendarAccessible: false,
      error: (e as Error).message,
      hint: base.privateKeyLooksLikePem
        ? "키 형식은 맞아 보입니다. 서비스 계정 이메일이 JSON의 client_email과 같은지 확인해 주세요."
        : "private key가 PEM 형식이 아닙니다. JSON의 private_key 값을 따옴표 없이 그대로 넣어 주세요.",
    };
  }

  // 캘린더 접근 — 공유 설정에 서비스 계정이 빠지면 여기서 404/403이 난다
  const res = await callApi(config, `${calendarPath(config)}/events?maxResults=1`);
  if (!res.ok) {
    const text = await res.text();
    return {
      ...base,
      ok: false,
      tokenIssued: true,
      calendarAccessible: false,
      error: `캘린더 접근 실패 (${res.status}): ${text.slice(0, 300)}`,
      hint:
        res.status === 404
          ? "캘린더를 찾을 수 없습니다. 캘린더 ID가 맞는지, 그리고 캘린더 공유 설정에 서비스 계정 이메일이 추가됐는지 확인해 주세요."
          : res.status === 403
            ? "권한이 없습니다. 캘린더 공유 설정에서 서비스 계정 권한을 '변경 및 공유 관리 권한'으로 올려 주세요."
            : "Google Calendar API가 프로젝트에서 사용 설정됐는지 확인해 주세요.",
    };
  }

  return {
    ...base,
    ok: true,
    tokenIssued: true,
    calendarAccessible: true,
    error: null,
    hint: "연동 정상입니다. '팀 캘린더 동기화'를 눌러 기존 일정을 올리세요.",
  };
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
