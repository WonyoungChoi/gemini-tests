#!/usr/bin/env bash
# Edit an input image with a text prompt using Gemini's image model.
# Requires: curl, jq, base64, file
set -euo pipefail

DEFAULT_MODEL="gemini-2.5-flash-image"
API_BASE="https://generativelanguage.googleapis.com/v1beta/models"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") [options] <input_image> <prompt> [output_image]
  $(basename "$0") --list-models

Options:
  -m, --model MODEL   Model to use (default: ${DEFAULT_MODEL}).
  -o, --output PATH   Output image path (default: edited.png).
      --list-models   List image-capable models and exit.
  -h, --help          Show this help.

Environment:
  GEMINI_API_KEY (or GOOGLE_API_KEY)  Required API key.
EOF
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

  local response
  response="$(curl -sS -H "x-goog-api-key: ${API_KEY}" "${API_BASE}")"

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
if ! base64 -w0 "$INPUT" > "$B64_FILE" 2>/dev/null; then
  base64 "$INPUT" | tr -d '\n' > "$B64_FILE"
fi

jq -n \
  --arg mime "$MIME_TYPE" \
  --rawfile data "$B64_FILE" \
  --arg prompt "$PROMPT" \
  '{contents:[{parts:[{inline_data:{mime_type:$mime,data:($data|gsub("\\s";""))}},{text:$prompt}]}]}' \
  > "$REQUEST_FILE"

HTTP_CODE="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "${API_BASE}/${MODEL}:generateContent" \
  -H "x-goog-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary "@${REQUEST_FILE}")"

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
printf '%s' "$IMAGE_DATA" | base64 -d > "$OUTPUT"
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
