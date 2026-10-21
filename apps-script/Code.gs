/* =========================================================
 * 기록의 창 - 구글 시트 백엔드 (Google Apps Script)
 * ---------------------------------------------------------
 * 이 코드는 구글 시트에 붙여서 "웹앱"으로 배포하면
 * 사이트에서 기록을 저장(add)하고 불러오기(list)할 수 있게 해줍니다.
 *
 * ★ 분기별 아카이빙
 *   기록은 작성일(createdAt)이 속한 "분기 시트"에 자동 저장됩니다.
 *   예) 2026년 10~12월 기록 → "records_2026Q4" 시트
 *   조회할 때 분기를 지정하면 그 시트 하나만 읽으므로,
 *   데이터가 많이 쌓여도 사업부 페이지 로딩이 느려지지 않습니다.
 *
 * 설정 방법은 같은 폴더의 "구글시트-설정안내.md"를 참고하세요.
 * ========================================================= */

/* 분기 시트 이름 접두어 (실제 시트명 예: records_2026Q4) */
var SHEET_PREFIX = "records_";
/* (구버전) 단일 기록 시트 이름 — 마이그레이션 원본으로만 사용 */
var LEGACY_SHEET = "records";
/* 매장 목록이 저장될 시트 이름 */
var STORES_SHEET = "stores";
/* 설정(key-value: 운영시간 등)이 저장될 시트 이름 */
var SETTINGS_SHEET = "settings";

/* 컬럼 순서 (시트 첫 줄 헤더와 동일)
   agreed: 개인정보/음성데이터 보호 동의 여부 (Y=음성 동의, N=비동의·텍스트 입력) */
var HEADERS = ["id", "store", "writer", "text", "agreed", "createdAt"];

/* ---------------------------------------------------------
 * 분기 유틸
 * --------------------------------------------------------- */
/* Date → "2026Q4" 형태 분기 키 */
function quarterKey_(date) {
  var d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) d = new Date();
  var y = d.getFullYear();
  var q = Math.floor(d.getMonth() / 3) + 1; // 0~2월→Q1 … 9~11월→Q4
  return y + "Q" + q;
}

/* 분기 키 유효성 (예: 2026Q4) */
function isQuarterKey_(s) {
  return /^\d{4}Q[1-4]$/.test(String(s || ""));
}

/* 현재(오늘) 분기 키 */
function currentQuarterKey_() {
  return quarterKey_(new Date());
}

/* ---------------------------------------------------------
 * 분기 시트 가져오기 (없으면 만들고 헤더 작성)
 *   quarter 예: "2026Q4". 생략 시 현재 분기.
 * --------------------------------------------------------- */
function getQuarterSheet_(quarter) {
  var qk = isQuarterKey_(quarter) ? quarter : currentQuarterKey_();
  var name = SHEET_PREFIX + qk;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS);
  }
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

/* 존재하는 분기 키 목록 (최신순) */
function listQuarterKeys_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var keys = [];
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName();
    if (nm.indexOf(SHEET_PREFIX) === 0) {
      var qk = nm.slice(SHEET_PREFIX.length);
      if (isQuarterKey_(qk)) keys.push(qk);
    }
  }
  // 최신 분기가 앞에 오도록 내림차순 정렬
  keys.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });
  return keys;
}

/* 한 시트의 기록을 읽어 배열로.
   헤더 행을 보고 컬럼 위치를 찾으므로, agreed 컬럼이 없는 구버전 시트도 안전하게 읽는다. */
function readSheetRecords_(sh) {
  var values = sh.getDataRange().getValues();
  var records = [];
  if (!values.length) return records;

  var header = values[0].map(function (h) { return String(h).trim(); });
  function col(name, fallback) {
    var idx = header.indexOf(name);
    return idx === -1 ? fallback : idx;
  }
  var iId = col("id", 0), iStore = col("store", 1), iWriter = col("writer", 2),
      iText = col("text", 3), iAgreed = header.indexOf("agreed"),
      // createdAt: 헤더에 있으면 그 위치, 없던 구버전은 5번째(인덱스4)
      iCreated = col("createdAt", iAgreed === -1 ? 4 : 5);

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[iId]) continue;
    var rec = {
      id: String(row[iId]),
      store: String(row[iStore]),
      writer: String(row[iWriter]),
      text: String(row[iText]),
      createdAt: toIso_(row[iCreated])
    };
    if (iAgreed !== -1) rec.agreed = (String(row[iAgreed]) === "Y");
    records.push(rec);
  }
  return records;
}

