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
  baseSteps: $("baseSteps"),
  personGeneration: $("personGeneration"),
  safetySetting: $("safetySetting"),
  outputMimeType: $("outputMimeType"),
  seed: $("seed"),
  addWatermark: $("addWatermark"),
  verbose: $("verbose"),
  clearLogBtn: $("clearLogBtn"),
  form: $("tryOnForm"),
  personFile: $("personFile"),
  productFile: $("productFile"),
  personInfo: $("personInfo"),
  personWrap: $("personWrap"),
  productInfo: $("productInfo"),
  productWrap: $("productWrap"),
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
        const hasPredict = methods.includes("predict");
        const name = (m.name || "").replace(/^models\//, "").toLowerCase();
        return (
          hasPredict &&
          (name.includes("try-on") ||
            name.includes("tryon") ||
            name.includes("virtual"))
        );
      })
      .map((m) => ({
        name: (m.name || "").replace(/^models\//, ""),
        display: m.displayName || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!models.length) {
      logWarn("virtual try-on 모델을 찾을 수 없습니다. (preview 모델은 access 필요할 수 있음)");
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
    logOk("Loaded " + models.length + " try-on model(s).");
    for (const m of models) {
      logInfo("  " + m.name + (m.display ? "  " + m.display : ""));
    }
    setStatus("모델 " + models.length + "개 로드됨", "ok");
  } catch (err) {
    logError("모델 목록 조회 실패: " + err.message);
    setStatus("모델 조회 실패", "error");
  }
}

function buildParameters() {
  const p = {};
  const sc = parseInt(els.sampleCount.value, 10);
  if (!Number.isNaN(sc) && sc > 0) p.sampleCount = sc;

  const bs = parseInt(els.baseSteps.value, 10);
  if (!Number.isNaN(bs) && bs > 0) p.baseSteps = bs;

  const pg = els.personGeneration.value;
  if (pg) p.personGeneration = pg;

  const ss = els.safetySetting.value;
  if (ss) p.safetySetting = ss;

  const om = els.outputMimeType.value;
  if (om) p.outputMimeType = om;

  const seedVal = els.seed.value.trim();
  if (seedVal) {
    const s = parseInt(seedVal, 10);
    if (!Number.isNaN(s)) p.seed = s;
  }

  p.addWatermark = !!els.addWatermark.checked;
  return p;
}

function buildRequestBody(personB64, personMime, productB64, productMime, params) {
  return {
    instances: [
      {
        personImage: {
          image: { bytesBase64Encoded: personB64, mimeType: personMime },
        },
        productImages: [
          {
            image: { bytesBase64Encoded: productB64, mimeType: productMime },
          },
        ],
      },
    ],
    parameters: params,
  };
}

function extractPredictionImages(data) {
  const out = [];
  const preds = data.predictions || data.generatedImages || [];
  if (!Array.isArray(preds)) return out;
  for (const p of preds) {
    if (!p) continue;
    const inner = p.image || p;
    const b64 =
      inner.bytesBase64Encoded ||
      inner.imageBytes ||
      inner.data ||
      p.bytesBase64Encoded ||
      p.imageBytes ||
      null;
    const mime =
      inner.mimeType || inner.mime_type || p.mimeType || "image/png";
    const reason = p.raiFilteredReason || p.filteredReason || null;
    if (b64) {
      out.push({ b64, mime });
    } else if (reason) {
      logWarn("Sample filtered: " + reason);
    }
  }
  return out;
}

function renderResults(images) {
  els.resultsGrid.innerHTML = "";
  if (!images.length) {
    els.resultsGrid.innerHTML =
      '<p class="placeholder">결과 이미지가 없습니다.</p>';
    return;
  }

  images.forEach((img, idx) => {
    const blob = base64ToBlob(img.b64, img.mime);
    const url = URL.createObjectURL(blob);

    const card = document.createElement("figure");
    card.className = "image-card";

    const cap = document.createElement("figcaption");
    const title = document.createElement("strong");
    title.textContent = "Sample " + (idx + 1);
    const meta = document.createElement("span");
    meta.className = "meta";
    cap.appendChild(title);
    cap.appendChild(meta);
    card.appendChild(cap);

    const wrap = document.createElement("div");
    wrap.className = "image-wrap";
    const im = new Image();
    im.src = url;
    im.onload = () => {
      meta.textContent =
        `${img.mime} · ${formatBytes(blob.size)} · ` +
        `${im.naturalWidth}×${im.naturalHeight}`;
      logVerbose(
        `Sample ${idx + 1}: ${im.naturalWidth}x${im.naturalHeight}, ` +
          `${formatBytes(blob.size)}, mime=${img.mime}`
      );
    };
    wrap.appendChild(im);
    card.appendChild(wrap);

    const row = document.createElement("div");
    row.className = "download-row";
    const dl = document.createElement("a");
    dl.className = "secondary";
    dl.href = url;
    const ext = img.mime.includes("jpeg")
      ? "jpg"
      : img.mime.split("/")[1] || "png";
    dl.download = `try_on_${idx + 1}.${ext}`;
    dl.textContent = "다운로드";
    row.appendChild(dl);
    card.appendChild(row);

    els.resultsGrid.appendChild(card);
  });
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

    const model = els.model.value.trim() || "virtual-try-on-preview-08-26";
    const personMime = personFile.type || "image/png";
    const productMime = productFile.type || "image/png";

    logVerbose("Model:  " + model);
    logVerbose(
      `Person:  ${personFile.name} (${personFile.size} bytes, ${personMime})`
    );
    logVerbose(
      `Product: ${productFile.name} (${productFile.size} bytes, ${productMime})`
    );

    logVerbose("Encoding images to base64...");
    const [personB64, productB64] = await Promise.all([
      fileToBase64(personFile),
      fileToBase64(productFile),
    ]);
    logVerbose(
      `Base64 lengths: person=${personB64.length}, product=${productB64.length}`
    );

    const parameters = buildParameters();
    logVerbose("parameters: " + JSON.stringify(parameters));

    const body = buildRequestBody(
      personB64,
      personMime,
      productB64,
      productMime,
      parameters
    );

    const url =
      API_BASE + "/models/" + encodeURIComponent(model) + ":predict";
    logVerbose("POST " + url);

    const start = performance.now();
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
      `Response in ${elapsed}s (HTTP ${res.status}, ${text.length} bytes)`
    );

    if (!res.ok) {
      logError("API 응답 오류:\n" + text);
      throw new Error("HTTP " + res.status);
    }

    const data = JSON.parse(text);

    const safety =
      data.raiMediaFilteredCount ?? data.filteredMediaCount ?? null;
    const reasons = data.raiMediaFilteredReasons || data.filterReasons;
    if (safety || (Array.isArray(reasons) && reasons.length)) {
      logWarn(
        `Safety filter: filtered=${safety}, reasons=${JSON.stringify(reasons)}`
      );
    }

    const images = extractPredictionImages(data);
    if (!images.length) {
      logError("응답에 이미지가 없습니다:\n" + text);
      throw new Error("이미지가 반환되지 않음");
    }
    logOk(`Received ${images.length} image(s).`);
    renderResults(images);

    setStatus(`완료 (${elapsed}s, ${images.length}장)`, "ok");
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
    "참고: Virtual Try-On은 preview 모델이며, 일부 계정/리전에서만 사용 가능할 수 있습니다."
  );
}

init();
