/* 주제32 「현재 노예제는 사라졌을까?」 2단 글쓰기 웹앱 — 로직(app.js) */
const CONFIG = {
  SHEET_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec",
  /* 포털 커리큘럼 관리에 이 id 하나로 활동을 등록한다 */
  GAME_NAME: "32차시_현대노예제_글쓰기",
  MIN_CHARS: 2 // 칸마다 비어 있지 않게만 확인한다(분량은 안내만, 막지 않는다)
};

const S = {
  sid: "", name: "", grade: 0, ban: 0, preview: false,
  crit: "", ev: "", judge: "", card: "",
  tab: "A", copied: false, sending: false, submitted: false, padletUrl: ""
};

/* 화면 목록: stage는 위쪽 4단계 막대 */
const SCREENS = { s0: "", s1: "criteria", s2: "read", s4: "wrap" };
const STAGES = ["criteria", "read", "wrap"];

const $ = id => document.getElementById(id);
const byId = (arr, id) => arr.find(x => x.id === id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function show(key) {
  Object.keys(SCREENS).forEach(k => { $(k).hidden = (k !== key); });
  const stage = SCREENS[key];
  $("steps").hidden = !stage;
  const cur = STAGES.indexOf(stage);
  document.querySelectorAll("#steps li").forEach(li => {
    const i = STAGES.indexOf(li.dataset.k);
    li.className = i === cur ? "on" : (i < cur ? "done" : "");
    if (i === cur) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

function parseSid(sid) {
  if (!/^\d{5}$/.test(sid)) return null;
  return { grade: Number(sid[0]), ban: Number(sid.slice(1, 3)), num: Number(sid.slice(3)) };
}

const val = id => $(id).value.trim();

/* ── 고른 값 기억: 새로고침해도 이어서. 학번별 키라 공용 태블릿에서 안 섞인다. 미리보기에선 저장하지 않는다.
 *    글은 draft_guard가 따로 맡는다. */
function storeKey() { return "modern_slavery:" + CONFIG.GAME_NAME + ":" + S.sid; }

function loadPicks() {
  if (S.preview) return;
  try {
    const v = JSON.parse(localStorage.getItem(storeKey()) || "null");
    if (!v) return;
    if (byId(CRITERIA, v.crit)) S.crit = v.crit;
    if (byId(EVIDENCES, v.ev)) S.ev = v.ev;
    if (byId(JUDGES, v.judge)) S.judge = v.judge;
    if (v.card === "A" || v.card === "B") S.card = v.card;
  } catch (e) { /* 저장소가 막히면 메모리만 */ }
}

function savePicks() {
  if (S.preview) return;
  try {
    localStorage.setItem(storeKey(), JSON.stringify({ crit: S.crit, ev: S.ev, judge: S.judge, card: S.card, ts: Date.now() }));
  } catch (e) { /* 저장소가 막히면 메모리만 */ }
}

function clearPicks() {
  try { localStorage.removeItem(storeKey()); } catch (e) { /* 무시 */ }
}

/* ── 시트 전송 ── */
async function postToSheet(payload) {
  if (S.preview) return { result: "success", preview: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000); // 응답이 안 오면 30초 뒤 실패로 돌려 다시 누르게 한다
  let json;
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify(payload), signal: ctl.signal });
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (json.result !== "success") {
    const err = new Error(json.message || "저장 실패");
    err.locked = !!json.locked;
    throw err;
  }
  return json;
}

/* 패들렛 링크는 백엔드 학년정보(포트폴리오)에서 가져온다. 반 정보가 든 링크라 레포에 적지 않는다. */
function ensureUrlScheme(u) {
  u = String(u || "").trim();
  return u && !/^https?:\/\//i.test(u) ? "https://" + u : u;
}

async function loadPadletUrl(grade, ban) {
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL + "?mode=curriculum");
    const json = await res.json();
    const pf = json && json.grades && json.grades[String(grade)] && json.grades[String(grade)].portfolio;
    if (!pf) return "";
    return ensureUrlScheme(pf.urlByBan ? (pf.urlByBan[ban] || pf.urlByBan[String(ban)] || "") : (pf.url || ""));
  } catch (e) {
    return "";
  }
}

