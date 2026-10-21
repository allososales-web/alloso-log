/* =========================================================
 * 기록의 창 - 저장/불러오기 공통 로직
 * ---------------------------------------------------------
 * - 구글 시트(Apps Script) URL이 설정돼 있으면 → 시트로 저장/조회
 * - 없으면 → 이 브라우저(localStorage)에 저장/조회
 * 두 경우 모두 같은 함수로 동작하므로 페이지 코드는 신경 쓸 필요가 없습니다.
 * ========================================================= */

const LS_KEY = "girock_records_v1";      /* 로컬 저장 기록 (백엔드 없을 때) */
const LS_PENDING = "girock_pending_v1";  /* 서버 전송 대기(실패) 큐 */

/* 백엔드 URL 가져오기: 설정 화면에서 넣은 값이 우선, 없으면 config 기본값 */
function getBackendUrl() {
  const override = localStorage.getItem("girock_backend_url");
  if (override && override.trim()) return override.trim();
  return (APP_CONFIG.backendUrl || "").trim();
}

function hasBackend() {
  return getBackendUrl().length > 0;
}

/* ---------------------------------------------------------
 * 매장 목록: 설정 페이지에서 바꾼 값(localStorage)이 우선,
 * 없으면 config.js의 기본값을 사용한다.
 * --------------------------------------------------------- */
const LS_STORES = "girock_stores_v1";

function getStores() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_STORES) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (_) {}
  return (APP_CONFIG.stores || []).slice();
}

function setStores(list) {
  const clean = (list || [])
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0);
  // 중복 제거(순서 유지)
  const uniq = [];
  clean.forEach((s) => { if (!uniq.includes(s)) uniq.push(s); });
  localStorage.setItem(LS_STORES, JSON.stringify(uniq));
  return uniq;
}

function resetStores() {
  localStorage.removeItem(LS_STORES);
}

/* ---------------------------------------------------------
 * 매장 목록 - 구글 시트 연동 (공유)
 * - 백엔드가 있으면 시트의 stores를 불러와 localStorage에 캐시
 * - getStores()는 이 캐시를 즉시 반환하므로 다른 페이지도 최신값 사용
 * --------------------------------------------------------- */
async function loadStoresAsync() {
  if (!hasBackend()) return getStores();
  try {
    const url = getBackendUrl() + "?action=listStores";
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("서버 조회 실패 (" + res.status + ")");
    const data = await res.json();
    const list = (data && data.stores) || [];
    if (Array.isArray(list) && list.length) {
      localStorage.setItem(LS_STORES, JSON.stringify(list)); // 캐시
      return list;
    }
    // 서버가 비어 있으면: 로컬/기본값을 서버에 올려 초기화
    const fallback = getStores();
    if (fallback.length) { try { await saveStoresRemote(fallback); } catch (_) {} }
    return fallback;
  } catch (err) {
    // 서버 실패 시 캐시/기본값으로 폴백
    return getStores();
  }
}

/* 매장 목록을 서버(시트)에 저장 + 로컬 캐시 갱신 */
async function saveStoresRemote(list) {
  const uniq = setStores(list); // 로컬 캐시 먼저 갱신(정리된 배열 반환)
  if (!hasBackend()) return uniq;
  const res = await fetch(getBackendUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "saveStores", stores: uniq })
  });
  if (!res.ok) throw new Error("서버 저장 실패 (" + res.status + ")");
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) throw new Error(data.error || "서버가 저장을 거부했습니다.");
  if (data && Array.isArray(data.stores)) {
    localStorage.setItem(LS_STORES, JSON.stringify(data.stores));
    return data.stores;
  }
  return uniq;
}

/* ---------------------------------------------------------
 * 서버 운영 시간대 (시간대 슬롯에 매장 배정)
 * slot = { id, label, start:"09:00", end:"22:00", graceMin, stores:[...] }
 * --------------------------------------------------------- */
const LS_HOURS = "girock_hours_v1";

function getHoursLocal() {
  try { return JSON.parse(localStorage.getItem(LS_HOURS) || "[]"); } catch { return []; }
}

async function loadHours() {
  if (hasBackend()) {
    try {
      const res = await fetch(getBackendUrl() + "?action=getHours", { method: "GET" });
      if (!res.ok) throw new Error("서버 조회 실패 (" + res.status + ")");
      const data = await res.json();
      const slots = (data && data.slots) || [];
      localStorage.setItem(LS_HOURS, JSON.stringify(slots)); // 캐시
      return slots;
    } catch (_) {
      return getHoursLocal();
    }
  }
  return getHoursLocal();
}

