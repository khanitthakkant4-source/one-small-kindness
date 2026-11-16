/* One Small Kindness — app logic (vanilla JS, no build step).
 *
 * Happy path:  welcome → pick → do → water → points → reflect → summary → end
 * Edge cases handled (from the user-flow board):
 *   - not ready ("ไว้ทีหลัง")                → later screen, come back any time
 *   - can't do the chosen activity            → change activity (timer resets)
 *   - already done today                      → progress screen, repeat allowed, no extra points
 *   - can't drag the watering can            → tap the can or the button instead
 *   - save failed                             → retry; points are awarded once per day (idempotent)
 *   - skip reflection                         → generic encouragement card
 *   - feeling worse                           → empathetic message + help options
 *   - away for several days                   → plant never wilts, points never drop
 *   - 7 Care Days                             → Full Bloom, new cycle starts the next day
 *   - continue without choosing an activity  → inline hint, focus moves to the choices
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ content
  const ACTS = [
    { id: "drink-water", name: "ดื่มน้ำสักแก้ว", title: "ดื่มน้ำสักแก้ว", desc: "ค่อย ๆ จิบน้ำช้า ๆ ให้ร่างกายได้สดชื่นอีกครั้ง", past: "ดื่มน้ำ", running: "ค่อย ๆ จิบนะ", next: "วางแก้วน้ำไว้ใกล้ตัว แล้วจิบเรื่อย ๆ ระหว่างวัน" },
    { id: "stretch", name: "ยืดร่างกายเบา ๆ", title: "ยืดร่างกายเบา ๆ 1 นาที", desc: "ยืดแขน หมุนไหล่ ขยับคอช้า ๆ เท่าที่สบาย", past: "ยืดร่างกาย", running: "ยืดช้า ๆ ไม่ต้องฝืน", next: "ลุกขึ้นยืดตัวสั้น ๆ เมื่อนั่งทำงานนาน" },
    { id: "rest-eyes", name: "พักสายตา", title: "พักสายตาสัก 1 นาที", desc: "มองออกไปจากหน้าจอ พักในท่าที่สบาย ไม่ต้องฝืน", past: "พักสายตา", running: "หลับตาพักได้เลย", next: "ลองพักจากหน้าจออีกครั้งเมื่อสะดวก" },
    { id: "breathe", name: "หายใจตามสบาย", title: "หายใจตามสบาย 1 นาที", desc: "หายใจเข้าทางจมูก ออกทางปากช้า ๆ ตามจังหวะของคุณ", past: "หายใจช้า ๆ", running: "", next: "ลองหายใจช้า ๆ 3 ครั้ง เมื่อรู้สึกตึงเครียด" },
    { id: "kind-words", name: "พูดดี ๆ กับตัวเอง", title: "พูดดี ๆ กับตัวเอง", desc: "อ่านประโยคนี้ในใจช้า ๆ หรือพูดออกมาเบา ๆ", past: "พูดดี ๆ กับตัวเอง", running: "", next: "ก่อนนอน ลองบอกตัวเองว่า “วันนี้ฉันทำดีที่สุดแล้ว”" },
    { id: "sit-rest", name: "นั่งพัก", title: "นั่งพักสัก 1 นาที", desc: "วางทุกอย่างลง นั่งเฉย ๆ ให้ร่างกายได้พักจริง ๆ", past: "นั่งพัก", running: "ไม่ต้องทำอะไรเลยก็ได้", next: "หาช่วงสั้น ๆ ได้นั่งพักโดยไม่ต้องทำอะไร" },
  ];
  const AFFIRMATIONS = ["ฉันกำลังทำดีที่สุดแล้ว", "ไม่เป็นไรเลยที่จะพักบ้าง", "ฉันใจดีกับตัวเองได้", "วันนี้แค่นี้ก็เพียงพอแล้ว"];

  // valence order, neutral pre-centred so the default doesn't push a feeling
  const MOODS = [
    { id: "worse", name: "แย่ลง", msg: (a) => `ขอบคุณที่บอกความรู้สึกตรง ๆ นะ วันนี้อาจเป็นวันที่หนัก คุณไม่ต้องผ่านมันคนเดียว` },
    { id: "tired", name: "ยังเหนื่อยอยู่", msg: (a) => `วันนี้คุณได้${a.past}แล้ว แม้จะยังเหนื่อยอยู่ก็ไม่เป็นไร` },
    { id: "neutral", name: "เฉย ๆ", msg: (a) => `รู้สึกเฉย ๆ ก็ไม่เป็นไรนะ วันนี้คุณได้${a.past}แล้ว` },
    { id: "better", name: "ดีขึ้น", msg: (a) => `ดีใจที่รู้สึกดีขึ้นนะ วันนี้คุณได้${a.past}แล้ว` },
    { id: "lighter", name: "เบาขึ้น", msg: (a) => `ดีใจที่ใจคุณเบาขึ้นหลังได้${a.past}นะ` },
  ];
  const GENERIC_MSG = "ขอบคุณที่แบ่งเวลาสั้น ๆ มาดูแลตัวเองวันนี้นะ";
  const CYCLE = 7;
  const POINTS = 10;

  // ------------------------------------------------------------------ helpers
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? Math.min(ms, 60) : ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const act = (id) => ACTS.find((a) => a.id === id);
  const mood = (id) => MOODS.find((m) => m.id === id);
  const stageFor = (days) => (days >= 7 ? 4 : days >= 5 ? 3 : days >= 3 ? 2 : days >= 1 ? 1 : 0);
  let SCALE = 1;   // mockup scale; screen-space measurements are divided by it before use as CSS px
  const box = (el) => {
    const r = el.getBoundingClientRect(), k = SCALE;
    return { left: r.left / k, top: r.top / k, right: r.right / k, bottom: r.bottom / k, width: r.width / k, height: r.height / k };
  };
  const announce = (msg) => { const l = $("#live"); l.textContent = ""; setTimeout(() => (l.textContent = msg), 30); };

  const ICON = {
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    arrow: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    left: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    spark: (c = "#FCBF5B", s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path fill="${c}" d="M12 0c.9 6.6 4.4 10.4 12 12-7.6 1.6-11.1 5.4-12 12-.9-6.6-4.4-10.4-12-12C7.6 10.4 11.1 6.6 12 0Z"/></svg>`,
  };

  // ------------------------------------------------------------------ storage
  const KEY = "osk.v1";
  const OFFSET_KEY = "osk.dayOffset";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { localStorage.setItem(k, v); },            // may throw: callers decide
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  let failNextSave = false;

  const dayOffset = () => Number(store.get(OFFSET_KEY) || 0);
  const today = () => new Date(Date.now() + dayOffset() * 864e5).toLocaleDateString("en-CA");
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  const fresh = () => ({ points: 0, careDays: 0, lastCare: null, gardens: 0, history: [], pending: null });
  let state = load();

  function load() {
    try { return { ...fresh(), ...JSON.parse(store.get(KEY) || "{}") }; } catch { return fresh(); }
  }
  function save(next) {
    store.set(KEY, JSON.stringify(next));
    state = next;
  }
  function trySave(next) {
    try { save(next); return true; } catch { return false; }
  }

  /** New cycle starts the day after Full Bloom; missed days never reduce anything. */
  function rollCycle() {
    if (state.careDays >= CYCLE && state.lastCare !== today()) {
      trySave({ ...state, careDays: 0, gardens: state.gardens + 1 });
    }
  }
  const doneToday = () => state.lastCare === today();

  /** Award once per day. Returns {ok, awarded}. Idempotent: a retry after a failed save never double-counts. */
  function award() {
    if (doneToday()) return { ok: true, awarded: false };
    if (failNextSave) { failNextSave = false; return { ok: false, awarded: false }; }   // tester panel
    const next = { ...state, points: state.points + POINTS, careDays: state.careDays + 1, lastCare: today(), pending: null };
    return trySave(next) ? { ok: true, awarded: true } : { ok: false, awarded: false };
  }

  // ------------------------------------------------------------------ session (this run through the flow)
  const S = { act: null, mood: null, note: "", skipped: false, awardedNow: false, repeat: false, beforeDays: 0 };

  // ------------------------------------------------------------------ view plumbing
  const screen = $("#screen");
  let cleanup = null;
  let current = null;

  function setProgress(n) {
    const p = $("#progress");
    if (!n) { p.hidden = true; return; }
    p.hidden = false;
    p.setAttribute("aria-valuenow", n);
    p.setAttribute("aria-valuetext", `ขั้นที่ ${n} จาก 4`);
    $$("span", p).forEach((s, i) => s.classList.toggle("is-on", i < n));
  }

  function go(name, opts = {}) {
    if (cleanup) { cleanup(); cleanup = null; }
    const view = VIEWS[name];
    const old = screen.firstElementChild;
    const el = document.createElement("section");
    el.className = "view";
    el.dataset.view = name;
    el.innerHTML = view.html(opts);
    setProgress(view.step || 0);
    if (old) {
      old.classList.add("is-leaving");
      setTimeout(() => old.remove(), reduceMotion() ? 0 : 150);
    }
    screen.appendChild(el);
    current = name;
    cleanup = view.mount ? view.mount(el, opts) || null : null;
    seat(el);
    const h = $("h1", el);
    if (h && opts.focus !== false) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    // browser/OS back steps through the screens instead of leaving the site
    if (!opts.fromHistory) {
      if (history.state && history.state.osk) history.pushState({ osk: name }, "");
      else history.replaceState({ osk: name }, "");
    }
    renderDemo();
  }

  /** Back/forward: re-open the screen that entry points at, but never re-run a step that no longer
   *  applies (e.g. watering after today's points were saved) — fall back to where the user really is. */
  addEventListener("popstate", (e) => {
    const v = e.state && e.state.osk;
    const opt = { fromHistory: true };
    if (!v) return;
    const pendingToday = state.pending && state.pending.date === today() && !doneToday();
    if (v === "do") return S.act ? go("do", opt) : go("pick", opt);
    if (v === "water") {
      if (pendingToday) { S.act = state.pending.act; return go("water", opt); }
      return doneToday() ? go("end", opt) : go("pick", opt);
    }
    if (["points", "reflect", "summary"].includes(v)) return S.act && doneToday() ? go(v, opt) : go(doneToday() ? "end" : "welcome", opt);
    if (v === "resume" && !pendingToday) return go(doneToday() ? "end" : "welcome", opt);
    go(v, opt);
  });

  /** Stand the hero on the centre of the room's rug.
   *  The background is `cover`-scaled and bottom-anchored (390×844 art, rug centre at y = 667),
   *  so the rug's on-screen y depends on the device size. Each hero carries data-foot: where its
   *  ground shadow sits, as a fraction of its height from the bottom. We only ever lift the art
   *  (never push it under the buttons) and never past the top of its stage. */
  const RUG = { w: 390, h: 844, y: 667 };
  function seat(view) {
    const hero = view && $("[data-foot]", view);
    if (!hero) return;
    const place = () => {
      hero.style.translate = "";
      $$(".seat-follow", view).forEach((n) => (n.style.translate = ""));
      const dev = box($("#device")), h = box(hero), stage = hero.closest(".stage");
      if (!h.height || !stage) return;
      const k = Math.max(dev.width / RUG.w, dev.height / RUG.h);
      const rugY = dev.bottom - (RUG.h - RUG.y) * k;
      const footY = h.bottom - h.height * Number(hero.dataset.foot);
      const room = Math.max(0, h.top - box(stage).top);
      const dy = Math.max(-room, Math.min(0, rugY - footY));
      hero.style.translate = `0 ${dy.toFixed(1)}px`;
      $$(".seat-follow", view).forEach((n) => (n.style.translate = hero.style.translate));   // e.g. the can stays beside the pot
    };
    if (hero.tagName === "IMG" && !hero.complete) hero.addEventListener("load", place, { once: true });
    place();
    setTimeout(place, 280);   // re-measure once the view's enter animation (translateY) has settled
  }

  /** Inline hero art (assets/heroes.js) — inline so the head layer (.m-head) can be animated.
   *  stage: plant growth stage shown in the pot · mask: keep the eye mask on Mooca's forehead. */
  function heroArt(name, cls, label, { stage = 0, mask = false } = {}) {
    const h = window.OSK_HERO[name];
    const svg = h.plants ? h.svg.replace("{{PLANT}}", h.plants[stage]) : h.svg;
    const foot = h.foot ? ` data-foot="${h.foot}"` : "";
    return `<div class="hero ${cls}${mask ? "" : " no-mask"}" role="img" aria-label="${esc(label)}"${foot}>${svg}</div>`;
  }

  const actions = (primary, secondary) =>
    `<div class="actions">${primary}${secondary || ""}</div>`;
  const btn = (label, action, extra = "") => `<button type="button" class="btn" data-action="${action}" ${extra}>${label}</button>`;
  const link = (label, action) => `<button type="button" class="link" data-action="${action}">${label}</button>`;

  function wire(el, handlers) {
    el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-action]");
      if (t && handlers[t.dataset.action]) handlers[t.dataset.action](e, t);
    });
  }

  // ------------------------------------------------------------------ toast (save failure)
  function toast(msg, retryLabel, onRetry) {
    const t = $("#toast");
    t.innerHTML = `<p>${esc(msg)}</p>${retryLabel ? `<button type="button">${esc(retryLabel)}</button>` : ""}`;
    t.hidden = false;
    const b = $("button", t);
    if (b) {
      b.focus();
      b.onclick = () => { t.hidden = true; onRetry(); };
    }
  }
  const hideToast = () => { $("#toast").hidden = true; };

  // ------------------------------------------------------------------ shared fragments
  function careCard({ chip }) {
    const days = Math.min(state.careDays, CYCLE);
    const bars = Array.from({ length: CYCLE }, (_, i) =>
      `<i class="${i < days ? "is-on" : ""}${S.awardedNow && i === days - 1 ? " is-new" : ""}"></i>`).join("");
    return `
      <div class="care">
        <div class="care__icon"><img src="assets/plant-${stageFor(days)}.svg" alt=""></div>
        <div class="care__main">
          <p class="care__title">Care Day ${days} / ${CYCLE}</p>
          <div class="care__days" role="img" aria-label="ดูแลตัวเองแล้ว ${days} จาก ${CYCLE} วัน">${bars}</div>
        </div>
        ${chip || ""}
      </div>`;
  }
  const pointsChip = () => S.awardedNow
    ? `<span class="chip">${ICON.spark("#E8A523", 14)}+${POINTS} Points</span>`
    : `<span class="chip chip--muted">รับคะแนนวันนี้แล้ว</span>`;

  // ------------------------------------------------------------------ views
  const VIEWS = {
    // ---------------------------------------------------------------- 00 welcome / home
    welcome: {
      html() {
        const away = state.lastCare && daysBetween(state.lastCare, today()) >= 2;
        const sub = away
          ? "ยินดีต้อนรับกลับมานะ ต้นไม้ของคุณยังรออยู่ ไม่ต้องรีบ"
          : "เลือกกิจกรรมเล็ก ๆ ที่เหมาะสมกับคุณในวันนี้";
        return `
          <div class="scroll">
            <div class="intro" style="padding-top:64px">
              <h1>วันนี้คุณอยาก<br>ดูแลตัวเองยังไง?</h1>
              <p class="sub">${sub}</p>
            </div>
            <div class="stage">${heroArt("welcome", "hero-welcome hero-float", "Mooca กอดหัวใจ ยิ้มอย่างอบอุ่น")}</div>
          </div>
          ${actions(btn("เริ่มเลย", "start"), link("ไว้ทีหลัง", "later"))}`;
      },
      mount(el) {
        wire(el, { start: () => go("pick"), later: () => go("later") });
      },
    },

    // ---------------------------------------------------------------- resume: activity done, plant not watered yet
    resume: {
      html() {
        const a = act(state.pending.act);
        return `
          <div class="scroll">
            <div class="intro" style="padding-top:64px">
              <h1>ยินดีต้อนรับกลับมา</h1>
              <p class="sub">วันนี้คุณ${esc(a.past)}ไปแล้ว เหลือแค่รดน้ำให้ต้นไม้ของคุณ</p>
            </div>
            <div class="stage">${heroArt("peek", "hero-peek", "Mooca ยืนข้างกระถางต้นไม้", { stage: stageFor(state.careDays) })}</div>
          </div>
          ${actions(btn("รดน้ำต้นไม้ของคุณ", "water"), link("เลือกกิจกรรมใหม่", "pick"))}`;
      },
      mount(el) {
        wire(el, {
          water: () => { S.act = state.pending.act; S.repeat = false; go("water"); },
          pick: () => go("pick"),
        });
      },
    },

    // ---------------------------------------------------------------- not ready yet
    later: {
      html() {
        return `
          <div class="scroll">
            <div class="intro" style="padding-top:64px">
              <h1>ไว้ค่อยกลับมานะ</h1>
              <p class="sub">ไม่ต้องรีบเลย ต้นไม้ของคุณจะรออยู่ตรงนี้ กลับมาเมื่อคุณพร้อม</p>
            </div>
            <div class="stage">${heroArt("welcome", "hero-welcome hero-float", "Mooca กอดหัวใจรออยู่")}</div>
          </div>
          ${actions(btn("พร้อมแล้ว ไปต่อเลย", "ready"), link("กลับหน้าแรก", "home"))}`;
      },
      mount(el) {
        wire(el, {
          ready: () => (state.pending && state.pending.date === today() && !doneToday() ? go("resume") : go("pick")),
          home: () => home(),
        });
      },
    },

    // ---------------------------------------------------------------- 01 pick
    pick: {
      step: 1,
      html() {
        const cards = ACTS.map((a) => `
          <li class="card">
            <input type="radio" name="act" id="act-${a.id}" value="${a.id}" ${S.act === a.id ? "checked" : ""}>
            <label for="act-${a.id}">
              <img src="assets/act-${a.id}.svg" alt="">
              <span>${a.name}</span>
              <i class="tick" aria-hidden="true">${ICON.check}</i>
            </label>
          </li>`).join("");
        return `
          <div class="scroll">
            <div class="intro intro--pick">
              <h1>เลือกกิจกรรมดูแลตัวเอง 1 อย่าง</h1>
              ${S.repeat ? '<p class="sub">ทำเพิ่มได้ตามสบาย คะแนนและ Care Day นับวันละครั้ง</p>' : ""}
            </div>
            <ul class="cards" role="radiogroup" aria-label="กิจกรรมดูแลตัวเอง">${cards}</ul>
          </div>
          <div class="actions">
            <p class="hint" id="pickHint" role="status" hidden>เลือกกิจกรรมที่อยากทำก่อน 1 อย่างนะ</p>
            ${btn("ทำกิจกรรมนี้", "go", 'aria-describedby="pickHint"')}${link("ไว้ทีหลัง", "later")}
          </div>`;
      },
      mount(el) {
        const hint = $("#pickHint", el);
        const list = $(".cards", el);
        el.addEventListener("change", (e) => {
          if (e.target.name === "act") { S.act = e.target.value; hint.hidden = true; }
        });
        wire(el, {
          go: () => {
            const chosen = $("input[name=act]:checked", el);
            if (!chosen) {
              hint.hidden = false;
              list.classList.remove("is-nudge");
              void list.offsetWidth;
              list.classList.add("is-nudge");
              $("input[name=act]", el).focus();
              return;
            }
            S.act = chosen.value;
            go("do");
          },
          later: () => go("later"),
        });
      },
    },

    // ---------------------------------------------------------------- 02 do the activity (timer)
    do: {
      step: 2,
      html() {
        const a = act(S.act);
        const scene = window.OSK_SVG[a.id];
        const hero = `<div class="hero-do hero-do--${a.id}" role="img" aria-label="Mooca กำลัง${esc(a.name)}" data-foot="${scene.foot}">${scene.svg}</div>`;
        const extra = a.id === "kind-words"
          ? `<p class="affirm" id="affirm" aria-live="polite">“${AFFIRMATIONS[0]}”</p>`
          : `<p class="guide" id="guide" aria-live="polite"></p>`;
        return `
          <div class="scroll ${a.id === "breathe" ? "breathing" : ""}">
            <div class="intro intro--tight">
              <h1>${esc(a.title)}</h1>
              <p class="sub">${esc(a.desc)}</p>
            </div>
            <div class="timer-wrap">
              <div class="timer" id="timer">
                <svg viewBox="0 0 124 124" aria-hidden="true">
                  <circle class="ring-track" cx="62" cy="62" r="56" stroke-width="10" fill="none"/>
                  <circle class="ring-bar" id="ringBar" cx="62" cy="62" r="56" stroke-width="10" fill="none" stroke-linecap="round"/>
                </svg>
                <div class="timer__face">
                  <span class="timer__digits" id="digits" role="timer" aria-live="off">01:00</span>
                  <span class="timer__label" id="tlabel">พร้อมเริ่ม</span>
                </div>
              </div>
              ${extra}
            </div>
            <div class="stage">${hero}</div>
          </div>
          ${actions(btn("เริ่มจับเวลา", "main"), link("เปลี่ยนกิจกรรม", "change"))}`;
      },
      mount(el) {
        const a = act(S.act);
        const total = ($("#demoFast").checked ? 6 : 60) * 1000;
        const R = 56, C = 2 * Math.PI * R;
        const bar = $("#ringBar", el), digits = $("#digits", el), label = $("#tlabel", el), timer = $("#timer", el);
        const main = $("[data-action=main]", el);
        const svg = $(".hero-do svg", el);
        const guide = $("#guide", el), affirm = $("#affirm", el);
        let status = "idle", left = total, endAt = 0, tick = null, cue = null;
        bar.style.strokeDasharray = C;
        bar.style.strokeDashoffset = 0;

        const fmt = (ms) => {
          const s = Math.ceil(ms / 1000);
          return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
        };
        const draw = () => {
          digits.textContent = fmt(left);
          bar.style.strokeDashoffset = C * (1 - left / total);
        };
        const loop = () => {
          left = Math.max(0, endAt - Date.now());
          draw();
          if (left <= 0) finish();
        };
        const startCues = () => {
          if (a.id === "breathe") {
            let inhale = true;
            const step = () => { guide.textContent = inhale ? "หายใจเข้า…" : "หายใจออก…"; inhale = !inhale; };
            step(); cue = setInterval(step, 4000);
          } else if (a.id === "kind-words") {
            let i = 0;
            cue = setInterval(() => {
              i = (i + 1) % AFFIRMATIONS.length;
              affirm.style.opacity = 0;
              setTimeout(() => { affirm.textContent = `“${AFFIRMATIONS[i]}”`; affirm.style.opacity = 1; }, 300);
            }, total / 4);
          } else if (guide) {
            guide.textContent = a.running;
          }
        };
        const stopCues = () => { clearInterval(cue); cue = null; };

        // No pause: the activity is short, so once started the timer simply runs to the end.
        // The main button is locked while it runs; "เปลี่ยนกิจกรรม" stays available.
        function run() {
          status = "running";
          endAt = Date.now() + left;
          tick = setInterval(loop, 250);
          label.textContent = "เหลืออีก";
          main.textContent = "กำลังทำกิจกรรม…";
          main.setAttribute("aria-disabled", "true");
          startCues();
        }
        function finish() {
          status = "done";
          clearInterval(tick);
          stopCues();
          left = 0;
          draw();
          main.removeAttribute("aria-disabled");
          timer.classList.add("is-done");
          $(".timer__face", el).innerHTML =
            `<svg class="timer__check" viewBox="0 0 24 24" fill="none" stroke="#00A28B" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span class="timer__label">ครบแล้ว</span>`;
          if (guide) guide.textContent = "เก่งมาก ทำครบแล้ว";
          main.textContent = "ทำเสร็จแล้ว";
          announce(`ครบเวลาแล้ว ${a.name}เสร็จเรียบร้อย`);
        }

        wire(el, {
          main: () => {
            if (status === "idle") {
              svg.style.setProperty("--dur", `${total}ms`);   // e.g. the glass empties over the whole minute
              svg.classList.add("play");
              run();
              announce(`เริ่มจับเวลา 1 นาที`);
            } else if (status === "done") afterActivity();
          },
          change: () => go("pick"),
        });
        draw();
        return () => { clearInterval(tick); stopCues(); };
      },
    },

    // ---------------------------------------------------------------- 03 water the plant
    water: {
      step: 3,
      html() {
        const st = stageFor(state.careDays);
        const nx = stageFor(state.careDays + 1);
        return `
          <div class="scroll">
            <div class="intro">
              <h1>เติมความใส่ใจให้ต้นไม้</h1>
              <p class="sub">แตะที่บัวรดน้ำ หรือกดปุ่มด้านล่าง</p>
            </div>
            <div class="stage water-stage" id="wstage">
              <img class="can-hint seat-follow" src="assets/drop.svg" alt="">
              <div class="pot" id="pot" data-foot="0.064">
                <img class="pot__now${st === 4 ? " is-bloom" : ""}" src="assets/plant-${st}.svg" alt="ต้นไม้ของคุณ">
                <img class="pot__next${nx === 4 ? " is-bloom" : ""}" src="assets/plant-${nx}.svg" alt="">
              </div>
              <button type="button" class="can seat-follow" id="can" aria-label="รดน้ำต้นไม้">
                <img class="can__idle" src="assets/can.svg" alt="" draggable="false">
                <img class="can__pour" src="assets/can-pour.svg" alt="" draggable="false">
              </button>
              <div class="rain" id="rain"></div>
            </div>
          </div>
          ${actions(btn("รดน้ำต้นไม้ของคุณ", "pour"), link("ไว้ทีหลัง", "later"))}`;
      },
      mount(el) {
        const stage = $("#wstage", el), can = $("#can", el), pot = $("#pot", el), rain = $("#rain", el);
        let busy = false, drag = null, moved = false;

        async function pour() {
          if (busy) return;
          busy = true;
          $("[data-action=pour]", el).setAttribute("aria-disabled", "true");
          $(".can-hint", el).style.display = "none";
          // move the can above the pot, tilt to pour
          const sr = box(stage), cr = box(can);
          const pr = box($(".pot__now", el));   // the visible plant, not the fixed-height box
          // natural (untransformed) position of the can inside the stage
          const baseX = drag ? drag.baseX : cr.left - sr.left, baseY = drag ? drag.baseY : cr.top - sr.top;
          // the pouring art has its spout ~12% from the left: put it over the soil, a little above the rim
          const targetX = pr.left - sr.left + pr.width * 0.5 - cr.width * 0.12;
          const targetY = pr.top - sr.top - cr.height * 0.92;
          can.classList.remove("is-dragging");
          can.style.transform = `translate(${targetX - baseX}px, ${targetY - baseY}px)`;
          await wait(380);
          can.classList.add("is-pouring");
          // droplets from the spout (left side of the pouring can)
          const c2 = box(can);
          const sx = c2.left - sr.left + c2.width * 0.14, sy = c2.top - sr.top + c2.height * 0.55;
          if (!reduceMotion()) {
            for (let i = 0; i < 14; i++) {
              const d = document.createElement("i");
              d.style.left = `${sx + (Math.random() * 26 - 13)}px`;
              d.style.top = `${sy}px`;
              d.style.setProperty("--fall", `${pr.top - sr.top - sy + 18}px`);
              d.style.animationDelay = `${i * 55}ms`;
              rain.appendChild(d);
            }
          }
          await wait(900);
          pot.classList.add("is-growing");
          burst(stage, pr.left - sr.left + pr.width / 2, pr.top - sr.top + 10);
          announce("ต้นไม้ได้รับน้ำแล้ว");
          await wait(900);
          commit();
        }

        function commit() {
          const before = state.careDays;
          const r = award();
          if (!r.ok) {
            toast("บันทึกไม่สำเร็จ กดลองใหม่ได้เลย คะแนนจะไม่นับซ้ำ", "ลองใหม่", commit);
            return;
          }
          hideToast();
          S.awardedNow = r.awarded;
          S.beforeDays = before;
          go("points");
        }

        // drag (pointer) — dropping anywhere near the pot pours; a plain tap pours too
        can.addEventListener("pointerdown", (e) => {
          if (busy) return;
          const sr = box(stage), cr = box(can);
          drag = { x: e.clientX / SCALE, y: e.clientY / SCALE, baseX: cr.left - sr.left, baseY: cr.top - sr.top, dx: 0, dy: 0 };
          moved = false;
          can.setPointerCapture(e.pointerId);
          can.classList.add("is-dragging");
        });
        can.addEventListener("pointermove", (e) => {
          if (!drag || busy) return;
          drag.dx = e.clientX / SCALE - drag.x; drag.dy = e.clientY / SCALE - drag.y;
          if (Math.hypot(drag.dx, drag.dy) > 6) moved = true;
          can.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
        });
        const end = () => {
          if (!drag || busy) return;
          can.classList.remove("is-dragging");
          if (!moved) { drag = null; return; }            // click handler covers taps
          const pr = box(pot), cr = box(can);
          const near = cr.left < pr.right + 30 && cr.right > pr.left - 30 && cr.bottom > pr.top - 90 && cr.top < pr.bottom;
          if (near) pour();
          else { can.style.transform = ""; drag = null; announce("ลากไปใกล้ต้นไม้อีกนิด หรือแตะที่บัวรดน้ำแทนได้"); }
        };
        can.addEventListener("pointerup", end);
        can.addEventListener("pointercancel", () => { can.classList.remove("is-dragging"); can.style.transform = ""; drag = null; });
        can.addEventListener("click", () => { if (!moved) { drag = null; pour(); } moved = false; });

        wire(el, {
          pour: () => pour(),
          later: () => {
            trySave({ ...state, pending: { date: today(), act: S.act } });
            go("later");
          },
        });
        return () => hideToast();
      },
    },

    // ---------------------------------------------------------------- 03b points
    points: {
      step: 3,
      html() {
        const bloom = state.careDays >= CYCLE;
        const st = stageFor(state.careDays);
        return `
          <div class="scroll">
            <div class="intro">
              <h1>ขอบคุณที่ดูแลตัวเองวันนี้</h1>
              <p class="sub">${bloom ? "ครบ 7 วันแล้ว ต้นไม้ของคุณผลิบานเต็มที่" : "ต้นไม้ของคุณได้รับความใส่ใจแล้ว"}</p>
            </div>
            <div class="points" aria-live="polite">
              <span class="spark" style="left:-34px;top:16px">${ICON.spark("#FCBF5B", 22)}</span>
              <span class="spark" style="right:-36px;top:18px">${ICON.spark("#FCBF5B", 22)}</span>
              <span class="spark" style="left:-12px;top:-14px">${ICON.spark("#FCBF5B", 12)}</span>
              <span class="spark" style="right:-14px;top:52px">${ICON.spark("#00C4B3", 12)}</span>
              <div class="points__num" id="pnum">${S.awardedNow ? "+0" : "+0"}</div>
              <div class="points__label">Care Points</div>
              ${!S.awardedNow ? '<div class="badge-bloom">วันนี้รับคะแนนไปแล้ว ไม่นับซ้ำนะ</div>' : ""}
              ${bloom && S.awardedNow ? '<div class="badge-bloom">Full Bloom · ครบ 7 Care Days</div>' : ""}
            </div>
            <div class="stage">${heroArt("peek", "hero-peek", "Mooca ยิ้มอยู่ข้างต้นไม้ที่โตขึ้น", { stage: st })}</div>
          </div>
          ${actions(btn("ต่อไป", "next"), link("ไว้ทีหลัง", "skip"))}`;
      },
      mount(el) {
        const n = $("#pnum", el);
        const target = S.awardedNow ? POINTS : 0;
        if (reduceMotion() || !target) n.textContent = `+${target}`;
        else {
          const t0 = performance.now();
          const step = (t) => {
            const k = Math.min(1, (t - t0) / 700);
            n.textContent = `+${Math.round(target * (1 - Math.pow(1 - k, 3)))}`;
            if (k < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
        wire(el, { next: () => go("reflect"), skip: () => { S.skipped = true; S.mood = null; go("summary"); } });
      },
    },

    // ---------------------------------------------------------------- 04 reflection (optional)
    reflect: {
      step: 4,
      html() {
        const idx = S.mood ? MOODS.findIndex((m) => m.id === S.mood) : 2;
        const faces = MOODS.map((m, i) => `
          <button type="button" class="mood" role="radio" aria-checked="${i === idx}" aria-label="${m.name}" data-i="${i}" tabindex="${i === idx ? 0 : -1}">
            <img src="assets/mood-${m.id}.svg" alt="">
          </button>`).join("");
        return `
          <div class="scroll">
            <div class="intro">
              <h1>ตอนนี้คุณรู้สึกอย่างไร?</h1>
              <p class="sub">ทุกความรู้สึกมีพื้นที่ของตัวเอง</p>
            </div>
            <div class="carousel">
              <div class="carousel__viewport">
                <div class="carousel__track" id="track" role="radiogroup" aria-label="ความรู้สึกตอนนี้">${faces}</div>
              </div>
              <div class="carousel__controls">
                <button type="button" class="arrow" data-action="prev" aria-label="ความรู้สึกก่อนหน้า">${ICON.left}</button>
                <p class="mood-name" id="moodName" aria-hidden="true">${MOODS[idx].name}</p>
                <button type="button" class="arrow" data-action="next" aria-label="ความรู้สึกถัดไป">${ICON.right}</button>
              </div>
            </div>
            <div class="note">
              <label for="note">บันทึกความรู้สึก <small>(ไม่บังคับ)</small></label>
              <textarea id="note" maxlength="200" placeholder="อยากบันทึกความรู้สึกเพิ่มเติม..." aria-describedby="noteCount">${esc(S.note)}</textarea>
              <div class="note__count" id="noteCount">${S.note.length}/200</div>
            </div>
          </div>
          ${actions(btn("บันทึก", "save"), link("ข้ามไปก่อน", "skip"))}`;
      },
      mount(el) {
        const track = $("#track", el), faces = $$(".mood", el), name = $("#moodName", el);
        const vp = $(".carousel__viewport", el);
        let idx = faces.findIndex((f) => f.getAttribute("aria-checked") === "true");

        function layout() {
          // centre the selected face (big = 148, small = 78, gap = 18)
          const w = vp.clientWidth, small = 78, big = 148, gap = 18;
          const leftOfSel = idx * (small + gap);
          track.style.transform = `translateX(${w / 2 - leftOfSel - big / 2}px)`;
        }
        function select(i, focus) {
          idx = Math.max(0, Math.min(MOODS.length - 1, i));
          faces.forEach((f, k) => { f.setAttribute("aria-checked", k === idx); f.tabIndex = k === idx ? 0 : -1; });
          name.textContent = MOODS[idx].name;
          $("[data-action=prev]", el).disabled = idx === 0;
          $("[data-action=next]", el).disabled = idx === MOODS.length - 1;
          layout();
          if (focus) faces[idx].focus();
          announce(MOODS[idx].name);
        }
        track.addEventListener("click", (e) => { const f = e.target.closest(".mood"); if (f) select(+f.dataset.i); });
        track.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); select(idx + 1, true); }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); select(idx - 1, true); }
        });
        // swipe
        let sx = null;
        vp.addEventListener("pointerdown", (e) => { sx = e.clientX; });
        vp.addEventListener("pointerup", (e) => {
          if (sx === null) return;
          const dx = e.clientX - sx; sx = null;
          if (Math.abs(dx) > 40) select(idx + (dx < 0 ? 1 : -1));
        });
        const ta = $("#note", el), count = $("#noteCount", el);
        ta.addEventListener("input", () => { S.note = ta.value; count.textContent = `${ta.value.length}/200`; });
        const ro = new ResizeObserver(layout); ro.observe(vp);
        select(idx);

        wire(el, {
          prev: () => select(idx - 1),
          next: () => select(idx + 1),
          save: () => { S.mood = MOODS[idx].id; S.skipped = false; go("summary"); },
          skip: () => { S.mood = null; S.skipped = true; go("summary"); },
        });
        return () => ro.disconnect();
      },
    },

    // ---------------------------------------------------------------- 05 personalised summary card
    summary: {
      step: 4,
      html() {
        const a = act(S.act), m = S.mood ? mood(S.mood) : null;
        const st = stageFor(state.careDays);
        const hero = heroArt("summary", "hero-summary", "Mooca ยิ้มอยู่ข้างต้นไม้ของคุณ", { stage: st, mask: a.id === "rest-eyes" });
        const msg = m ? m.msg(a) : GENERIC_MSG;
        const pill = `
          <div class="pill">
            <img src="assets/ic-${a.id}.svg" alt="">
            <span>${esc(a.name)}${m ? ` + ${esc(m.name)}` : ""}</span>
            ${m ? `<img src="assets/mood-${m.id}.svg" alt="">` : ""}
          </div>`;
        const bloom = state.careDays >= CYCLE;
        const helpCard = `
          <section class="support" aria-labelledby="helpTitle">
            <h2 id="helpTitle">อยากมีคนคุยด้วยไหม?</h2>
            <p>ถ้าวันนี้หนักเกินจะรับไหว ลองคุยกับคนที่ช่วยได้</p>
            <a href="https://www.ooca.co/" target="_blank" rel="noopener">คุยกับผู้เชี่ยวชาญบน ooca</a>
            <a href="tel:1323">โทรสายด่วนสุขภาพจิต 1323 (ฟรี 24 ชม.)</a>
          </section>`;
        const nextCard = `
          <div class="next">
            <span class="next__icon">${ICON.arrow}</span>
            <div><p class="next__label">ก้าวต่อไป</p><p class="next__text">${esc(bloom ? "พรุ่งนี้เริ่มปลูกต้นใหม่ได้เลย ต้นนี้จะอยู่ในสวนของคุณ" : a.next)}</p></div>
          </div>`;
        return `
          <div class="scroll">
            <div class="intro intro--summary">
              <h1>ขอบคุณที่ให้เวลากับตัวเอง</h1>
              <p class="sub">ทุกความรู้สึกมีพื้นที่ของตัวเอง</p>
            </div>
            ${pill}
            <p class="bubble">${esc(msg)}</p>
            <div class="stage stage--summary">${hero}</div>
            <div class="summary-cards">
              ${careCard({ chip: S.repeat ? '<span class="chip chip--muted">รับคะแนนวันนี้แล้ว</span>' : pointsChip() })}
              ${bloom ? '<div class="badge-bloom" style="margin-top:10px">Full Bloom! ต้นไม้ของคุณผลิบานครบ 7 วัน</div>' : ""}
              ${m && m.id === "worse" ? helpCard : nextCard}
            </div>
          </div>
          ${actions(btn("เสร็จสิ้น", "done"))}`;
      },
      mount(el) {
        // log the day (best effort; never blocks the flow)
        const entry = { date: today(), act: S.act, mood: S.mood, note: S.note || "", at: Date.now() };
        trySave({ ...state, history: [...state.history, entry].slice(-60) });
        wire(el, { done: () => go("end") });
      },
    },

    // ---------------------------------------------------------------- end / already done today
    end: {
      html() {
        const st = stageFor(state.careDays);
        const garden = state.gardens > 0 ? `<p class="sub" style="margin-top:4px">ต้นไม้ในสวนของคุณ: ${state.gardens} ต้น</p>` : "";
        return `
          <div class="scroll">
            <div class="intro" style="padding-top:48px">
              <h1>วันนี้คุณดูแลตัวเองแล้ว</h1>
              <p class="sub">ไม่จำเป็นต้องทำติดต่อกันทุกวัน กลับมาเมื่อไหร่ ต้นไม้ก็ยังรออยู่</p>
              ${garden}
            </div>
            <div class="stage">${heroArt("peek", "hero-peek hero-float", "Mooca ยืนข้างต้นไม้ของคุณ", { stage: st })}</div>
            <div class="summary-cards">${careCard({ chip: `<span class="chip">${ICON.spark("#E8A523", 14)}${state.points} Points</span>` })}</div>
          </div>
          ${actions(btn("ดูแลตัวเองเพิ่มอีกนิด", "again"), link("กลับหน้าแรก", "home"))}`;
      },
      mount(el) {
        wire(el, {
          again: () => { resetSession(); S.repeat = true; go("pick"); },
          home: () => home(true),
        });
      },
    },
  };

  // ------------------------------------------------------------------ flow glue
  function resetSession() {
    Object.assign(S, { act: null, mood: null, note: "", skipped: false, awardedNow: false, repeat: false, beforeDays: 0 });
  }

  function afterActivity() {
    if (S.repeat || doneToday()) {           // already watered today → no second reward
      S.awardedNow = false;
      go("reflect");
      return;
    }
    // remember the finished activity so closing the app before watering can resume later
    trySave({ ...state, pending: { date: today(), act: S.act } });
    go("water");
  }

  /** Entry point (Start — Home / Notification): branch on today's status. */
  function home(fromEnd) {
    rollCycle();
    resetSession();
    if (doneToday()) return go(fromEnd ? "welcome" : "end");
    if (state.pending && state.pending.date === today()) return go("resume");
    go("welcome");
  }

  function burst(stage, x, y) {
    if (reduceMotion()) return;
    const b = document.createElement("div");
    b.className = "sparkle-burst";
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    const dirs = [[-40, -30], [38, -36], [-52, 6], [50, 4], [0, -50]];
    b.innerHTML = dirs.map(([dx, dy], i) => `<i style="--dx:${dx}px;--dy:${dy}px;animation-delay:${i * 60}ms"></i>`).join("");
    stage.appendChild(b);
    setTimeout(() => b.remove(), 1400);
  }

  // ------------------------------------------------------------------ demo / tester panel
  function renderDemo() {
    const dl = $("#demoState");
    if (!dl) return;
    const rows = [
      ["วันที่จำลอง", today()],
      ["Care Day", `${Math.min(state.careDays, CYCLE)} / ${CYCLE}`],
      ["คะแนนรวม", state.points],
      ["ทำแล้ววันนี้", doneToday() ? "ใช่" : "ยัง"],
      ["สวน", `${state.gardens} ต้น`],
    ];
    dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  }

  function initDemo() {
    const demo = $("#demo");
    if (new URLSearchParams(location.search).has("demo")) document.body.classList.add("has-demo");
    $("#demoToggle").addEventListener("click", () => {
      const open = demo.classList.toggle("is-open");
      $("#demoToggle").setAttribute("aria-expanded", open);
    });
    demo.addEventListener("click", (e) => {
      const b = e.target.closest("[data-demo]");
      if (!b) return;
      const k = b.dataset.demo;
      if (k === "nextDay" || k === "skipDays") {
        try { store.set(OFFSET_KEY, String(dayOffset() + (k === "nextDay" ? 1 : 3))); } catch { /* ignore */ }
        home();
      } else if (k === "day6") {
        trySave({ ...state, careDays: 6, points: Math.max(state.points, 60), lastCare: new Date(Date.now() + (dayOffset() - 1) * 864e5).toLocaleDateString("en-CA"), pending: null });
        home();
      } else if (k === "failSave") {
        failNextSave = true;
        b.textContent = "การบันทึกครั้งถัดไปจะล้มเหลว ✓";
      } else if (k === "reset") {
        store.del(KEY); store.del(OFFSET_KEY);
        state = fresh();
        home();
      }
      renderDemo();
    });
  }

  // ------------------------------------------------------------------ phone mockup scale (desktop)
  // The iPhone 18 Pro Max frame is drawn at true point size (470×986) and scaled down to fit the window.
  const mockQuery = matchMedia("(min-width: 600px) and (min-height: 600px)");   // not on phones in landscape
  function fitPhone() {
    const wrap = $("#phoneWrap");
    if (!mockQuery.matches) { SCALE = 1; wrap.style.removeProperty("--s"); return; }
    const panel = innerWidth >= 900 ? 236 + 32 : 0;          // tester panel beside the phone
    const s = Math.min(1, (innerHeight - 40) / 986, (innerWidth - panel - 40) / 470);
    SCALE = Math.max(0.4, s);
    wrap.style.setProperty("--s", SCALE.toFixed(4));
  }
  addEventListener("resize", () => seat(screen.lastElementChild));
  addEventListener("resize", fitPhone);
  mockQuery.addEventListener("change", fitPhone);

  // ------------------------------------------------------------------ boot
  fitPhone();
  initDemo();
  home();
})();
