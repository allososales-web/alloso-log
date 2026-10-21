/* =========================================================
 * 알로소의 하루 - 시뮬레이션 데이터 생성/주입기 (Node 실행)
 * ---------------------------------------------------------
 * 현실적인 매장 기록 400건을 만들어 Apps Script 웹앱에 넣는다.
 *   node tools/seed.js            -> 400건 생성 후 주입
 *   node tools/seed.js 200        -> 200건
 *   node tools/seed.js 400 clear  -> 기존 데이터 비우고 400건
 * ========================================================= */

const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxO9o6UCYrbEKBjhTruXg9f6Bif4D4OCOLkKYpBmOA7RA1v-1EBki3pQSL7hzloyORe/exec";

const STORES = ["강남점", "홍대점", "부산서면점", "대전둔산점", "광주충장로점"];
const AVATARS = ["🦊", "🐼", "🐯", "🐱", "🐶", "🦁", "🐧", "🐨", "🐸", "🦉", "🐻", "🐰"];

/* 카테고리별 문장 템플릿 (classify.js의 키워드와 호응하도록 작성) */
const TEMPLATES = {
  stock: [
    "오늘 인기 상품 {item} 재고가 부족해서 발주를 급하게 넣었습니다.",
    "{item} 품절로 고객 문의가 많았고, 입고가 지연되어 판매에 차질이 있었습니다.",
    "진열 상품 수량이 맞지 않아 재고 실사를 다시 진행했습니다.",
    "결품이 잦아 발주 주기를 조정할 필요가 있어 보입니다.",
    "창고 재고와 POS 수량이 달라 확인하는 데 시간이 걸렸습니다."
  ],
  staff: [
    "오늘 직원 한 명이 갑자기 휴무라 인력이 부족해 혼자 바쁘게 근무했습니다.",
    "피크 시간대 일손이 모자라 응대가 늦어졌습니다. 스케줄 조정이 필요합니다.",
    "신규 직원 교대 근무 적응이 아직 어려워 보여 추가 안내를 했습니다.",
    "주말 근무 인력이 계속 부족한 상황이라 채용 건의드립니다.",
    "오늘은 직원들이 손발이 잘 맞아 운영이 매끄러웠습니다."
  ],
  customer: [
    "고객 클레임이 한 건 있었는데 {item} 관련 불만이었고 현장에서 응대해 마무리했습니다.",
    "대기 줄이 길어져 손님 불만이 있었습니다. 응대 동선 개선이 필요합니다.",
    "단골 손님이 직원 친절에 칭찬을 남기고 가셨습니다.",
    "컴플레인 응대 후 환불 처리했고, 재발 방지 안내를 공유했습니다.",
    "고객 문의가 평소보다 많아 응대에 집중한 하루였습니다."
  ],
  facility: [
    "매장 에어컨이 고장 나 수리 요청을 넣었습니다. 손님들이 더워했습니다.",
    "냉장 설비 온도가 불안정해 점검이 필요합니다.",
    "조명 일부가 나가 교체를 요청했습니다.",
    "간판 노후로 야간 가시성이 떨어져 보수 건의드립니다.",
    "화장실 누수가 있어 시설팀에 수리 접수했습니다."
  ],
  hygiene: [
    "위생 점검을 진행했고 유통기한 임박 식자재를 선별 폐기했습니다.",
    "바닥이 미끄러워 안전사고가 날 뻔해 즉시 청소하고 주의 표시를 했습니다.",
    "방역 소독을 정기적으로 진행했습니다. 청결 상태 양호합니다.",
    "식자재 보관 온도 관리가 미흡했던 부분을 개선했습니다.",
    "오픈 전 청소와 소독을 마쳤고 위생 상태를 점검했습니다."
  ],
  sales: [
    "오늘 매출 목표를 초과 달성했습니다. {item} 프로모션 반응이 좋았습니다.",
    "할인 행사 덕분에 객단가가 올라 실적이 개선됐습니다.",
    "이벤트 참여 고객이 많아 결제 대기가 길었습니다.",
    "포스 결제 오류가 한 번 있었지만 바로 처리했습니다.",
    "매출은 평이했지만 신상품 판매가 꾸준했습니다."
  ],
  edu: [
    "신규 직원 교육이 더 필요해 보여 매뉴얼 보완을 건의드립니다.",
    "응대 매뉴얼 개선 제안이 있었습니다. 교육 자료 업데이트가 필요합니다.",
    "직원들이 신상품 교육을 요청해 다음 주 교육을 계획했습니다.",
    "운영 개선 아이디어가 나와 본사에 제안드립니다.",
    "교육 후 응대 품질이 눈에 띄게 좋아졌습니다."
  ],
  ops: [
    "오픈과 마감 정산을 정상적으로 마쳤습니다. 특이사항 없습니다.",
    "본사 공지 전달 사항을 직원들과 공유했습니다.",
    "오늘 회의 내용을 바탕으로 매장 운영 방식을 일부 조정했습니다.",
    "마감 정산에서 소액 차이가 있어 원인을 확인 중입니다.",
    "전반적으로 평온한 하루였고 운영에 큰 문제는 없었습니다."
  ]
};

const ITEMS = ["아메리카노", "시즌 신메뉴", "베이글", "샐러드", "원두", "텀블러", "디저트 세트", "콜드브루", "샌드위치", "케이크"];

const CAT_KEYS = Object.keys(TEMPLATES);

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function makeId(i) { return "sim-" + Date.now().toString(36) + "-" + i; }