async function saveHoursRemote(slots) {
  const clean = Array.isArray(slots) ? slots : [];
  localStorage.setItem(LS_HOURS, JSON.stringify(clean)); // 캐시 먼저
  if (!hasBackend()) return clean;
  const res = await fetch(getBackendUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "saveHours", slots: clean })
  });
  if (!res.ok) throw new Error("서버 저장 실패 (" + res.status + ")");
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) throw new Error(data.error || "서버가 저장을 거부했습니다.");
  return (data && data.slots) || clean;
}

/* "HH:MM" → 분 단위 정수 */
function hmToMin_(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim());
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]);
}

/* 특정 매장이 지금 보고 가능한 시간대인지 판정.
 * 반환: { allowed, slot, reason }
 *  - 매장이 어느 슬롯에도 없으면 제한 없음(allowed=true) 처리
 *  - 슬롯 있으면 start ~ (end + graceMin) 사이면 허용 (자정 넘김 지원)
 */
function checkOperatingHours(store, slots, now) {
  slots = slots || getHoursLocal();
  now = now || new Date();
  const slot = slots.find((s) => (s.stores || []).includes(store));
  if (!slot) return { allowed: true, slot: null, reason: "no-slot" };

  const start = hmToMin_(slot.start);
  const end = hmToMin_(slot.end);
  if (start == null || end == null) return { allowed: true, slot, reason: "bad-time" };

  const grace = Number(slot.graceMin) || 0;
  const cur = now.getHours() * 60 + now.getMinutes();

  // 종료+유예 (자정 넘김 처리)
  let endG = end + grace;
  let within;
  if (end >= start) {
    // 같은 날 영업 (예: 09:00~22:00)
    within = (cur >= start && cur <= endG);
    // endG가 24:00을 넘으면 다음날 새벽까지도 허용
    if (endG >= 1440 && cur <= (endG - 1440)) within = true;
  } else {
    // 자정 넘겨 영업 (예: 18:00~02:00)
    within = (cur >= start || cur <= endG % 1440);
  }
  return { allowed: within, slot, reason: within ? "ok" : "closed" };
}

/* 고유 ID */
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------------------------------------------------
 * 서버로 한 건 전송 (실패 시 throw)
 * --------------------------------------------------------- */
async function postToBackend(entry) {
  const res = await fetch(getBackendUrl(), {
    method: "POST",
    // Apps Script는 단순 요청을 선호하므로 text/plain 사용 (CORS 프리플라이트 회피)
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "add", record: entry })
  });
  if (!res.ok) throw new Error("서버 저장 실패 (" + res.status + ")");
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) {
    throw new Error(data.error || "서버가 저장을 거부했습니다.");
  }
  return true;
}

/* ---------------------------------------------------------
 * 기록 저장
 * record = { store, writer, text, agreed }
 *   agreed: 개인정보/음성데이터 보호 동의 여부 (true=음성 동의, false=비동의·텍스트)
 * 반환: { entry, queued }  (queued=true면 서버 실패로 로컬 대기열에 보관됨)
 * --------------------------------------------------------- */
async function saveRecord(record) {
  const entry = {
    id: makeId(),
    store: record.store,
    writer: record.writer || "익명",
    text: record.text,
    agreed: !!record.agreed,
    createdAt: new Date().toISOString()
  };

  if (hasBackend()) {
    try {
      await postToBackend(entry);
      return { entry, queued: false };
    } catch (err) {
      // 서버 실패 → 데이터 유실 방지를 위해 대기열에 보관
      addPending(entry);
      return { entry, queued: true, error: err.message };
    }
  }

  // 백엔드 없음 → localStorage 저장
  const all = loadLocal();
  all.unshift(entry);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  return { entry, queued: false };
}

/* ---------------------------------------------------------
 * 대기열(서버 전송 실패분) 관리
 * --------------------------------------------------------- */
function loadPending() {
  try { return JSON.parse(localStorage.getItem(LS_PENDING) || "[]"); }
  catch { return []; }
}
function addPending(entry) {
  const q = loadPending();
  q.push(entry);
  localStorage.setItem(LS_PENDING, JSON.stringify(q));
}
function pendingCount() {
  return loadPending().length;
}

/* 대기열을 서버로 재전송. 반환: { sent, left } */
async function flushPending() {
  if (!hasBackend()) return { sent: 0, left: loadPending().length };
  let q = loadPending();
  let sent = 0;
  const remain = [];
  for (const entry of q) {
    try {
      await postToBackend(entry);
      sent++;
    } catch (_) {
      remain.push(entry); // 실패분은 남겨둠
    }
  }
  localStorage.setItem(LS_PENDING, JSON.stringify(remain));
  return { sent, left: remain.length };
}

