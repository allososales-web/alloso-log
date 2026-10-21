/* =========================================================
 * 알로소의 하루 - 카테고리 자동 분류 엔진
 * ---------------------------------------------------------
 * 기록 텍스트를 키워드 사전으로 카테고리에 매핑하고,
 * 마인드맵에 쓸 집계(카테고리별 건수/매장/주의)를 만든다.
 * ========================================================= */

/* 네온 라인 아이콘 (SVG path, 24x24 viewBox) — 톤앤매너 통일 */
const NICONS = {
  stock:    '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/>',          // 박스
  staff:    '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2"/><path d="M15 20c0-2 1.5-3.5 4-3.5"/>', // 사람들
  customer: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/>', // 고객
  facility: '<path d="M14 7a4 4 0 0 1-5.2 5.2L4 17l3 3 4.8-4.8A4 4 0 0 0 17 10l-3-3z"/>',          // 렌치
  hygiene:  '<path d="M12 3C9 7 6 9.5 6 14a6 6 0 0 0 12 0c0-4.5-3-7-6-11z"/>',                      // 물방울
  sales:    '<path d="M4 18l5-5 3 3 7-8"/><path d="M15 8h5v5"/>',                                   // 상승 그래프
  edu:      '<path d="M12 4L2 9l10 5 10-5-10-5z"/><path d="M6 11v4c0 1.5 3 3 6 3s6-1.5 6-3v-4"/>',  // 학사모
  ops:      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4"/>',           // 보드
  etc:      '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',                               // 시계/기타
  store:    '<path d="M4 9l1-4h14l1 4M5 9v10h14V9M9 19v-5h6v5"/>'                                   // 매장
};
function niconSvg(key) {
  return NICONS[key] || NICONS.etc;
}

/* 카테고리 정의: 이름, 아이콘(SVG key), 매칭 키워드, 주의(이슈) 여부 */
const CATEGORIES = [
  { key: "stock",   name: "재고/상품",  icon: "stock", issue: true,
    words: ["재고", "품절", "결품", "입고", "발주", "진열", "상품", "수량", "부족"] },
  { key: "staff",   name: "인력/근무",  icon: "staff", issue: true,
    words: ["인력", "직원", "근무", "스케줄", "휴무", "교대", "일손", "채용", "퇴사", "바쁘", "혼자"] },
  { key: "customer",name: "고객/응대",  icon: "customer", issue: true,
    words: ["고객", "손님", "응대", "클레임", "컴플레인", "항의", "불만", "불친절", "친절", "대기", "줄", "문의"] },
  { key: "facility",name: "시설/장비",  icon: "facility", issue: true,
    words: ["시설", "장비", "고장", "수리", "에어컨", "냉장", "조명", "간판", "누수", "청소", "노후"] },
  { key: "hygiene", name: "위생/안전",  icon: "hygiene", issue: true,
    words: ["위생", "안전", "사고", "청결", "소독", "방역", "오염", "유통기한", "식자재", "다침", "미끄럼"] },
  { key: "sales",   name: "매출/프로모션", icon: "sales", issue: false,
    words: ["매출", "판매", "프로모션", "행사", "할인", "이벤트", "객단가", "목표", "실적", "포스", "결제"] },
  { key: "edu",     name: "교육/개선",  icon: "edu", issue: false,
    words: ["교육", "개선", "건의", "요청", "제안", "매뉴얼", "교육이", "필요", "배우", "훈련"] },
  { key: "ops",     name: "운영/기타",  icon: "ops", issue: false,
    words: ["운영", "오픈", "마감", "정산", "본사", "지시", "공지", "회의", "전달"] }
];

const UNCATEGORIZED = { key: "etc", name: "미분류", icon: "etc", issue: false };

/* 세부 키워드 동의어 묶음: 여러 표현을 하나의 대표어로 통합
   (마인드맵 세부 노드에서 중복처럼 보이는 것 방지) */
const SYNONYMS = {
  "클레임": ["클레임", "컴플레인", "항의", "불만"],
  "대기": ["대기", "줄"],
  "품절": ["품절", "결품"],
  "발주": ["발주", "입고"],
  "직원": ["직원", "인력", "일손"],
  "근무": ["근무", "교대", "스케줄"],
  "교육": ["교육", "교육이", "훈련", "배우"],
  "개선": ["개선", "건의", "제안", "요청"],
  "청소": ["청소", "청결"],
  "소독": ["소독", "방역"]
};
/* 별칭 → 대표어 역맵 */
const ALIAS_TO_CANON = (function () {
  const m = {};
  Object.keys(SYNONYMS).forEach((canon) => SYNONYMS[canon].forEach((a) => (m[a] = canon)));
  return m;
})();
function canonWord(w) { return ALIAS_TO_CANON[w] || w; }

/* 한 기록이 어떤 카테고리들에 속하는지 (복수 가능) */
function categoriesOf(text) {
  const t = text || "";
  const hits = [];
  CATEGORIES.forEach((c) => {
    const n = c.words.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    if (n > 0) hits.push({ key: c.key, score: n });
  });
  if (!hits.length) return [{ key: UNCATEGORIZED.key, score: 0 }];
  // 점수 높은 순
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function catMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || UNCATEGORIZED;
}

