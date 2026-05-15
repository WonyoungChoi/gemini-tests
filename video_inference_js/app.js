"use strict";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const STORAGE_KEY = "gemini-video-inference:apiKey";

const $ = (id) => document.getElementById(id);

const els = {
  apiKey: $("apiKey"),
  rememberKey: $("rememberKey"),
  model: $("model"),
  listModelsBtn: $("listModelsBtn"),
  uploadMode: $("uploadMode"),
  temperature: $("temperature"),
  topP: $("topP"),
  topK: $("topK"),
  maxOutputTokens: $("maxOutputTokens"),
  thinkingBudget: $("thinkingBudget"),
  mediaResolution: $("mediaResolution"),
  fps: $("fps"),
  verbose: $("verbose"),
  clearLogBtn: $("clearLogBtn"),
  form: $("inferForm"),
  videoFile: $("videoFile"),
  inputPreviewCard: $("inputPreviewCard"),
  inputWrap: $("inputWrap"),
  inputInfo: $("inputInfo"),
  prompt: $("prompt"),
  submitBtn: $("submitBtn"),
  status: $("status"),
  resultWrap: $("resultWrap"),
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const file = els.videoFile.files && els.videoFile.files[0];
  if (!file) {
    els.inputPreviewCard.hidden = true;
    els.inputWrap.innerHTML = "";
    els.inputInfo.textContent = "";
    return;
  }
  const url = URL.createObjectURL(file);
  els.inputWrap.innerHTML = "";
  const video = document.createElement("video");
  video.src = url;
  video.controls = true;
  video.preload = "metadata";
  video.addEventListener(
    "loadedmetadata",
    () => {
      els.inputInfo.textContent =
        `${file.name} · ${file.type || "?"} · ${formatBytes(file.size)} · ` +
        `${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(
          2
        )}s`;
      logVerbose(
        `Selected video: ${file.name} (${file.size} bytes, mime=${
          file.type || "?"
        }, ${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(
          2
        )}s)`
      );
    },
    { once: true }
  );
  els.inputWrap.appendChild(video);
  els.inputPreviewCard.hidden = false;

  if (file.size > 20 * 1024 * 1024 && els.uploadMode.value === "inline") {
    logWarn(
      `파일이 20MB(${formatBytes(file.size)})를 넘습니다. Files API 모드로 전환을 권장합니다.`
    );
  }
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
        const name = (m.name || "").replace(/^models\//, "").toLowerCase();
        if (name.includes("image") || name.includes("embed")) return false;
        if (name.includes("veo") || name.includes("tts")) return false;
        return (
          name.includes("gemini-2") ||
          name.includes("gemini-3") ||
          name.includes("gemini-flash") ||
          name.includes("gemini-pro")
        );
      })
      .map((m) => ({
        name: (m.name || "").replace(/^models\//, ""),
        display: m.displayName || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!models.length) {
      logWarn("video 입력을 지원할 만한 모델을 찾지 못했습니다.");
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
    logOk("Loaded " + models.length + " candidate models.");
    for (const m of models) {
      logInfo("  " + m.name + (m.display ? "  " + m.display : ""));
    }
    setStatus("모델 " + models.length + "개 로드됨", "ok");
  } catch (err) {
    logError("모델 목록 조회 실패: " + err.message);
    setStatus("모델 조회 실패", "error");
  }
}

function buildGenerationConfig() {
  const cfg = {};
  const t = parseFloat(els.temperature.value);
  if (!Number.isNaN(t)) cfg.temperature = t;
  const tp = parseFloat(els.topP.value);
  if (!Number.isNaN(tp)) cfg.topP = tp;
  const tk = parseInt(els.topK.value, 10);
  if (!Number.isNaN(tk)) cfg.topK = tk;
  const mx = parseInt(els.maxOutputTokens.value, 10);
  if (!Number.isNaN(mx) && mx > 0) cfg.maxOutputTokens = mx;
  const mr = els.mediaResolution.value;
  if (mr) cfg.mediaResolution = mr;
  const tb = els.thinkingBudget.value.trim();
  if (tb !== "") {
    const v = parseInt(tb, 10);
    if (!Number.isNaN(v)) cfg.thinkingConfig = { thinkingBudget: v };
  }
  return cfg;
}

function buildVideoMetadata() {
  const fps = parseFloat(els.fps.value);
  if (!Number.isNaN(fps) && fps > 0) {
    return { fps };
  }
  return null;
}

async function uploadViaFilesApi(file, apiKey) {
  const startUrl =
    API_BASE.replace("/v1beta", "") + "/upload/v1beta/files";
  logVerbose("POST " + startUrl + " (resumable start)");
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type || "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { display_name: file.name || "upload.mp4" },
    }),
  });
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new Error("upload start HTTP " + startRes.status + ": " + t);
  }
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("X-Goog-Upload-URL 응답 헤더 없음");
  logVerbose("Resumable upload URL acquired");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error("upload HTTP " + uploadRes.status + ": " + t);
  }
  const meta = await uploadRes.json();
  const fileObj = meta.file || meta;
  const fileName = fileObj.name;
  if (!fileName) throw new Error("file name missing in upload response");
  logVerbose("Uploaded: " + fileName + " state=" + (fileObj.state || "?"));

  let cur = fileObj;
  const deadline = Date.now() + 120000;
  while (cur.state && cur.state !== "ACTIVE") {
    if (cur.state === "FAILED")
      throw new Error("File state FAILED: " + JSON.stringify(cur.error || {}));
    if (Date.now() > deadline)
      throw new Error("Files API ACTIVE 대기 타임아웃");
    await sleep(2000);
    const polUrl =
      API_BASE + "/" + fileName.replace(/^\/+/, "");
    logVerbose("GET " + polUrl);
    const pr = await fetch(polUrl, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!pr.ok) {
      const t = await pr.text();
      throw new Error("poll HTTP " + pr.status + ": " + t);
    }
    cur = await pr.json();
    logVerbose("File state: " + (cur.state || "?"));
  }
  return {
    uri: cur.uri || fileObj.uri,
    mimeType: cur.mimeType || fileObj.mimeType || file.type || "video/mp4",
  };
}