/* ---------------------------------------------------------
 * 기록 전체 불러오기 (최신순)
 * 백엔드가 있어도, 아직 전송 못한 대기열은 함께 보여준다.
 * --------------------------------------------------------- */
/* quarter: "2026Q4" 지정 분기 / "all" 전체 / 생략 시 현재 분기 */
async function loadRecords(quarter) {
  const q = quarter || currentQuarter();

  if (hasBackend()) {
    let list = [];
    const url = getBackendUrl() + "?action=list&quarter=" + encodeURIComponent(q);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("서버 조회 실패 (" + res.status + ")");
    const data = await res.json();
    list = Array.isArray(data) ? data : (data.records || []);
    // 전송 대기 중인 기록도 합쳐 보여줌 (중복 방지 + 해당 분기 범위만)
    const seen = new Set(list.map((r) => r.id));
    loadPending().forEach((r) => {
      if (seen.has(r.id)) return;
      if (q !== "all" && quarterOf(r.createdAt) !== q) return;
      list.push(r);
    });
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return list;
  }

  // 로컬 모드: 저장된 기록을 분기로 필터링
  const all = loadLocal();
  if (q === "all") return all;
  return all.filter((r) => quarterOf(r.createdAt) === q);
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

/* 로컬 기록 개별 삭제 (백엔드 없을 때만 의미 있음) */
function deleteLocal(id) {
  const all = loadLocal().filter((r) => r.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

/* 로컬 저장 기록 전체 삭제 (테스트용) */
function clearLocal() {
  localStorage.removeItem(LS_KEY);
}

/* ---------------------------------------------------------
 * CSV 내보내기용 문자열 생성
 * --------------------------------------------------------- */
function recordsToCsv(records) {
  const header = ["매장", "기록자", "작성일시", "내용", "동의"];
  const esc = (v) => {
    const s = String(v == null ? "" : v).replace(/"/g, '""');
    return '"' + s + '"';
  };
  const rows = records.map((r) =>
    [r.store, r.writer, fmtDate(r.createdAt), r.text, (r.agreed ? "동의" : "비동의")].map(esc).join(",")
  );
  // 엑셀 한글 깨짐 방지를 위해 BOM 추가
  return "\uFEFF" + [header.map(esc).join(","), ...rows].join("\r\n");
}

/* ---------------------------------------------------------
 * 날짜 보기 좋게
 * --------------------------------------------------------- */
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 오늘 날짜(YYYY-MM-DD) */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------------------------------------------------------
 * 분기 유틸
 * --------------------------------------------------------- */
/* 날짜(ISO/Date) → "2026Q4" 형태 분기 키 */
function quarterOf(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return currentQuarter();
  const q = Math.floor(d.getMonth() / 3) + 1; // 0~2월→Q1 … 9~11월→Q4
  return d.getFullYear() + "Q" + q;
}

/* 현재(오늘) 분기 키 */
function currentQuarter() {
  return quarterOf(new Date());
}

/* 분기 키를 보기 좋게: "2026Q4" → "2026년 4분기" */
function quarterLabel(qk) {
  const m = /^(\d{4})Q([1-4])$/.exec(String(qk || ""));
  if (!m) return String(qk || "");
  return m[1] + "년 " + m[2] + "분기";
}

/* 서버에 존재하는 분기 키 목록 (최신순). 백엔드 없으면 로컬 기록에서 계산 */
async function listQuarters() {
  if (hasBackend()) {
    try {
      const url = getBackendUrl() + "?action=listQuarters";
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("서버 조회 실패 (" + res.status + ")");
      const data = await res.json();
      const list = (data && data.quarters) || [];
      // 현재 분기가 비어 있어도 항상 선택 가능하도록 포함
      const cur = (data && data.current) || currentQuarter();
      if (!list.includes(cur)) list.unshift(cur);
      return list;
    } catch (_) {
      return [currentQuarter()];
    }
  }
  // 로컬: 저장된 기록들의 분기를 수집
  const set = new Set();
  loadLocal().forEach((r) => set.add(quarterOf(r.createdAt)));
  set.add(currentQuarter());
  return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/* 간단한 배너 표시 */
function showBanner(el, type, msg) {
  if (!el) return;
  el.className = "banner show " + type;
  el.textContent = msg;
}
function hideBanner(el) {
  if (!el) return;
  el.className = "banner";
}