/* ---------------------------------------------------------
 * 전체 기록 → 마인드맵 데이터
 * 반환: {
 *   total,
 *   nodes: [{ key, name, icon, issue, count, stores:Set→배열, records:[...] }],
 * }
 * --------------------------------------------------------- */
function buildMindmap(records) {
  const map = {};
  function ensure(key) {
    if (!map[key]) {
      const m = catMeta(key);
      map[key] = { key, name: m.name, icon: m.icon, issue: m.issue, count: 0, stores: new Set(), records: [], childSet: new Set() };
    }
    return map[key];
  }

  records.forEach((r) => {
    const cats = categoriesOf(r.text);
    // 대표 카테고리(최고 점수)에만 리프로 넣되, 다른 카테고리에도 count 반영
    cats.forEach((c, i) => {
      const node = ensure(c.key);
      node.count++;
      if (r.store) node.stores.add(r.store);
      if (i === 0) node.records.push(r); // 대표 카테고리에 기록 귀속
      // 이 카테고리 안에서 등장한 세부 키워드(하위 영역) 수집
      const words = (CATEGORIES.find((cc) => cc.key === c.key) || {}).words || [];
      words.forEach((w) => { if ((r.text || "").includes(w)) node.childSet.add(canonWord(w)); });
    });
  });

  const nodes = Object.values(map)
    .map((n) => ({
      key: n.key, name: n.name, icon: n.icon, issue: n.issue,
      count: n.count, stores: [...n.stores], records: n.records,
      childCount: n.childSet.size // 하위 세부 키워드 종류 수
    }))
    .sort((a, b) => b.count - a.count);

  return { total: records.length, nodes };
}

/* 특정 카테고리에 속하는 기록만 추출 (대표 카테고리 기준) */
function recordsInCategory(records, key) {
  return records.filter((r) => categoriesOf(r.text)[0].key === key);
}

/* ---------------------------------------------------------
 * 드릴다운: 특정 카테고리 안에서 "세부 키워드" 노드를 만든다.
 * 카테고리 정의의 words 중 실제 등장한 것들을 빈도순으로.
 * 반환: { total, nodes:[{key(=단어), name, icon, issue, count, stores[], records[]}] }
 * --------------------------------------------------------- */