function randomDateWithinDays(days) {
  const now = Date.now();
  const past = now - Math.floor(Math.random() * days) * 86400000;
  // 영업시간(09~22시) 사이 랜덤 시각
  const d = new Date(past);
  d.setHours(9 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

/* 카테고리 분포에 약간의 가중치 (이슈 카테고리가 더 자주) */
const WEIGHTED = [
  "stock","stock","stock",
  "staff","staff","staff",
  "customer","customer","customer",
  "facility","facility",
  "hygiene","hygiene",
  "sales","sales",
  "edu","edu",
  "ops","ops"
];

/* 문장 앞뒤에 붙여 고유성을 높이는 변형 요소 */
const TIMES = ["오전", "점심", "오후", "저녁", "마감 무렵", "오픈 직후", "주말", "평일"];
const DEGREES = ["특히 ", "유독 ", "다소 ", "생각보다 ", "예상보다 ", ""];
const TAILS = [
  "내일 다시 점검하겠습니다.",
  "다음 주 회의에서 공유하겠습니다.",
  "본사 피드백을 기다립니다.",
  "직원들과 공유했습니다.",
  "추이를 지켜보겠습니다.",
  "개선안을 정리해 두었습니다.",
  ""
];

function genOne(i) {
  const cat = pick(WEIGHTED);
  const time = pick(TIMES);
  const deg = pick(DEGREES);
  let body = pick(TEMPLATES[cat]).replace("{item}", pick(ITEMS));
  let text = `${time}, ${deg}${body}`;
  // 가끔 두 카테고리를 섞어 더 현실적으로
  if (Math.random() < 0.3) {
    const cat2 = pick(CAT_KEYS);
    text += " 또한 " + pick(TEMPLATES[cat2]).replace("{item}", pick(ITEMS));
  }
  const tail = pick(TAILS);
  if (tail) text += " " + tail;
  return {
    store: pick(STORES),
    writer: pick(AVATARS) + " 익명",
    text: text,
    // 대부분 동의(음성), 일부 비동의(텍스트)로 섞어 agreed 컬럼 검증
    agreed: Math.random() < 0.8,
    // 최근 약 1년(≈4개 분기)에 걸쳐 분포시켜 분기별 분리를 테스트
    createdAt: randomDateWithinDays(330)
  };
}

/* 중복(동일 text) 없이 n건 생성 */
function generate(n) {
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < n && guard < n * 50) {
    guard++;
    const r = genOne(out.length);
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    r.id = makeId(out.length);
    out.push(r);
  }
  return out;
}

async function postJson(payload) {
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const txt = await res.text();
  let data = {};
  try { data = JSON.parse(txt); } catch (_) { throw new Error("비 JSON 응답: " + txt.slice(0, 120)); }
  return data;
}

async function getJson(query) {
  const res = await fetch(BACKEND_URL + "?" + query, { method: "GET" });
  const txt = await res.text();
  let data = {};
  try { data = JSON.parse(txt); } catch (_) { throw new Error("비 JSON 응답: " + txt.slice(0, 120)); }
  return data;
}

async function main() {
  const n = parseInt(process.argv[2] || "400", 10);
  const doClear = process.argv[3] === "clear";

  if (doClear) {
    process.stdout.write("기존 데이터 비우는 중... ");
    // 분기별 시트 전체 비우기 (quarter 미지정 시 현재 분기만 비워지므로 all 지정)
    const r = await postJson({ action: "clearAll", quarter: "all" });
    console.log(r.ok ? "완료" : ("실패: " + (r.error || "")));
  }

  const records = generate(n);
  console.log(`생성한 기록: ${records.length}건`);

  // 1) addBatch 시도 (Code.gs 재배포 시 가능, 가장 빠름)
  // 너무 큰 바디를 피하려고 100건씩 쪼개 전송
  const CHUNK = 100;
  let added = 0;
  let batchWorks = true;

  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    try {
      const r = await postJson({ action: "addBatch", records: slice });
      if (r.ok && (r.added || 0) > 0) { added += r.added; process.stdout.write(`batch ${added}/${records.length}\r`); continue; }
      batchWorks = false;
    } catch (_) { batchWorks = false; }

    if (!batchWorks) {
      // 2) 폴백: 한 건씩 add (구버전 Code.gs 호환)
      for (const rec of slice) {
        try { const rr = await postJson({ action: "add", record: rec }); if (rr.ok) added++; }
        catch (e) { /* 개별 실패는 건너뜀 */ }
        process.stdout.write(`single ${added}/${records.length}\r`);
      }
    }
  }
  console.log(`\n주입 완료: ${added}건`);

  // 검증: 분기 목록을 받아 분기별 건수를 출력
  try {
    const q = await getJson("action=listQuarters");
    const quarters = (q && q.quarters) || [];
    console.log(`\n생성된 분기 시트: ${quarters.length}개 (현재 분기: ${q.current || "?"})`);
    let total = 0;
    for (const qk of quarters) {
      const r = await getJson("action=list&quarter=" + encodeURIComponent(qk));
      const cnt = (r && r.records) ? r.records.length : 0;
      total += cnt;
      console.log(`  - ${qk}: ${cnt}건`);
    }
    console.log(`분기 합계: ${total}건`);
  } catch (e) {
    console.log("검증 조회 실패:", e.message);
  }
}

main().catch((e) => { console.error("오류:", e.message); process.exit(1); });