/* 매장 목록 시트 가져오기 (없으면 생성 + 헤더) */
function getStoresSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STORES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(STORES_SHEET);
    sh.appendRow(["store"]);
  }
  if (sh.getLastRow() === 0) sh.appendRow(["store"]);
  return sh;
}

/* 매장 목록 읽기 (배열) */
function readStores_() {
  var sh = getStoresSheet_();
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var v = String(values[i][0] || "").trim();
    if (v) out.push(v);
  }
  return out;
}

/* 매장 목록 전체 교체 저장 */
function writeStores_(list) {
  var sh = getStoresSheet_();
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1); // 헤더만 남기고 비우기
  var clean = [];
  (list || []).forEach(function (s) {
    var v = String(s || "").trim();
    if (v && clean.indexOf(v) === -1) clean.push(v);
  });
  if (clean.length) {
    var rows = clean.map(function (s) { return [s]; });
    sh.getRange(2, 1, rows.length, 1).setValues(rows);
  }
  return clean;
}

/* ---------------------------------------------------------
 * 설정(settings) 시트 — key/value (운영시간 JSON 등)
 * --------------------------------------------------------- */
function getSettingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET);
    sh.appendRow(["key", "value"]);
  }
  if (sh.getLastRow() === 0) sh.appendRow(["key", "value"]);
  return sh;
}

function getSetting_(key) {
  var sh = getSettingsSheet_();
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === key) return String(values[i][1] || "");
  }
  return "";
}