function buildCategoryDrill(records, catKey) {
  const meta = catMeta(catKey);
  const inCat = recordsInCategory(records, catKey);
  const words = (CATEGORIES.find((c) => c.key === catKey) || {}).words || [];

  const map = {};
  inCat.forEach((r) => {
    const t = r.text || "";
    // 이 기록에서 등장한 대표어 집합 (동의어는 하나로, 기록당 1회만)
    const canonHit = new Set();
    words.forEach((w) => { if (t.includes(w)) canonHit.add(canonWord(w)); });
    canonHit.forEach((cw) => {
      if (!map[cw]) map[cw] = { key: cw, name: cw, icon: meta.icon, issue: meta.issue, count: 0, stores: new Set(), records: [] };
      map[cw].count++;
      if (r.store) map[cw].stores.add(r.store);
      map[cw].records.push(r);
    });
  });

  let nodes = Object.values(map)
    .map((n) => {
      const stores = [...n.stores];
      // 하위(들어가면 나올) = 이 키워드가 등장한 점포 수
      return { ...n, stores, childCount: stores.length };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { total: inCat.length, nodes, catKey, catName: meta.name, catIcon: meta.icon };
}

/* ---------------------------------------------------------
 * 드릴다운 3단계: 카테고리+세부키워드 안에서 "점포" 노드를 만든다.
 * (최종 내용 직전 단계 = 점포. 점포를 누르면 그 기록 목록이 아래에 뜸)
 * 반환: { total, nodes:[{key(=점포명), name, icon, issue, count, stores[], records[]}] }
 * --------------------------------------------------------- */
function buildWordStores(records, catKey, word) {
  const meta = catMeta(catKey);
  const inCat = recordsInCategory(records, catKey);
  // word가 대표어면 그 별칭들까지 포함해서 매칭
  const variants = SYNONYMS[word] || [word];
  const hit = inCat.filter((r) => variants.some((v) => (r.text || "").includes(v)));

  const map = {};
  hit.forEach((r) => {
    const s = r.store || "미지정";
    if (!map[s]) map[s] = { key: s, name: s, icon: "store", issue: meta.issue, count: 0, stores: new Set([s]), records: [] };
    map[s].count++;
    map[s].records.push(r);
  });

  const nodes = Object.values(map)
    .map((n) => ({ ...n, stores: [...n.stores] }))
    .sort((a, b) => b.count - a.count);

  return { total: hit.length, nodes, catKey, catName: meta.name, catIcon: meta.icon, word };
}

/* ---------------------------------------------------------
 * 점포별 집계 (선택 기록 집합 기준)
 * 반환: [{ store, count, issues, keywords:[[w,c]...], latest, sample:[텍스트...] }]
 * --------------------------------------------------------- */
/* classify 자체 이슈 판정 (summary.js의 ISSUE_WORDS에 의존하지 않음):
   issue=true 카테고리의 키워드가 포함되면 주의 기록으로 본다. */
function isIssueRecord_(text) {
  const t = text || "";
  return CATEGORIES.some((c) => c.issue && c.words.some((w) => t.includes(w)));
}

function buildStoreBreakdown(records) {
  const byStore = {};
  records.forEach((r) => {
    const s = r.store || "미지정";
    if (!byStore[s]) byStore[s] = { store: s, count: 0, issues: 0, records: [], freq: {} };
    const b = byStore[s];
    b.count++;
    b.records.push(r);
    if (isIssueRecord_(r.text)) b.issues++;
    // 카테고리 키워드 빈도
    CATEGORIES.forEach((c) => c.words.forEach((w) => {
      if ((r.text || "").includes(w)) b.freq[w] = (b.freq[w] || 0) + 1;
    }));
  });

  return Object.values(byStore)
    .map((b) => ({
      store: b.store,
      count: b.count,
      issues: b.issues,
      keywords: Object.entries(b.freq).sort((a, z) => z[1] - a[1]).slice(0, 5),
      latest: b.records[0],
      sample: b.records.slice(0, 3).map((r) => r.text)
    }))
    .sort((a, z) => z.count - a.count);
}

/* 점포 한 곳의 간단 요약 문장 */
function storeSummaryLine(b) {
  const parts = [];
  parts.push(`${b.count}건`);
  if (b.issues) parts.push(`주의 ${b.issues}건`);
  if (b.keywords.length) parts.push("주요: " + b.keywords.map((k) => k[0]).join(", "));
  return parts.join(" · ");
}

/* ---------------------------------------------------------
 * 공통 이슈: 2개 이상 점포에서 공통으로 등장한 카테고리 키워드
 * 반환: [{ word, stores:[...], storeCount, total }]
 * --------------------------------------------------------- */
function buildCommonIssues(records) {
  const allWords = [];
  CATEGORIES.forEach((c) => c.words.forEach((w) => allWords.push(w)));
  const uniq = [...new Set(allWords)];

  const result = [];
  uniq.forEach((w) => {
    const stores = new Set();
    let total = 0;
    records.forEach((r) => {
      if ((r.text || "").includes(w)) { total++; if (r.store) stores.add(r.store); }
    });
    if (stores.size >= 2) {
      result.push({ word: w, stores: [...stores], storeCount: stores.size, total });
    }
  });

  // 많은 점포 + 많은 빈도 순
  return result.sort((a, b) => (b.storeCount - a.storeCount) || (b.total - a.total)).slice(0, 10);
}

/* ---------------------------------------------------------
 * 과제(요청사항) 추출
 * 요청/개선/필요/건의 등의 신호가 있는 기록을 과제 후보로 본다.
 * 반환: [{ id, store, text, category, catName, catIcon }]
 * --------------------------------------------------------- */
const REQUEST_SIGNALS = [
  "필요", "요청", "건의", "제안", "개선", "조정", "보완", "교체", "수리",
  "점검", "확인", "검토", "채용", "충원", "교육", "문제", "부족", "지연", "불편"
];

function extractTasks(records) {
  const out = [];
  records.forEach((r) => {
    const t = r.text || "";
    if (REQUEST_SIGNALS.some((w) => t.includes(w))) {
      const cat = categoriesOf(t)[0];
      const meta = catMeta(cat.key);
      out.push({
        id: r.id,
        store: r.store || "미지정",
        text: t,
        createdAt: r.createdAt,
        category: cat.key,
        catName: meta.name,
        catIcon: meta.icon
      });
    }
  });
  return out;
}

/* ---------------------------------------------------------
 * 주요 이슈 TOP 10
 * 모든 카테고리의 세부 키워드(동의어 묶음)를 모아 건수순 상위 10개.
 * 반환: [{ rank, word, catKey, catName, catIcon, issue, count, stores, ratio }]
 * --------------------------------------------------------- */
function buildTopIssues(records, limit) {
  limit = limit || 10;
  const total = records.length || 1;
  const agg = {}; // canonWord -> { count, stores:Set, catKey }

  records.forEach((r) => {
    const t = r.text || "";
    const cat = categoriesOf(t)[0];
    const words = (CATEGORIES.find((c) => c.key === cat.key) || {}).words || [];
    const canonHit = new Set();
    words.forEach((w) => { if (t.includes(w)) canonHit.add(canonWord(w)); });
    canonHit.forEach((cw) => {
      if (!agg[cw]) agg[cw] = { word: cw, count: 0, stores: new Set(), catKey: cat.key };
      agg[cw].count++;
      if (r.store) agg[cw].stores.add(r.store);
    });
  });

  return Object.values(agg)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((x, i) => {
      const m = catMeta(x.catKey);
      return {
        rank: i + 1,
        word: x.word,
        catKey: x.catKey,
        catName: m.name,
        catIcon: m.icon,
        issue: m.issue,
        count: x.count,
        stores: x.stores.size,
        ratio: Math.round((x.count / total) * 100)
      };
    });
}
