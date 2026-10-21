/* =========================================================
 * 기록의 창 - Gemini(AI) 요약 로직
 * ---------------------------------------------------------
 * 사업부 페이지에서 입력한 Gemini API 키로 직접 호출합니다.
 * 키는 사업부 담당자 브라우저(localStorage)에만 저장됩니다.
 * ========================================================= */

const GEMINI_KEY_LS = "girock_gemini_key";
const GEMINI_MODEL_LS = "girock_gemini_model";

/* 사용할 모델. 키 입력란 옆에서 바꿀 수 있습니다.
 * 모델명이 바뀌어도 이 값만 수정하면 됩니다. */
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";

function getGeminiKey() {
  return (localStorage.getItem(GEMINI_KEY_LS) || "").trim();
}
function setGeminiKey(k) {
  localStorage.setItem(GEMINI_KEY_LS, (k || "").trim());
}
function getGeminiModel() {
  return (localStorage.getItem(GEMINI_MODEL_LS) || GEMINI_DEFAULT_MODEL).trim();
}
function setGeminiModel(m) {
  localStorage.setItem(GEMINI_MODEL_LS, (m || GEMINI_DEFAULT_MODEL).trim());
}
function hasGeminiKey() {
  return getGeminiKey().length > 0;
}

/* ---------------------------------------------------------
 * 기록 목록을 받아 AI 요약 프롬프트를 만든다.
 * --------------------------------------------------------- */
function buildPrompt(records, scopeLabel) {
  const lines = records.map((r, i) => {
    return `${i + 1}) [${r.store}] (${fmtDate(r.createdAt)}) ${r.text}`;
  });

  return [
    "당신은 유통/매장 운영을 총괄하는 사업부의 분석 담당자입니다.",
    "아래는 여러 매장 매니저들이 남긴 하루 기록입니다.",
    `분석 대상: ${scopeLabel} (총 ${records.length}건)`,
    "",
    "다음 형식으로 한국어로 간결하게 정리해 주세요. 과장 없이 사실 기반으로 작성합니다.",
    "",
    "【오늘의 핵심 요약】",
    "- 3~5개의 불릿으로 전체 흐름을 요약",
    "",
    "【매장별 주요 이슈】",
    "- 매장명: 핵심 이슈 한두 줄 (기록이 있는 매장만)",
    "",
    "【반복·공통 문제】",
    "- 여러 매장에서 공통으로 나타난 문제나 패턴",
    "",
    "【추천 대처방안】",
    "- 사업부가 바로 실행할 수 있는 구체적 조치 3~5개 (우선순위 순)",
    "",
    "===== 기록 원문 =====",
    ...lines
  ].join("\n");
}

/* ---------------------------------------------------------
 * Gemini 호출
 * --------------------------------------------------------- */
async function summarizeWithGemini(records, scopeLabel) {
  const key = getGeminiKey();
  if (!key) throw new Error("API 키가 설정되지 않았습니다.");
  if (!records.length) throw new Error("요약할 기록이 없습니다.");

  const model = getGeminiModel();
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";

  const body = {
    contents: [
      { role: "user", parts: [{ text: buildPrompt(records, scopeLabel) }] }
    ],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = "";
    try {
      const e = await res.json();
      detail = e.error && e.error.message ? e.error.message : "";
    } catch (_) {}
    if (res.status === 400 && /API key/i.test(detail)) {
      throw new Error("API 키가 올바르지 않습니다. 키를 다시 확인해주세요.");
    }
    if (res.status === 403) {
      throw new Error("이 키로 Gemini API 사용 권한이 없습니다. (" + (detail || "403") + ")");
    }
    if (res.status === 404) {
      throw new Error("모델명을 찾을 수 없습니다: " + model + " — 모델명을 확인해주세요.");
    }
    throw new Error("Gemini 호출 실패 (" + res.status + "): " + (detail || ""));
  }

  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  const text = parts ? parts.map((p) => p.text || "").join("") : "";
  if (!text.trim()) {
    throw new Error("AI 응답이 비어 있습니다. 잠시 후 다시 시도해주세요.");
  }
  return text.trim();
}

/* 키 유효성 간단 확인 (가벼운 호출) */
async function testGeminiKey() {
  return summarizeWithGemini(
    [{ store: "테스트", createdAt: new Date().toISOString(), text: "연결 확인용 메시지입니다." }],
    "연결 테스트"
  );
}