function printTokenUsage(usage) {
  if (!usage) {
    logVerbose("Token usage: 응답에 usageMetadata 없음.");
    return;
  }
  const promptTokens = usage.promptTokenCount || 0;
  const cachedTokens = usage.cachedContentTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const thoughtTokens = usage.thoughtsTokenCount || 0;
  const totalTokens = usage.totalTokenCount || 0;
  const nonCached = Math.max(promptTokens - cachedTokens, 0);

  logInfo("Token usage:");
  logInfo("  Cached Input Token:     " + cachedTokens);
  logInfo("  Non-cached Input Token: " + nonCached);
  logInfo("  Output Token:           " + outputTokens);
  if (thoughtTokens) logInfo("  Thinking Token:         " + thoughtTokens);
  if (totalTokens) logInfo("  Total Token:            " + totalTokens);

  const details = usage.promptTokensDetails;
  if (Array.isArray(details) && details.length) {
    logInfo("  Prompt modality breakdown:");
    for (const d of details) {
      const mod = d.modality || "?";
      const count = d.tokenCount != null ? d.tokenCount : "?";
      logInfo("    - " + mod + ": " + count);
    }
  }
  const outDetails = usage.candidatesTokensDetails;
  if (Array.isArray(outDetails) && outDetails.length) {
    logVerbose(
      "Output modality breakdown: " + JSON.stringify(outDetails)
    );
  }
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

async function handleSubmit(evt) {
  evt.preventDefault();
  els.submitBtn.disabled = true;
  setStatus("처리 중...", "");
  els.resultWrap.innerHTML = '<p class="placeholder">분석 중...</p>';

  try {
    const key = getApiKey();
    const file = els.videoFile.files && els.videoFile.files[0];
    if (!file) throw new Error("동영상 파일을 선택하세요.");
    const prompt = els.prompt.value.trim();
    if (!prompt) throw new Error("프롬프트를 입력하세요.");
    const model = els.model.value.trim() || "gemini-2.5-flash";
    const mimeType = file.type || "video/mp4";
    const uploadMode = els.uploadMode.value;

    logVerbose(
      `Input video: ${file.name} (${file.size} bytes, mime=${mimeType})`
    );
    logVerbose("Model: " + model);
    logVerbose("Upload mode: " + uploadMode);
    logVerbose("Prompt: " + JSON.stringify(prompt));

    let videoPart;
    if (uploadMode === "files") {
      setStatus("Files API 업로드 중...", "");
      logInfo("Files API로 업로드 시작...");
      const uploaded = await uploadViaFilesApi(file, key);
      logOk("업로드 완료: " + uploaded.uri);
      videoPart = {
        file_data: { mime_type: uploaded.mimeType, file_uri: uploaded.uri },
      };
    } else {
      if (file.size > 20 * 1024 * 1024) {
        logWarn(
          "20MB 초과 파일을 inline으로 전송합니다. 실패 시 Files API 모드를 사용하세요."
        );
      }
      setStatus("Base64 인코딩 중...", "");
      logVerbose("Encoding video to base64...");
      const base64 = await fileToBase64(file);
      logVerbose("Base64 length: " + base64.length + " chars");
      videoPart = { inline_data: { mime_type: mimeType, data: base64 } };
    }

    const videoMeta = buildVideoMetadata();
    if (videoMeta) {
      videoPart.video_metadata = videoMeta;
      logVerbose("video_metadata: " + JSON.stringify(videoMeta));
    }

    const generationConfig = buildGenerationConfig();
    logVerbose("generationConfig: " + JSON.stringify(generationConfig));

    const body = {
      contents: [
        {
          role: "user",
          parts: [videoPart, { text: prompt }],
        },
      ],
      generationConfig,
    };

    const url =
      API_BASE + "/models/" + encodeURIComponent(model) + ":generateContent";
    logVerbose("POST " + url);
    setStatus("모델 호출 중...", "");

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
    const finishReason =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].finishReason) ||
      null;
    if (finishReason && finishReason !== "STOP") {
      logWarn("finishReason: " + finishReason);
    }

    const textOut = collectTextParts(data);
    if (!textOut) {
      logError("응답에 텍스트가 없습니다:\n" + text);
      throw new Error("텍스트 응답이 비어 있음");
    }

    els.resultWrap.textContent = textOut;
    logOk("분석 완료 (" + elapsed + "s)");
    printTokenUsage(data.usageMetadata);
    setStatus("완료 (" + elapsed + "s)", "ok");
  } catch (err) {
    logError("오류: " + err.message);
    setStatus(err.message, "error");
    if (els.resultWrap.textContent === "" || els.resultWrap.children.length) {
      els.resultWrap.innerHTML =
        '<p class="placeholder">오류로 결과 없음.</p>';
    }
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
  els.videoFile.addEventListener("change", handleFileChange);
  els.listModelsBtn.addEventListener("click", listModels);
  els.clearLogBtn.addEventListener("click", () => {
    els.log.innerHTML = "";
    logCount = 0;
    els.logCount.textContent = "";
  });
  logInfo("준비 완료. API Key를 입력하고 동영상 파일을 선택하세요.");
  logInfo(
    "참고: inline 모드는 ≤ 20MB. 큰 파일은 Files API 모드를 사용하세요."
  );
}

init();