/* ── 공용 조각 ── */
/* 선택지: 버튼 대신 role=radio div — 버튼 안은 glossary.js가 밑줄을 못 긋는다 */
function radioGroup(box, options, getVal, setVal, label) {
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  if (label) box.setAttribute("aria-labelledby", label);
  options.forEach(o => {
    const row = el("div", "opt");
    row.setAttribute("role", "radio");
    row.tabIndex = 0;
    row.setAttribute("aria-checked", getVal() === o.id ? "true" : "false");
    row.appendChild(el("span", "opt-box"));
    const p = el("span", "opt-text");
    if (o.mark) p.appendChild(el("b", "opt-mark", o.mark + " "));
    p.appendChild(document.createTextNode(o.text));
    row.appendChild(p);
    const pick = e => {
      if (S.submitted) return; // 제출 뒤에는 고르기를 잠근다(시트에 간 글과 복사 글이 어긋나지 않게)
      setVal(o.id); savePicks();
      box.querySelectorAll(".opt").forEach(r => r.setAttribute("aria-checked", r === row ? "true" : "false"));
    };
    row.addEventListener("click", pick);
    row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e); } });
    box.appendChild(row);
  });
}

/* 복사 글에는 기준 글자(ⓐⓑⓒ)와 근거만 — 선택지 문장은 빼서 양식을 줄인다 */
function critShort() {
  return byId(CRITERIA, S.crit).mark + " (근거: " + byId(EVIDENCES, S.ev).text + ")";
}

function judgeLine() {
  return byId(JUDGES, S.judge).text + " (카드 " + S.card + ")";
}

/* 앞 단계에서 쓴 답을 다음 화면 위에 다시 보여 준다 */
function recapRow(label, main, sub) {
  const row = el("div", "recap-row");
  row.appendChild(el("span", "recap-label", label));
  const t = el("div", "recap-main");
  t.appendChild(el("p", "", main));
  if (sub) t.appendChild(el("p", "recap-sub", sub));
  row.appendChild(t);
  return row;
}

function renderRecap(box) {
  box.innerHTML = "";
  const c = byId(CRITERIA, S.crit);
  box.appendChild(recapRow("내 기준", "내 기준은 " + c.mark + " " + c.text + " (근거: " + byId(EVIDENCES, S.ev).text + ")", "이유: " + val("r1")));
}

/* ── 자료 카드 ── */
function cardEl(card, suffix) {
  const art = el("article", "src-card");
  art.appendChild(el("div", "badge", card.kicker));
  art.appendChild(el("h3", "src-title", card.title));
  card.lines.forEach(l => {
    if (typeof l === "string") art.appendChild(el("p", "", l));
    else art.appendChild(el("p", "compare", l.compare));
  });
  if (card.chart) {
    const fig = el("figure", "chart");
    fig.setAttribute("data-no-gloss", "");
    fig.innerHTML = CHART_SVG.replace(/(hatch|chTitle|chDesc)/g, "$1" + suffix);
    art.appendChild(fig);
  }
  art.appendChild(el("p", "src-source", card.source));
  return art;
}

function renderCardTabs() {
  const tabs = $("tabs"), panels = $("cardPanels");
  tabs.innerHTML = ""; panels.innerHTML = "";
  CARDS.forEach(c => {
    const t = el("button", "tab", c.tab);
    t.type = "button";
    t.id = "tab" + c.id;
    t.setAttribute("role", "tab");
    t.setAttribute("aria-controls", "panel" + c.id);
    t.setAttribute("aria-selected", S.tab === c.id ? "true" : "false");
    t.addEventListener("click", () => { S.tab = c.id; syncTabs(); });
    tabs.appendChild(t);
    const p = el("div", "panel");
    p.id = "panel" + c.id;
    p.setAttribute("role", "tabpanel");
    p.setAttribute("aria-labelledby", "tab" + c.id);
    p.appendChild(cardEl(c, "S2"));
    panels.appendChild(p);
  });
  syncTabs();
}

function syncTabs() {
  CARDS.forEach(c => {
    $("tab" + c.id).setAttribute("aria-selected", S.tab === c.id ? "true" : "false");
    $("panel" + c.id).hidden = S.tab !== c.id;
  });
}

/* ── 글자 수 ── */
function bindCount(taId, cntId) {
  const ta = $(taId), cnt = $(cntId);
  const upd = () => { cnt.textContent = ta.value.trim().length + "자"; };
  ta.addEventListener("input", () => { upd(); ["s1Err", "s2Err", "s4Err"].forEach(i => { $(i).textContent = ""; }); });
  upd();
}

