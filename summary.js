/* =========================================================
 * 기록의 창 - 규칙 기반 자동 요약 (키 불필요)
 * ---------------------------------------------------------
 * 사업부 페이지에 들어가면 즉시 계산해서 보여주는 요약입니다.
 * 외부 호출 없이 브라우저에서 바로 동작합니다.
 * ========================================================= */

/* 한국어 불용어 (요약 키워드에서 제외) — 서술어/연결어/종결어/일반어 */
const STOPWORDS = new Set([
  // 접속/부사
  "그리고", "그래서", "하지만", "그러나", "또한", "또는", "그런데", "그러면", "따라서", "오늘", "하루",
  "정도", "같은", "같이", "때문", "조금", "너무", "정말", "많이", "계속", "다시", "우리", "저희",
  "그냥", "약간", "이번", "경우", "부분", "전반", "전반적", "관련", "현장", "오전", "오후", "점심",
  "저녁", "주말", "평일", "무렵", "직후", "유독", "특히", "다소", "생각보다", "예상보다",
  // 서술/종결어 (문장 끝 표현)
  "있었", "있었습니다", "있습니다", "없습니다", "했습니다", "합니다", "입니다", "됩니다", "됐습니다",
  "드립니다", "주세요", "보입니다", "같습니다", "니다", "하겠습니다", "기다립니다", "공유했습니다",
  "진행했습니다", "마쳤습니다", "필요합니다", "요청했습니다", "건의드립니다", "확인", "점검",
  "진행", "처리", "조정", "마무리", "달성", "발생", "개선안", "피드백", "추이", "본사",
  // 조사/단일어
  "것", "수", "등", "및", "좀", "더", "또", "안", "잘", "이", "그", "저", "제", "건", "중",
  "있어", "없어", "해서", "되어", "하여", "대해", "위해", "통해", "관해", "직원들", "고객들", "손님들"
]);

/* 서술어/종결어 형태를 패턴으로도 걸러낸다 (예: ~습니다, ~했다, ~하다) */
function isStopToken(t) {
  if (STOPWORDS.has(t)) return true;
  if (/(습니다|했습니다|합니다|입니다|됩니다|겠습니다|드립니다|하였습니다)$/.test(t)) return true;
  if (/(했다|한다|됐다|된다|있다|없다|이다)$/.test(t)) return true;
  return false;
}

/* 주의가 필요한 신호어 — 문제/불만/개선 관련 */
const ISSUE_WORDS = [
  "부족", "문제", "불만", "지연", "느리", "실수", "오류", "품절", "재고",
  "클레임", "컴플레인", "항의", "고장", "대기", "혼잡", "인력",
  "교육", "개선", "건의", "요청", "필요", "힘들", "어렵", "불편", "지적",
  "사고", "누락", "결품", "환불", "불친절", "대기시간"
];

/* 단어 끝의 흔한 조사/어미를 떼어 키워드를 깔끔하게 만든다 */
function stripJosa(word) {
  // 2글자 이하이거나 영문/숫자면 그대로
  if (word.length <= 2 || /[a-zA-Z0-9]/.test(word)) return word;
  return word.replace(
    /(들로|들이|들을|들은|들의|들|으로|에서|에게|이라|라고|하고|부터|까지|처럼|보다|이나|거나|은|는|이|가|을|를|에|의|도|만|과|와|로|께|라|고)$/,
    ""
  ) || word;
}

function analyzeRecords(records) {
  const total = records.length;

  // 매장별 집계
  const byStore = {};
  records.forEach((r) => {
    const s = r.store || "미지정";
    if (!byStore[s]) byStore[s] = { count: 0, chars: 0 };
    byStore[s].count++;
    byStore[s].chars += (r.text || "").length;
  });
  const storeCount = Object.keys(byStore).length;

  // 오늘 기록 수
  const today = todayStr();
  const todayCount = records.filter((r) =>
    (r.createdAt || "").slice(0, 10) === today
  ).length;

  // 키워드 빈도 (2글자 이상 한글 토큰, 조사 제거)
  const freq = {};
  records.forEach((r) => {
    const tokens = (r.text || "")
      .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .map((t) => stripJosa(t))
      .filter((t) => t.length >= 2 && !isStopToken(t));
    tokens.forEach((t) => { freq[t] = (freq[t] || 0) + 1; });
  });
  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  // 이슈 신호 포함 기록
  const issueRecords = records.filter((r) =>
    ISSUE_WORDS.some((w) => (r.text || "").includes(w))
  );

  // 이슈 키워드 집계
  const issueFreq = {};
  records.forEach((r) => {
    ISSUE_WORDS.forEach((w) => {
      if ((r.text || "").includes(w)) issueFreq[w] = (issueFreq[w] || 0) + 1;
    });
  });
  const topIssues = Object.entries(issueFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return {
    total, storeCount, todayCount, byStore,
    topKeywords, issueRecords, topIssues
  };
}

/* 규칙 기반 요약 텍스트 생성 */
function buildRuleSummary(a) {
  if (a.total === 0) return "아직 기록이 없습니다.";

  const lines = [];
  lines.push(`전체 ${a.total}건의 기록이 ${a.storeCount}개 매장에서 수집되었습니다. (오늘 ${a.todayCount}건)`);

  if (a.topIssues.length) {
    const t = a.topIssues.map(([w, c]) => `${w}(${c})`).join(", ");
    lines.push(`자주 언급된 이슈 신호: ${t}`);
  }
  if (a.issueRecords.length) {
    lines.push(`주의가 필요한 기록: 전체 중 ${a.issueRecords.length}건에서 부족/문제/개선 관련 언급이 있습니다.`);
  }
  if (a.topKeywords.length) {
    const k = a.topKeywords.slice(0, 6).map(([w]) => w).join(", ");
    lines.push(`핵심 키워드: ${k}`);
  }

  return lines.join("\n");
}
