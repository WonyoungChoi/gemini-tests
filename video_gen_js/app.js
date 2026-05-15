"use strict";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const STORAGE_KEY = "gemini-video-gen:apiKey";

const $ = (id) => document.getElementById(id);

const els = {
  apiKey: $("apiKey"),
  rememberKey: $("rememberKey"),
  model: $("model"),
  listModelsBtn: $("listModelsBtn"),
  aspectRatio: $("aspectRatio"),
  resolution: $("resolution"),
  duration: $("duration"),
  sampleCount: $("sampleCount"),
  personGeneration: $("personGeneration"),
  negativePrompt: $("negativePrompt"),
  seed: $("seed"),
  pollInterval: $("pollInterval"),
  pollTimeout: $("pollTimeout"),
  verbose: $("verbose"),
  clearLogBtn: $("clearLogBtn"),
  form: $("genForm"),
  prompt: $("prompt"),
  imageFile: $("imageFile"),
  inputPreviewCard: $("inputPreviewCard"),
  inputWrap: $("inputWrap"),
  inputInfo: $("inputInfo"),
  submitBtn: $("submitBtn"),
  cancelBtn: $("cancelBtn"),
  status: $("status"),
  videosGrid: $("videosGrid"),
  log: $("log"),
  logCount: $("logCount"),
};

let logCount = 0;
let cancelRequested = false;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  const k = (els.apiKey.value || "").trim();
  if (!k) throw new Error("API Key가 비어 있습니다.");
  return k;
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