/* ── 시작 ── */
function startApp() {
  const sid = $("sid").value.trim();
  const name = $("sname").value.trim();
  const p = parseSid(sid);
  if (!p) { $("startErr").textContent = "학번은 숫자 5자리로 써 줘. (예: 20512)"; return; }
  if (!name) { $("startErr").textContent = "이름을 써 줘."; return; }
  $("startErr").textContent = "";
  S.sid = sid; S.name = name; S.grade = p.grade; S.ban = p.ban;
  FocusGuard.start({ key: CONFIG.GAME_NAME + ":" + sid }); // 작성 중 화면 이탈·붙여넣기 기록 (history26 snippets/focus_guard.js)
  if (window.DraftGuard) DraftGuard.start({ key: CONFIG.GAME_NAME, sid: sid }); // 글쓰기 칸 임시저장 (history26 v75)
  loadPadletUrl(p.grade, p.ban).then(u => { S.padletUrl = u; renderPadlet(); });
  loadPicks();
  renderStep1();
  show("s1");
}

/* ── 1단 ── */
function renderStep1() {
  radioGroup($("critList"), CRITERIA, () => S.crit, v => { S.crit = v; $("s1Err").textContent = ""; }, "s1Q");
  radioGroup($("evList"), EVIDENCES, () => S.ev, v => { S.ev = v; $("s1Err").textContent = ""; }, "s1EvQ");
}

function goStep2() {
  if (!S.crit) { $("s1Err").textContent = "내 기준을 하나 골라 줘."; return; }
  if (!S.ev) { $("s1Err").textContent = "근거를 하나 골라 줘."; return; }
  if (val("r1").length < CONFIG.MIN_CHARS) { $("s1Err").textContent = "이유를 한 줄 써 줘."; return; }
  renderRecap($("recap2"));
  radioGroup($("judgeList"), JUDGES, () => S.judge, v => { S.judge = v; $("s2Err").textContent = ""; }, "s2JudgeQ");
  radioGroup($("cardPick"), CARDS.map(c => ({ id: c.id, text: "카드 " + c.id })), () => S.card, v => { S.card = v; $("s2Err").textContent = ""; }, "s2CardQ");
  show("s2");
}

/* ── 2단 → 마무리 ── */
function goWrap() {
  if (!S.judge) { $("s2Err").textContent = "판단을 하나 골라 줘."; return; }
  if (!S.card) { $("s2Err").textContent = "판단에 쓴 카드를 골라 줘."; return; }
  if (val("r2").length < CONFIG.MIN_CHARS) { $("s2Err").textContent = "근거를 한 문장 써 줘."; return; }
  renderSummary();
  show("s4");
}

/* 복사 글: 학번·이름 한 줄과 [꼬리표]만 붙이고 나머지는 학생이 쓴 글 */
function bodyText() {
  return [
    "[기준] " + critShort(),
    "이유: " + val("r1"),
    "[판단] " + judgeLine(),
    "근거: " + val("r2")
  ].join("\n");
}

function buildOutText() { return S.sid + " " + S.name + "\n" + bodyText(); }

/* 양식을 뺀 학생 글자 수 */
function studentChars() {
  return ["r1", "r2"].reduce((n, id) => n + val(id).length, 0);
}

function renderSummary() {
  const box = $("summary");
  box.innerHTML = "";
  bodyText().split("\n").forEach(line => box.appendChild(el("p", line.charAt(0) === "[" ? "sum-head" : "sum-line", line)));
  $("bodyCount").textContent = "내가 쓴 글 " + studentChars() + "자 (꼬리표 제외)";
  $("submitBtn").disabled = S.submitted;
  $("submitBtn").textContent = S.submitted ? "제출 완료" : "제출";
  renderPadlet();
}

function renderPadlet() {
  const a = $("padletBtn");
  if (S.padletUrl) {
    a.href = S.padletUrl; a.hidden = false; $("padletMsg").textContent = "";
  } else {
    a.hidden = true; $("padletMsg").textContent = "패들렛 링크는 선생님이 알려 준 곳을 써 줘.";
  }
}

/* ── 제출 ── */
async function submitAll() {
  if (S.sending || S.submitted) return;
  $("s4Err").textContent = "";
  S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: byId(CRITERIA, S.crit).mark + " / " + byId(JUDGES, S.judge).text + " (카드 " + S.card + ")",
    diffSummary: "",
    reflection: bodyText(), // 시트 G열: 답 합본
    choicesJson: JSON.stringify({
      sid: S.sid, name: S.name, ban: S.ban,
      criterion: S.crit, evidence: S.ev, reason1: val("r1"),
      judge: S.judge, card: S.card, reason2: val("r2"),
      ts: new Date().toISOString()
    })
  };
  Object.assign(payload, FocusGuard.payload());
  try {
    await postToSheet(payload);
  } catch (e) {
    $("s4Err").textContent = e.locked ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.";
    S.sending = false; $("submitBtn").disabled = false; $("submitBtn").textContent = "제출";
    return;
  }
  S.sending = false; S.submitted = true;
  if (window.DraftGuard) DraftGuard.clear(); // 저장 성공 → 임시저장 삭제
  clearPicks();
  ["r1", "r2"].forEach(id => { $(id).readOnly = true; }); // 제출 뒤 수정 잠금
  $("submitBtn").textContent = "제출 완료";
  $("outMsg").textContent = S.preview ? "미리보기라 저장하지 않았어." : (S.copied ? "제출했어! 복사한 글을 패들렛에 올려 줘." : "제출했어! 이제 글을 복사해서 패들렛에 올려 줘.");
}

