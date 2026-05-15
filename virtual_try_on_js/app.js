"use strict";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const STORAGE_KEY = "gemini-virtual-try-on:apiKey";

const $ = (id) => document.getElementById(id);

const els = {
  apiKey: $("apiKey"),
  rememberKey: $("rememberKey"),
  model: $("model"),
  listModelsBtn: $("listModelsBtn"),
  sampleCount: $("sampleCount"),
  imageSize: $("imageSize"),
  temperature: $("temperature"),
  seed: $("seed"),
  verbose: $("verbose"),
  clearLogBtn: $("clearLogBtn"),
  form: $("tryOnForm"),
  personFile: $("personFile"),
  productFile: $("productFile"),
  personInfo: $("personInfo"),
  personWrap: $("personWrap"),
  productInfo: $("productInfo"),
  productWrap: $("productWrap"),
  prompt: $("prompt"),
  submitBtn: $("submitBtn"),
  status: $("status"),
  resultsGrid: $("resultsGrid"),
  log: $("log"),
  logCount: $("logCount"),
};

let logCount = 0;

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function timestamp() {
  const d = new Date();
  return (
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes()) +
    ":" +
    pad2(d.getSeconds()) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

function log(level, msg) {
  if (level === "verbose" && !els.verbose.checked) return;
  const line = document.createElement("span");
  line.className = "log-line " + level;
  const ts = document.createElement("span");
  ts.className = "ts";
  ts.textContent = "[" + timestamp() + "]";
  line.appendChild(ts);
  line.appendChild(document.createTextNode(msg));
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
  logCount += 1;
  els.logCount.textContent = logCount + " lines";
}

const logInfo = (m) => log("info", m);
const logVerbose = (m) => log("verbose", "[verbose] " + m);
const logError = (m) => log("error", m);
const logOk = (m) => log("ok", m);
const logWarn = (m) => log("warn", m);

function setStatus(msg, kind) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (kind ? " " + kind : "");
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageDims(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}

function showImage(wrap, src) {
  wrap.innerHTML = "";
  const img = new Image();
  img.src = src;
  wrap.appendChild(img);
}

function getApiKey() {
  const k = (els.apiKey.value || "").trim();
  if (!k) throw new Error("API Key가 비어 있습니다.");
  return k;
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function previewFile(file, wrap, infoEl, label) {
  if (!file) {
    wrap.innerHTML = '<p class="placeholder">파일을 선택하면 표시됩니다.</p>';
    infoEl.textContent = "";
    return;
  }
  const url = URL.createObjectURL(file);
  showImage(wrap, url);
  const dims = await loadImageDims(url);
  infoEl.textContent =
    `${file.name} · ${file.type || "?"} · ${formatBytes(file.size)} · ` +
    `${dims.w}×${dims.h}`;
  logVerbose(
    `Selected ${label}: ${file.name} (${file.size} bytes, mime=${
      file.type || "?"
    }, ${dims.w}x${dims.h})`
  );
}

async function handlePersonChange() {
  const file = els.personFile.files && els.personFile.files[0];
  await previewFile(file, els.personWrap, els.personInfo, "person image");
}

async function handleProductChange() {
  const file = els.productFile.files && els.productFile.files[0];
  await previewFile(file, els.productWrap, els.productInfo, "product image");
}

async function listModels() {
  let key;
  try {
    key = getApiKey();
  } catch (e) {
    setStatus(e.message, "error");
    logError(e.message);
    return;
  }
  setStatus("모델 목록 조회 중...", "");
  const url = API_BASE + "/models";
  logVerbose("GET " + url);
  try {
    const res = await fetch(url, { headers: { "x-goog-api-key": key } });
    const text = await res.text();
    logVerbose("Received " + text.length + " bytes (HTTP " + res.status + ")");
    if (!res.ok) throw new Error("HTTP " + res.status + ": " + text);
    const data = JSON.parse(text);
    const models = (data.models || [])
      .filter((m) => {
        const methods =
          m.supportedActions || m.supportedGenerationMethods || [];
        if (!methods.includes("generateContent")) return false;
        const name = (m.name || "").replace(/^models\//, "");
        return name.toLowerCase().includes("image");
      })
      .map((m) => ({
        name: (m.name || "").replace(/^models\//, ""),
        display: m.displayName || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!models.length) {
      logWarn("이미지 생성 모델을 찾을 수 없습니다.");
      setStatus("모델 없음", "warn");
      return;
    }

    const prev = els.model.value;
    els.model.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.name;
      opt.textContent = m.display ? `${m.name}  (${m.display})` : m.name;
      els.model.appendChild(opt);
    }
    if ([...els.model.options].some((o) => o.value === prev)) {
      els.model.value = prev;
    }
    logOk("Loaded " + models.length + " image-capable models.");
    for (const m of models) {
      logInfo("  " + m.name + (m.display ? "  " + m.display : ""));
    }
    setStatus("모델 " + models.length + "개 로드됨", "ok");
  } catch (err) {
    logError("모델 목록 조회 실패: " + err.message);
    setStatus("모델 조회 실패", "error");
  }
}

function buildRequestBody(
  personMime,
  personB64,
  productMime,
  productB64,
  prompt,
  imageSize,
  temperature,
  seed
) {
  const body = {
    contents: [
      {
        parts: [
          { text: "Image 1 (person):" },
          { inline_data: { mime_type: personMime, data: personB64 } },
          { text: "Image 2 (clothing):" },
          { inline_data: { mime_type: productMime, data: productB64 } },
          { text: prompt },
        ],
      },
    ],
  };

  const generationConfig = {};
  if (imageSize) {
    generationConfig.imageConfig = { imageSize };
  }
  if (Number.isFinite(temperature)) {
    generationConfig.temperature = temperature;
  }
  if (Number.isFinite(seed)) {
    generationConfig.seed = seed;
  }
  if (Object.keys(generationConfig).length) {
    body.generationConfig = generationConfig;
  }
  return body;
}

function extractInlineImage(data) {
  const candidates = data.candidates || [];
  for (const c of candidates) {
    const parts = (c.content && c.content.parts) || [];
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      if (inline && inline.data) {
        return {
          mimeType: inline.mimeType || inline.mime_type || "image/png",
          data: inline.data,
        };
      }
    }
  }
  return null;
}

function collectTextParts(data) {
  const out = [];
  for (const c of data.candidates || []) {
    for (const p of (c.content && c.content.parts) || []) {
      if (p.text) out.push(p.text);
    }
  }
  return out.join("\n");
}

function sumUsage(usages) {
  const total = {
    prompt: 0,
    cached: 0,
    output: 0,
  };
  for (const u of usages) {
    if (!u) continue;
    total.prompt += u.promptTokenCount || 0;
    total.cached += u.cachedContentTokenCount || 0;
    total.output += u.candidatesTokenCount || 0;
  }
  return total;
}

function printAggregateUsage(usages) {
  const usable = usages.filter(Boolean);
  if (!usable.length) return;
  const t = sumUsage(usable);
  const nonCached = Math.max(t.prompt - t.cached, 0);
  logInfo("Token usage (sum of " + usable.length + " calls):");
  logInfo("  Cached Input Token:     " + t.cached);
  logInfo("  Non-cached Input Token: " + nonCached);
  logInfo("  Output Token:           " + t.output);
}

function renderPlaceholders(n) {
  els.resultsGrid.innerHTML = "";
  const cards = [];
  for (let i = 0; i < n; i++) {
    const card = document.createElement("figure");
    card.className = "image-card";

    const cap = document.createElement("figcaption");
    const title = document.createElement("strong");
    title.textContent = "Sample " + (i + 1);
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = "대기 중...";
    cap.appendChild(title);
    cap.appendChild(meta);
    card.appendChild(cap);

    const wrap = document.createElement("div");
    wrap.className = "image-wrap";
    const ph = document.createElement("p");
    ph.className = "placeholder";
    ph.textContent = "생성 중...";
    wrap.appendChild(ph);
    card.appendChild(wrap);

    const row = document.createElement("div");
    row.className = "download-row";
    card.appendChild(row);

    els.resultsGrid.appendChild(card);
    cards.push({ card, meta, wrap, row });
  }
  return cards;
}

function fillCardImage(slot, b64, mime, idx) {
  const blob = base64ToBlob(b64, mime);
  const url = URL.createObjectURL(blob);
  slot.wrap.innerHTML = "";
  const im = new Image();
  im.src = url;
  im.onload = () => {
    slot.meta.textContent =
      `${mime} · ${formatBytes(blob.size)} · ` +
      `${im.naturalWidth}×${im.naturalHeight}`;
    logVerbose(
      `Sample ${idx + 1}: ${im.naturalWidth}x${im.naturalHeight}, ` +
        `${formatBytes(blob.size)}, mime=${mime}`
    );
  };
  slot.wrap.appendChild(im);

  const dl = document.createElement("a");
  dl.className = "secondary";
  dl.href = url;
  const ext = mime.includes("jpeg") ? "jpg" : mime.split("/")[1] || "png";
  dl.download = `try_on_${idx + 1}.${ext}`;
  dl.textContent = "다운로드";
  slot.row.innerHTML = "";
  slot.row.appendChild(dl);
}

function fillCardError(slot, msg) {
  slot.wrap.innerHTML = "";
  const ph = document.createElement("p");
  ph.className = "placeholder";
  ph.textContent = "실패: " + msg;
  slot.wrap.appendChild(ph);
  slot.meta.textContent = "error";
}

async function callOnce(idx, url, key, body) {
  const start = performance.now();
  logVerbose(`Sample ${idx + 1}: POST started`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  logVerbose(
    `Sample ${idx + 1}: response in ${elapsed}s (HTTP ${res.status}, ${
      text.length
    } bytes)`
  );
  if (!res.ok) {
    logError(`Sample ${idx + 1} API 응답 오류:\n` + text);
    throw new Error("HTTP " + res.status);
  }
  const data = JSON.parse(text);
  const textParts = collectTextParts(data);
  if (textParts) logInfo(`Sample ${idx + 1} text: ${textParts}`);

  const inline = extractInlineImage(data);
  if (!inline) {
    logError(`Sample ${idx + 1} 응답에 이미지가 없습니다:\n` + text);
    throw new Error("이미지 없음");
  }
  return { inline, usage: data.usageMetadata || null, elapsed };
}

async function handleSubmit(evt) {
  evt.preventDefault();
  els.submitBtn.disabled = true;
  setStatus("처리 중...", "");

  try {
    const key = getApiKey();
    const personFile = els.personFile.files && els.personFile.files[0];
    const productFile = els.productFile.files && els.productFile.files[0];
    if (!personFile) throw new Error("인물 이미지를 선택하세요.");
    if (!productFile) throw new Error("의상 이미지를 선택하세요.");

    const prompt = els.prompt.value.trim();
    if (!prompt) throw new Error("프롬프트를 입력하세요.");

    const model = els.model.value.trim() || "gemini-2.5-flash-image";
    const sampleCount = Math.max(
      1,
      Math.min(4, parseInt(els.sampleCount.value, 10) || 1)
    );
    const imageSize = els.imageSize.value || "";

    const tempVal = els.temperature.value.trim();
    const temperature = tempVal ? parseFloat(tempVal) : NaN;

    const seedVal = els.seed.value.trim();
    const seed = seedVal ? parseInt(seedVal, 10) : NaN;

    const personMime = personFile.type || "image/png";
    const productMime = productFile.type || "image/png";

    logVerbose("Model:          " + model);
    logVerbose("Sample count:   " + sampleCount);
    if (imageSize) logVerbose("Image size:     " + imageSize);
    if (Number.isFinite(temperature))
      logVerbose("Temperature:    " + temperature);
    if (Number.isFinite(seed)) logVerbose("Seed:           " + seed);
    logVerbose(
      `Person:  ${personFile.name} (${personFile.size} bytes, ${personMime})`
    );
    logVerbose(
      `Product: ${productFile.name} (${productFile.size} bytes, ${productMime})`
    );
    logVerbose("Prompt: " + JSON.stringify(prompt));

    logVerbose("Encoding images to base64...");
    const [personB64, productB64] = await Promise.all([
      fileToBase64(personFile),
      fileToBase64(productFile),
    ]);
    logVerbose(
      `Base64 lengths: person=${personB64.length}, product=${productB64.length}`
    );

    const url =
      API_BASE + "/models/" + encodeURIComponent(model) + ":generateContent";
    logVerbose("POST " + url + " × " + sampleCount + " (parallel)");

    const slots = renderPlaceholders(sampleCount);

    const start = performance.now();
    const promises = [];
    for (let i = 0; i < sampleCount; i++) {
      const perCallSeed = Number.isFinite(seed) ? seed + i : NaN;
      const body = buildRequestBody(
        personMime,
        personB64,
        productMime,
        productB64,
        prompt,
        imageSize,
        temperature,
        perCallSeed
      );
      promises.push(
        callOnce(i, url, key, body)
          .then((r) => ({ ok: true, idx: i, ...r }))
          .catch((e) => ({ ok: false, idx: i, error: e }))
      );
    }

    const results = await Promise.all(promises);
    const totalElapsed = ((performance.now() - start) / 1000).toFixed(2);

    let succeeded = 0;
    const usages = [];
    for (const r of results) {
      if (r.ok) {
        fillCardImage(slots[r.idx], r.inline.data, r.inline.mimeType, r.idx);
        usages.push(r.usage);
        succeeded += 1;
      } else {
        fillCardError(slots[r.idx], r.error.message);
      }
    }

    printAggregateUsage(usages);

    if (succeeded === 0) {
      throw new Error("모든 샘플 생성 실패");
    }
    if (succeeded < sampleCount) {
      logWarn(`일부 실패: ${succeeded}/${sampleCount} 성공`);
      setStatus(
        `완료 (${totalElapsed}s, ${succeeded}/${sampleCount}장)`,
        "warn"
      );
    } else {
      logOk(`완료: ${succeeded}장 생성 (${totalElapsed}s)`);
      setStatus(`완료 (${totalElapsed}s, ${succeeded}장)`, "ok");
    }
  } catch (err) {
    logError("오류: " + err.message);
    setStatus(err.message, "error");
  } finally {
    els.submitBtn.disabled = false;
  }
}

function initApiKeyPersistence() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      els.apiKey.value = saved;
      els.rememberKey.checked = true;
    }
  } catch (_) {}

  const persist = () => {
    try {
      if (els.rememberKey.checked && els.apiKey.value) {
        localStorage.setItem(STORAGE_KEY, els.apiKey.value);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  };
  els.apiKey.addEventListener("change", persist);
  els.rememberKey.addEventListener("change", persist);
}

function init() {
  initApiKeyPersistence();
  els.form.addEventListener("submit", handleSubmit);
  els.personFile.addEventListener("change", handlePersonChange);
  els.productFile.addEventListener("change", handleProductChange);
  els.listModelsBtn.addEventListener("click", listModels);
  els.clearLogBtn.addEventListener("click", () => {
    els.log.innerHTML = "";
    logCount = 0;
    els.logCount.textContent = "";
  });
  logInfo("준비 완료. API Key 입력 후 인물/의상 이미지를 선택하세요.");
  logInfo(
    "Nano Banana(gemini-2.5-flash-image)는 호출당 이미지 1장을 반환하므로, " +
      "Sample count만큼 병렬 호출합니다."
  );
}

init();