async function handleFileChange() {
  const file = els.imageFile.files && els.imageFile.files[0];
  if (!file) {
    els.inputPreviewCard.hidden = true;
    els.inputWrap.innerHTML = "";
    els.inputInfo.textContent = "";
    return;
  }
  const url = URL.createObjectURL(file);
  els.inputWrap.innerHTML = "";
  const img = new Image();
  img.src = url;
  img.onload = () => {
    els.inputInfo.textContent =
      `${file.name} · ${file.type || "?"} · ${formatBytes(file.size)} · ` +
      `${img.naturalWidth}×${img.naturalHeight}`;
  };
  els.inputWrap.appendChild(img);
  els.inputPreviewCard.hidden = false;
  logVerbose(
    `Selected input image: ${file.name} (${file.size} bytes, mime=${
      file.type || "?"
    })`
  );
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
        const hasLro =
          methods.includes("predictLongRunning") ||
          methods.includes("predict");
        const name = (m.name || "").replace(/^models\//, "").toLowerCase();
        return hasLro && (name.includes("veo") || name.includes("video"));
      })
      .map((m) => ({
        name: (m.name || "").replace(/^models\//, ""),
        display: m.displayName || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!models.length) {
      logWarn("video / veo 모델을 찾을 수 없습니다.");
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
    logOk("Loaded " + models.length + " video-capable models.");
    for (const m of models) {
      logInfo("  " + m.name + (m.display ? "  " + m.display : ""));
    }
    setStatus("모델 " + models.length + "개 로드됨", "ok");
  } catch (err) {
    logError("모델 목록 조회 실패: " + err.message);
    setStatus("모델 조회 실패", "error");
  }
}

function buildInstance(prompt, imagePart) {
  const inst = { prompt };
  if (imagePart) inst.image = imagePart;
  return inst;
}

function buildParameters() {
  const p = {};
  const ar = els.aspectRatio.value;
  if (ar) p.aspectRatio = ar;
  const res = els.resolution.value;
  if (res) p.resolution = res;
  const dur = parseInt(els.duration.value, 10);
  if (!Number.isNaN(dur) && dur > 0) p.durationSeconds = dur;
  const sc = parseInt(els.sampleCount.value, 10);
  if (!Number.isNaN(sc) && sc > 0) p.sampleCount = sc;
  const pg = els.personGeneration.value;
  if (pg) p.personGeneration = pg;
  const neg = els.negativePrompt.value.trim();
  if (neg) p.negativePrompt = neg;
  const seedVal = els.seed.value.trim();
  if (seedVal) {
    const s = parseInt(seedVal, 10);
    if (!Number.isNaN(s)) p.seed = s;
  }
  return p;
}

function findUsageMetadata(obj, depth) {
  if (!obj || typeof obj !== "object" || depth > 4) return null;
  if (obj.usageMetadata && typeof obj.usageMetadata === "object") {
    return obj.usageMetadata;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = findUsageMetadata(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function printTokenUsage(result) {
  const usage = findUsageMetadata(result, 0);
  if (!usage) {
    logVerbose("Token usage: (응답에 usageMetadata 없음)");
    return;
  }
  const promptTokens = usage.promptTokenCount || 0;
  const cachedTokens = usage.cachedContentTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const totalTokens = usage.totalTokenCount || 0;
  const nonCached = Math.max(promptTokens - cachedTokens, 0);

  logInfo("Token usage:");
  logInfo("  Cached Input Token:     " + cachedTokens);
  logInfo("  Non-cached Input Token: " + nonCached);
  logInfo("  Output Token:           " + outputTokens);
  if (totalTokens) logInfo("  Total Token:            " + totalTokens);

  const details = usage.promptTokensDetails || usage.modalityTokenCounts;
  if (Array.isArray(details) && details.length) {
    logVerbose("Token modalities: " + JSON.stringify(details));
  }
}

function extractVideos(operationResponse) {
  const out = [];
  if (!operationResponse) return out;

  const buckets = [
    operationResponse.generatedVideos,
    operationResponse.generatedSamples,
    operationResponse.videos,
    operationResponse.samples,
  ];
  for (const arr of buckets) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const v =
          (item && (item.video || item)) || null;
        if (!v) continue;
        const uri = v.uri || v.videoUri || v.url || null;
        const b64 =
          v.bytesBase64Encoded || v.videoBytes || v.data || null;
        const mime = v.mimeType || v.mime_type || "video/mp4";
        if (uri || b64) out.push({ uri, b64, mime });
      }
    }
  }

  const preds = operationResponse.predictions;
  if (Array.isArray(preds)) {
    for (const p of preds) {
      if (!p) continue;
      const uri = p.uri || p.videoUri || null;
      const b64 = p.bytesBase64Encoded || p.videoBytes || null;
      const mime = p.mimeType || "video/mp4";
      if (uri || b64) out.push({ uri, b64, mime });
    }
  }

  return out;
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function downloadVideoBlob(uri, apiKey) {
  const sep = uri.includes("?") ? "&" : "?";
  const tries = [
    () => fetch(uri, { headers: { "x-goog-api-key": apiKey } }),
    () => fetch(uri + sep + "key=" + encodeURIComponent(apiKey)),
    () => fetch(uri),
  ];
  let lastErr = null;
  for (const t of tries) {
    try {
      const res = await t();
      if (res.ok) return await res.blob();
      lastErr = new Error("HTTP " + res.status);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("download failed");
}

function renderVideos(videos, apiKey) {
  els.videosGrid.innerHTML = "";
  if (!videos.length) {
    els.videosGrid.innerHTML =
      '<p class="placeholder">결과에 비디오가 없습니다.</p>';
    return;
  }

  videos.forEach((v, idx) => {
    const card = document.createElement("figure");
    card.className = "video-card";

    const cap = document.createElement("figcaption");
    const title = document.createElement("strong");
    title.textContent = "Sample " + (idx + 1);
    const meta = document.createElement("span");
    meta.className = "meta";
    cap.appendChild(title);
    cap.appendChild(meta);
    card.appendChild(cap);

    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    card.appendChild(video);

    const row = document.createElement("div");
    row.className = "row";
    card.appendChild(row);

    els.videosGrid.appendChild(card);

    const onBlob = (blob, srcLabel) => {
      const url = URL.createObjectURL(blob);
      video.src = url;
      video.addEventListener(
        "loadedmetadata",
        () => {
          meta.textContent =
            `${v.mime} · ${formatBytes(blob.size)} · ` +
            `${video.videoWidth}×${video.videoHeight} · ` +
            `${video.duration.toFixed(2)}s · ${srcLabel}`;
          logVerbose(
            `Sample ${idx + 1} metadata: ${video.videoWidth}x${
              video.videoHeight
            }, ${video.duration.toFixed(2)}s, ${formatBytes(blob.size)}`
          );
        },
        { once: true }
      );

      const dl = document.createElement("a");
      dl.className = "secondary";
      dl.href = url;
      const ext = v.mime.includes("webm") ? "webm" : "mp4";
      dl.download = `gemini_video_${idx + 1}.${ext}`;
      dl.textContent = "다운로드";
      row.appendChild(dl);
    };

    if (v.b64) {
      const blob = base64ToBlob(v.b64, v.mime);
      logVerbose(
        `Sample ${idx + 1}: inline base64 (${formatBytes(blob.size)})`
      );
      onBlob(blob, "inline");
    } else if (v.uri) {
      meta.textContent = "URI 다운로드 중...";
      logVerbose(`Sample ${idx + 1}: downloading ${v.uri}`);
      downloadVideoBlob(v.uri, apiKey)
        .then((blob) => onBlob(blob, "uri"))
        .catch((err) => {
          logError(
            `Sample ${idx + 1} 다운로드 실패: ${err.message}. 직접 링크로 대체합니다.`
          );
          meta.textContent = "직접 다운로드 필요";
          const open = document.createElement("a");
          open.className = "secondary";
          open.href = v.uri;
          open.target = "_blank";
          open.rel = "noopener";
          open.textContent = "URI 새 탭에서 열기";
          row.appendChild(open);

          const link = document.createElement("a");
          link.className = "secondary";
          link.href = v.uri;
          link.download = `gemini_video_${idx + 1}.mp4`;
          link.textContent = "다운로드 시도";
          row.appendChild(link);
        });
    }
  });
}

async function pollOperation(opName, apiKey) {
  const intervalMs = Math.max(2, parseInt(els.pollInterval.value, 10) || 5) * 1000;
  const timeoutMs =
    Math.max(30, parseInt(els.pollTimeout.value, 10) || 600) * 1000;
  const start = performance.now();
  const url = API_BASE + "/" + opName.replace(/^\/+/, "");

  let attempt = 0;
  while (true) {
    if (cancelRequested) throw new Error("사용자 중단");
    if (performance.now() - start > timeoutMs) {
      throw new Error(
        "폴링 타임아웃 (" + Math.round(timeoutMs / 1000) + "s 초과)"
      );
    }
    attempt += 1;
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);
    setStatus(`폴링 중... (${elapsed}s, 시도 ${attempt})`, "");
    logVerbose(`GET ${url} (attempt ${attempt}, elapsed ${elapsed}s)`);
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    const text = await res.text();
    if (!res.ok) {
      logError(`폴링 응답 오류 HTTP ${res.status}: ${text}`);
      throw new Error("HTTP " + res.status);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("응답 파싱 실패: " + e.message);
    }

    if (data.error) {
      logError("Operation error: " + JSON.stringify(data.error));
      throw new Error(data.error.message || "operation error");
    }

    if (data.metadata) {
      const meta = data.metadata;
      const progress =
        meta.progressPercent ?? meta.progressPercentage ?? meta.progress;
      const state = meta.state || meta.status;
      if (progress != null || state) {
        logVerbose(
          `progress: ${progress != null ? progress + "%" : "?"}` +
            (state ? `, state: ${state}` : "")
        );
      }
    }

    if (data.done) {
      logOk(`Operation done in ${elapsed}s`);
      return data;
    }
    await sleep(intervalMs);
  }
}

async function handleSubmit(evt) {
  evt.preventDefault();
  cancelRequested = false;
  els.submitBtn.disabled = true;
  els.cancelBtn.hidden = false;
  setStatus("준비 중...", "");

  try {
    const key = getApiKey();
    const prompt = els.prompt.value.trim();
    if (!prompt) throw new Error("프롬프트를 입력하세요.");

    const model = els.model.value.trim() || "veo-3.0-generate-001";
    let imagePart = null;
    const file = els.imageFile.files && els.imageFile.files[0];
    if (file) {
      logVerbose("Encoding input image to base64...");
      const b64 = await fileToBase64(file);
      imagePart = {
        bytesBase64Encoded: b64,
        mimeType: file.type || "image/png",
      };
      logVerbose(
        `Image attached: ${file.type || "image/png"}, base64 ${b64.length} chars`
      );
    }

    const instance = buildInstance(prompt, imagePart);
    const parameters = buildParameters();

    const body = { instances: [instance], parameters };
    const url =
      API_BASE + "/models/" + encodeURIComponent(model) + ":predictLongRunning";

    logVerbose("POST " + url);
    logVerbose("parameters: " + JSON.stringify(parameters));

    const start = performance.now();
    setStatus("작업 제출 중...", "");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    logVerbose(
      `Submit response in ${((performance.now() - start) / 1000).toFixed(
        2
      )}s (HTTP ${res.status}, ${text.length} bytes)`
    );
    if (!res.ok) {
      logError("제출 응답 오류:\n" + text);
      throw new Error("HTTP " + res.status);
    }

    const opStart = JSON.parse(text);
    const opName = opStart.name;
    if (!opName) {
      logError("operation name 없음: " + text);
      throw new Error("operation name missing");
    }
    logInfo("Operation submitted: " + opName);
    setStatus("폴링 시작...", "");

    const result = await pollOperation(opName, key);

    const inner =
      (result.response && result.response.generateVideoResponse) ||
      result.response ||
      {};
    if (result.response) {
      logVerbose("response keys: " + Object.keys(result.response).join(", "));
    }

    const safety =
      inner.raiMediaFilteredCount ?? inner.filteredMediaCount ?? null;
    const reasons = inner.raiMediaFilteredReasons || inner.filterReasons;
    if (safety || (Array.isArray(reasons) && reasons.length)) {
      logWarn(
        `Safety filter: filtered=${safety}, reasons=${JSON.stringify(reasons)}`
      );
    }

    const videos = extractVideos(inner);
    if (!videos.length) {
      logError(
        "비디오가 반환되지 않았습니다. 응답:\n" + JSON.stringify(result, null, 2)
      );
      throw new Error("결과에 비디오 없음");
    }
    logOk(`Received ${videos.length} video(s).`);
    renderVideos(videos, key);

    printTokenUsage(result);

    const totalElapsed = ((performance.now() - start) / 1000).toFixed(1);
    setStatus(`완료 (${totalElapsed}s)`, "ok");
  } catch (err) {
    logError("오류: " + err.message);
    setStatus(err.message, "error");
  } finally {
    els.submitBtn.disabled = false;
    els.cancelBtn.hidden = true;
    cancelRequested = false;
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
  els.cancelBtn.addEventListener("click", () => {
    cancelRequested = true;
    logWarn("중단 요청됨 (다음 폴링 사이클에 종료)");
  });
  els.clearLogBtn.addEventListener("click", () => {
    els.log.innerHTML = "";
    logCount = 0;
    els.logCount.textContent = "";
  });
  logInfo("준비 완료. API Key를 입력하고 프롬프트를 입력하세요.");
  logInfo(
    "참고: Veo는 유료 티어 전용이며, GCS URI 응답은 CORS로 직접 다운로드가 막힐 수 있습니다."
  );
}

init();
