#!/usr/bin/env bash
# Edit an input image with a text prompt using Gemini's image model.
# Requires: curl, jq, base64, file
set -euo pipefail

DEFAULT_MODEL="gemini-2.5-flash-image"
API_BASE="https://generativelanguage.googleapis.com/v1beta/models"
VERBOSE=0
IMAGE_SIZE=""

usage() {
  cat <<EOF
Usage:
  $(basename "$0") [options] <input_image> <prompt> [output_image]
  $(basename "$0") --list-models

Options:
  -m, --model MODEL      Model to use (default: ${DEFAULT_MODEL}).
  -o, --output PATH      Output image path (default: edited.png).
  -s, --image-size SIZE  Output image size (1K|2K|4K, model must support it).
      --list-models      List image-capable models and exit.
  -v, --verbose          Print progress messages to stderr.
  -h, --help             Show this help.

Environment:
  GEMINI_API_KEY (or GOOGLE_API_KEY)  Required API key.
EOF
}

log() {
  (( VERBOSE )) || return 0
  printf '[verbose] %s\n' "$*" >&2
}

require_key() {
  if [[ -z "${API_KEY:-}" ]]; then
    echo "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set." >&2
    exit 1
  fi
}

list_models() {
  require_key
  command -v curl >/dev/null 2>&1 || { echo "Required command not found: curl" >&2; exit 1; }
  command -v jq   >/dev/null 2>&1 || { echo "Required command not found: jq"   >&2; exit 1; }

  log "Fetching model list from ${API_BASE}..."
  local response
  response="$(curl -sS -H "x-goog-api-key: ${API_KEY}" "${API_BASE}")"
  log "Received $(printf '%s' "$response" | wc -c) bytes"

  local rows
  rows="$(jq -r '
    .models[]?
    | select((.supportedGenerationMethods // []) | index("generateContent"))
    | (.name | sub("^models/"; "")) as $n
    | select($n | ascii_downcase | contains("image"))
    | "\($n)\t\(.displayName // "")"
  ' <<<"$response")"

  if [[ -z "$rows" ]]; then
    echo "No image-capable models found."
    return
  fi

  echo "Available image-capable models:"
  awk -F'\t' '{ printf "  %-45s %s\n", $1, $2 }' <<<"$rows"
}

MODEL="$DEFAULT_MODEL"
OUTPUT="edited.png"
LIST_MODELS=0
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --list-models) LIST_MODELS=1; shift ;;
    -m|--model) MODEL="$2"; shift 2 ;;
    -o|--output) OUTPUT="$2"; shift 2 ;;
    -s|--image-size)
      case "$2" in
        1K|2K|4K) IMAGE_SIZE="$2" ;;
        *) echo "Invalid --image-size: $2 (expected 1K, 2K, or 4K)" >&2; exit 1 ;;
      esac
      shift 2 ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --) shift; POSITIONAL+=("$@"); break ;;
    -*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"

if (( LIST_MODELS )); then
  list_models
  exit 0
fi

if (( ${#POSITIONAL[@]} < 2 || ${#POSITIONAL[@]} > 3 )); then
  usage >&2
  exit 1
fi

INPUT="${POSITIONAL[0]}"
PROMPT="${POSITIONAL[1]}"
[[ ${#POSITIONAL[@]} -eq 3 ]] && OUTPUT="${POSITIONAL[2]}"

require_key

if [[ ! -f "$INPUT" ]]; then
  echo "Input image not found: $INPUT" >&2
  exit 1
fi

for cmd in curl jq base64; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required command not found: $cmd" >&2; exit 1; }
done

RESPONSE_FILE="$(mktemp)"
B64_FILE="$(mktemp)"
REQUEST_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE" "$B64_FILE" "$REQUEST_FILE"' EXIT

MIME_TYPE="$(file --brief --mime-type "$INPUT" 2>/dev/null || echo image/png)"
INPUT_SIZE="$(wc -c < "$INPUT")"
log "Input image: ${INPUT} (${INPUT_SIZE} bytes, mime=${MIME_TYPE})"
log "Prompt: ${PROMPT}"
log "Model:  ${MODEL}"

log "Encoding image to base64..."
if ! base64 -w0 "$INPUT" > "$B64_FILE" 2>/dev/null; then
  base64 "$INPUT" | tr -d '\n' > "$B64_FILE"
fi
log "Base64 size: $(wc -c < "$B64_FILE") bytes"

log "Building request JSON..."
[[ -n "$IMAGE_SIZE" ]] && log "Image size: $IMAGE_SIZE"
jq -n \
  --arg mime "$MIME_TYPE" \
  --rawfile data "$B64_FILE" \
  --arg prompt "$PROMPT" \
  --arg image_size "$IMAGE_SIZE" \
  '{
    contents: [{parts: [
      {inline_data: {mime_type: $mime, data: ($data|gsub("\\s";""))}},
      {text: $prompt}
    ]}]
  }
  + (if $image_size == "" then {} else
      {generationConfig: {imageConfig: {imageSize: $image_size}}}
    end)' \
  > "$REQUEST_FILE"

log "POST ${API_BASE}/${MODEL}:generateContent"
START_TS="$(date +%s)"
HTTP_CODE="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "${API_BASE}/${MODEL}:generateContent" \
  -H "x-goog-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary "@${REQUEST_FILE}")"
log "Response received in $(( $(date +%s) - START_TS ))s (HTTP ${HTTP_CODE}, $(wc -c < "$RESPONSE_FILE") bytes)"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "API request failed (HTTP $HTTP_CODE):" >&2
  cat "$RESPONSE_FILE" >&2
  exit 1
fi

TEXT_PARTS="$(jq -r '[.candidates[]?.content.parts[]?.text // empty] | join("\n")' "$RESPONSE_FILE")"
[[ -n "$TEXT_PARTS" ]] && echo "$TEXT_PARTS" >&2

IMAGE_DATA="$(jq -r '
  [.candidates[]?.content.parts[]?.inlineData.data // .candidates[]?.content.parts[]?.inline_data.data // empty][0] // empty
' "$RESPONSE_FILE")"

if [[ -z "$IMAGE_DATA" ]]; then
  echo "No image returned from the model." >&2
  cat "$RESPONSE_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
log "Decoding image and writing to ${OUTPUT}..."
printf '%s' "$IMAGE_DATA" | base64 -d > "$OUTPUT"
log "Wrote $(wc -c < "$OUTPUT") bytes"
echo "Saved edited image to $OUTPUT"

PROMPT_TOKENS="$(jq -r '.usageMetadata.promptTokenCount // 0' "$RESPONSE_FILE")"
CACHED_TOKENS="$(jq -r '.usageMetadata.cachedContentTokenCount // 0' "$RESPONSE_FILE")"
OUTPUT_TOKENS="$(jq -r '.usageMetadata.candidatesTokenCount // 0' "$RESPONSE_FILE")"
NON_CACHED_TOKENS=$(( PROMPT_TOKENS - CACHED_TOKENS ))
(( NON_CACHED_TOKENS < 0 )) && NON_CACHED_TOKENS=0

echo "Token usage:"
printf "  Cached Input Token:     %s\n" "$CACHED_TOKENS"
printf "  Non-cached Input Token: %s\n" "$NON_CACHED_TOKENS"
printf "  Output Token:           %s\n" "$OUTPUT_TOKENS"
