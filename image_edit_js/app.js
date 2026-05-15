"use strict";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const STORAGE_KEY = "gemini-image-edit:apiKey";

const $ = (id) => document.getElementById(id);

const els = {
  apiKey: $("apiKey"),
  rememberKey: $("rememberKey"),
  model: $("model"),
  listModelsBtn: $("listModelsBtn"),
  imageSize: $("imageSize"),
  verbose: $("verbose"),
  clearLogBtn: $("clearLogBtn"),
  form: $("editForm"),
  imageFile: $("imageFile"),
  prompt: $("prompt"),
  submitBtn: $("submitBtn"),
  status: $("status"),
  originalInfo: $("originalInfo"),
  originalWrap: $("originalWrap"),
  editedInfo: $("editedInfo"),
  editedWrap: $("editedWrap"),
  downloadLink: $("downloadLink"),
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
      const result = reader.result || "";
      const comma = String(result).indexOf(",");
      resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
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
  if (!k) {
    throw new Error("API Key가 비어 있습니다.");
  }
  return k;
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
  logVerbose("Fetching model list from " + API_BASE + "...");
  try {
    const res = await fetch(API_BASE, {
      headers: { "x-goog-api-key": key },
    });
    const text = await res.text();
    logVerbose(
      "Received " + text.length + " bytes (HTTP " + res.status + ")"
    );
    if (!res.ok) {
      throw new Error("HTTP " + res.status + ": " + text);
    }
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
      logInfo("No image-capable models found.");
      setStatus("이미지 모델 없음", "error");
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

async function handleFileChange() {
  const file = els.imageFile.files && els.imageFile.files[0];
  if (!file) {
    els.originalInfo.textContent = "";
    els.originalWrap.innerHTML =
      '<p class="placeholder">파일을 선택하면 여기에 표시됩니다.</p>';
    return;
  }
  const url = URL.createObjectURL(file);
  showImage(els.originalWrap, url);
  const dims = await loadImageDims(url);
  els.originalInfo.textContent =
    `${file.name} · ${file.type || "?"} · ${formatBytes(file.size)} · ` +
    `${dims.w}×${dims.h}`;
  logVerbose(
    `Selected image: ${file.name} (${file.size} bytes, mime=${
      file.type || "?"
    }, ${dims.w}x${dims.h})`
  );
}

function buildRequestBody(mimeType, base64Data, prompt, imageSize) {
  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
  };
  if (imageSize) {
    body.generationConfig = { imageConfig: { imageSize: imageSize } };
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

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function printTokenUsage(usage) {
  if (!usage) return;
  const promptTokens = usage.promptTokenCount || 0;
  const cachedTokens = usage.cachedContentTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const nonCached = Math.max(promptTokens - cachedTokens, 0);
  logInfo("Token usage:");
  logInfo("  Cached Input Token:     " + cachedTokens);
  logInfo("  Non-cached Input Token: " + nonCached);
  logInfo("  Output Token:           " + outputTokens);
}

async function handleSubmit(evt) {
  evt.preventDefault();
  els.submitBtn.disabled = true;
  setStatus("처리 중...", "");

  try {
    const key = getApiKey();
    const file = els.imageFile.files && els.imageFile.files[0];
    if (!file) throw new Error("이미지 파일을 선택하세요.");
    const prompt = els.prompt.value.trim();
    if (!prompt) throw new Error("프롬프트를 입력하세요.");
    const model = els.model.value.trim() || "gemini-2.5-flash-image";
    const imageSize = els.imageSize.value || "";

    const mimeType = file.type || "image/png";
    logVerbose(
      `Input image: ${file.name} (${file.size} bytes, mime=${mimeType})`
    );
    logVerbose("Prompt: " + JSON.stringify(prompt));
    logVerbose("Model:  " + model);
    if (imageSize) logVerbose("Image size: " + imageSize);

    logVerbose("Encoding image to base64...");
    const base64 = await fileToBase64(file);
    logVerbose("Base64 length: " + base64.length + " chars");

    const body = buildRequestBody(mimeType, base64, prompt, imageSize);
    const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
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
      `Response received in ${elapsed}s (HTTP ${res.status}, ${text.length} bytes)`
    );

    if (!res.ok) {
      logError("API 응답 오류:\n" + text);
      throw new Error("HTTP " + res.status);
    }

    const data = JSON.parse(text);
    const textParts = collectTextParts(data);
    if (textParts) logInfo(textParts);

    const inline = extractInlineImage(data);
    if (!inline) {
      logError("응답에 이미지가 없습니다:\n" + text);
      throw new Error("이미지가 반환되지 않음");
    }

    const blob = base64ToBlob(inline.data, inline.mimeType);
    const blobUrl = URL.createObjectURL(blob);
    showImage(els.editedWrap, blobUrl);
    const dims = await loadImageDims(blobUrl);
    els.editedInfo.textContent =
      `${inline.mimeType} · ${formatBytes(blob.size)} · ${dims.w}×${dims.h}`;
    logVerbose(
      `Decoded image: ${blob.size} bytes, ${dims.w}x${dims.h}, mime=${inline.mimeType}`
    );

    const ext = inline.mimeType.includes("jpeg")
      ? "jpg"
      : inline.mimeType.split("/")[1] || "png";
    els.downloadLink.href = blobUrl;
    els.downloadLink.download = "edited." + ext;
    els.downloadLink.hidden = false;

    printTokenUsage(data.usageMetadata);

    logOk("완료: 편집된 이미지를 받았습니다.");
    setStatus("완료 (" + elapsed + "s)", "ok");
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
  els.imageFile.addEventListener("change", handleFileChange);
  els.listModelsBtn.addEventListener("click", listModels);
  els.clearLogBtn.addEventListener("click", () => {
    els.log.innerHTML = "";
    logCount = 0;
    els.logCount.textContent = "";
  });
  logInfo("준비 완료. API Key를 입력하고 이미지를 선택하세요.");
}

init();