/* ── 복사 → 예시 글 ── */
async function copyOut() {
  const text = buildOutText();
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    const ta = el("textarea");
    ta.value = text; ta.setAttribute("data-no-draft", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
  }
  if (!ok) { $("outMsg").textContent = "복사가 안 됐어. 한 번 더 눌러 줘."; return; }
  S.copied = true;
  $("outMsg").textContent = S.submitted ? "복사했어. 패들렛에 붙여넣기 해." : "복사했어. 제출 버튼도 꼭 눌러 줘!";
  $("exampleBtn").disabled = false;
  $("exampleLock").hidden = true;
}

function renderExamples() {
  const box = $("examples");
  box.innerHTML = "";
  EXAMPLES.forEach(ex => {
    const card = el("div", "example");
    card.appendChild(el("div", "badge", "비교해 볼 예시 글 · " + ex.title));
    ex.lines.forEach(l => card.appendChild(el("p", "", l)));
    box.appendChild(card);
  });
}

function toggleExamples() {
  if (!S.copied) return;
  const box = $("examples");
  box.hidden = !box.hidden;
  $("exampleBtn").setAttribute("aria-expanded", box.hidden ? "false" : "true");
}

/* ── 부팅 (모든 함수 선언 뒤, 파일 맨 마지막) ── */
function init() {
  const q = new URLSearchParams(location.search);
  S.preview = q.get("preview") === "1";
  let sid = (q.get("sid") || "").trim(), name = (q.get("name") || "").trim();
  if (S.preview) {
    $("previewBar").hidden = false;
    if (!sid) sid = "20512";
    if (!name) name = "미리보기";
  }
  $("sid").value = sid; $("sname").value = name;

  $("appTitle").textContent = INTRO.title;
  $("introQ").textContent = INTRO.question;
  $("tbLabel").textContent = INTRO.textbook.label;
  $("tbText").textContent = INTRO.textbook.text;
  INTRO.dates.forEach(x => {
    const li = el("li");
    li.appendChild(el("b", "", x.d));
    li.appendChild(document.createTextNode(" — " + x.t));
    $("dateList").appendChild(li);
  });

  $("s1Q").textContent = STEP1.q;
  $("s1EvQ").textContent = STEP1.evQ;
  $("s1ReasonQ").textContent = STEP1.reasonQ;
  $("r1").placeholder = STEP1.reasonPh;
  $("s1Hint").textContent = STEP1.hint;

  $("s2Q").textContent = STEP2.q;
  $("s2JudgeQ").textContent = STEP2.judgeQ;
  $("s2CardQ").textContent = STEP2.cardQ;
  $("s2ReasonQ").textContent = STEP2.reasonQ;
  $("r2").placeholder = STEP2.reasonPh;
  $("s2Hint").textContent = STEP2.hint;

  $("wrapGuide").textContent = WRAP.guide;
  $("copyBtn").textContent = WRAP.copyBtn;
  $("padletBtn").textContent = WRAP.padletBtn;
  $("exampleBtn").textContent = WRAP.exampleBtn;

  renderCardTabs();
  renderExamples();
  [["r1", "r1c"], ["r2", "r2c"]].forEach(p => bindCount(p[0], p[1]));

  $("startBtn").addEventListener("click", startApp);
  $("s1Next").addEventListener("click", goStep2);
  $("s2Back").addEventListener("click", () => { renderStep1(); show("s1"); });
  $("s2Next").addEventListener("click", goWrap);
  $("s4Back").addEventListener("click", () => show("s2"));
  $("copyBtn").addEventListener("click", copyOut);
  $("submitBtn").addEventListener("click", submitAll);
  $("exampleBtn").addEventListener("click", toggleExamples);
  Glossary.start({ terms: GLOSSARY, skip: ["#steps", ".tab", ".opt"] }); // 어려운 낱말 풀이 (glossary.js)
}

init();