function setSetting_(key, value) {
  var sh = getSettingsSheet_();
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

/* JSON 응답 도우미 */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------
 * GET: 조회
 *   list        : 기록 목록 (분기 지정 가능)
 *     예) ...../exec?action=list              → 현재 분기
 *         ...../exec?action=list&quarter=2026Q3 → 지정 분기
 *         ...../exec?action=list&quarter=all   → 전체(느릴 수 있음)
 *   listQuarters: 존재하는 분기 키 목록
 *   listStores  : 매장 목록
 * --------------------------------------------------------- */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action || "list";

    if (action === "list") {
      var quarter = params.quarter || "";
      var records = [];

      if (quarter === "all") {
        // 모든 분기 시트를 합쳐서 반환 (데이터가 많으면 느릴 수 있음)
        var keys = listQuarterKeys_();
        for (var k = 0; k < keys.length; k++) {
          var shk = getQuarterSheet_(keys[k]);
          records = records.concat(readSheetRecords_(shk));
        }
      } else {
        var qk = isQuarterKey_(quarter) ? quarter : currentQuarterKey_();
        var sh = getQuarterSheet_(qk);
        records = readSheetRecords_(sh);
      }

      return json_({
        ok: true,
        quarter: (quarter === "all") ? "all" : (isQuarterKey_(quarter) ? quarter : currentQuarterKey_()),
        quarters: listQuarterKeys_(),
        records: records
      });
    }

    if (action === "listQuarters") {
      return json_({ ok: true, quarters: listQuarterKeys_(), current: currentQuarterKey_() });
    }

    if (action === "listStores") {
      return json_({ ok: true, stores: readStores_() });
    }

    if (action === "getHours") {
      var raw = getSetting_("operatingHours");
      var slots = [];
      try { slots = raw ? JSON.parse(raw) : []; } catch (e) { slots = []; }
      return json_({ ok: true, slots: slots });
    }

    return json_({ ok: false, error: "알 수 없는 action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------------------------------------------------------
 * POST: 저장
 *   add      : 한 건 저장 (createdAt 분기 시트에 자동 저장)
 *   addBatch : 여러 건 저장 (각 건의 분기로 자동 분류)
 *   clearAll : (옵션 quarter) 분기 시트 비우기, 미지정 시 현재 분기
 *   saveStores: 매장 목록 저장
 * --------------------------------------------------------- */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || "add";

    if (action === "add") {
      var r = body.record || {};
      if (!r.text) return json_({ ok: false, error: "text 가 비어 있습니다." });
      var createdAt = r.createdAt || new Date().toISOString();
      var sh = getQuarterSheet_(quarterKey_(createdAt));
      sh.appendRow([
        r.id || (Date.now() + ""),
        r.store || "",
        r.writer || "익명",
        r.text || "",
        (r.agreed ? "Y" : "N"),
        createdAt
      ]);
      return json_({ ok: true, quarter: quarterKey_(createdAt) });
    }

    if (action === "addBatch") {
      var list = body.records || [];
      if (!list.length) return json_({ ok: false, error: "records 가 비어 있습니다." });

      // 분기별로 묶어서 시트마다 한 번에 기록 (빠름)
      var buckets = {}; // quarterKey -> rows[]
      for (var i = 0; i < list.length; i++) {
        var x = list[i] || {};
        var ca = x.createdAt || new Date().toISOString();
        var qk = quarterKey_(ca);
        if (!buckets[qk]) buckets[qk] = [];
        buckets[qk].push([
          x.id || (Date.now() + "_" + i),
          x.store || "",
          x.writer || "익명",
          x.text || "",
          (x.agreed ? "Y" : "N"),
          ca
        ]);
      }
      var added = 0;
      for (var key in buckets) {
        if (!buckets.hasOwnProperty(key)) continue;
        var rows = buckets[key];
        var shb = getQuarterSheet_(key);
        shb.getRange(shb.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
        added += rows.length;
      }
      return json_({ ok: true, added: added, quarters: Object.keys(buckets) });
    }

    if (action === "clearAll") {
      var quarter = body.quarter || "";
      if (quarter === "all") {
        var keys = listQuarterKeys_();
        for (var c = 0; c < keys.length; c++) {
          var shc = getQuarterSheet_(keys[c]);
          var lastC = shc.getLastRow();
          if (lastC > 1) shc.deleteRows(2, lastC - 1);
        }
        return json_({ ok: true, cleared: keys });
      }
      var qk2 = isQuarterKey_(quarter) ? quarter : currentQuarterKey_();
      var sh2 = getQuarterSheet_(qk2);
      var last2 = sh2.getLastRow();
      if (last2 > 1) sh2.deleteRows(2, last2 - 1);
      return json_({ ok: true, cleared: [qk2] });
    }

    if (action === "saveStores") {
      var saved = writeStores_(body.stores || []);
      return json_({ ok: true, stores: saved });
    }

    if (action === "saveHours") {
      var slots = body.slots || [];
      setSetting_("operatingHours", JSON.stringify(slots));
      return json_({ ok: true, slots: slots });
    }

    // 분기 시트를 통째로 삭제 (헤더 구조 변경 시 초기화용). 다음 저장 때 새 헤더로 재생성됨.
    if (action === "resetQuarterSheets") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var removed = [];
      listQuarterKeys_().forEach(function (qk) {
        var sh = ss.getSheetByName(SHEET_PREFIX + qk);
        if (sh) { ss.deleteSheet(sh); removed.push(qk); }
      });
      return json_({ ok: true, removed: removed });
    }

    return json_({ ok: false, error: "알 수 없는 action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------------------------------------------------------
 * ★ 일회성 마이그레이션
 *   기존 단일 "records" 시트의 데이터를 분기별 시트로 옮깁니다.
 *   Apps Script 편집기에서 이 함수를 "실행"으로 한 번만 돌리세요.
 *   (원본 records 시트는 지우지 않고 그대로 둡니다. 확인 후 수동 삭제 권장)
 * --------------------------------------------------------- */
function migrateToQuarters() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var legacy = ss.getSheetByName(LEGACY_SHEET);
  if (!legacy) {
    Logger.log("옮길 기존 '" + LEGACY_SHEET + "' 시트가 없습니다.");
    return;
  }
  var records = readSheetRecords_(legacy);
  if (!records.length) {
    Logger.log("기존 시트에 데이터가 없습니다.");
    return;
  }

  // 분기별로 묶기
  var buckets = {};
  records.forEach(function (r) {
    var qk = quarterKey_(r.createdAt);
    if (!buckets[qk]) buckets[qk] = [];
    buckets[qk].push([r.id, r.store, r.writer, r.text, (r.agreed ? "Y" : "N"), r.createdAt]);
  });

  var summary = [];
  for (var key in buckets) {
    if (!buckets.hasOwnProperty(key)) continue;
    var rows = buckets[key];
    var sh = getQuarterSheet_(key);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    summary.push(key + ": " + rows.length + "건");
  }
  Logger.log("마이그레이션 완료 → " + summary.join(", "));
  Logger.log("확인 후 기존 '" + LEGACY_SHEET + "' 시트는 수동으로 삭제하세요.");
}

/* 날짜 값을 ISO 문자열로 */
function toIso_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v || "");
}
