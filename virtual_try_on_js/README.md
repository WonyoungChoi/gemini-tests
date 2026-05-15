# virtual_try_on_js

Gemini의 멀티 이미지 입력을 활용해 **Virtual Try-On**(인물 + 의상 → 착용 이미지)을 구현한
**정적 웹 페이지** 샘플입니다. Vertex AI 전용 `virtual-try-on-preview-*` 모델 대신,
Generative Language API에서 사용 가능한 **Nano Banana (`gemini-2.5-flash-image`)** 를 호출합니다.

별도 서버 없이 브라우저에서 바로 실행할 수 있습니다.

## 동작 방식

- Nano Banana는 멀티 이미지 + 텍스트 prompt 입력을 지원하고, 호출당 이미지 **1장**을 반환합니다.
- N장(1–4) 생성을 위해 **동일한 입력으로 N번 병렬 호출**합니다.
- 입력 2장(인물, 의상)과 try-on prompt를 `contents.parts`에 함께 실어 보냅니다.

요청 예시(개념적):

```json
{
  "contents": [{
    "parts": [
      { "text": "Image 1 (person):" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } },
      { "text": "Image 2 (clothing):" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } },
      { "text": "Generate a photorealistic image of the same person wearing the clothing..." }
    ]
  }],
  "generationConfig": {
    "imageConfig": { "imageSize": "2K" },
    "temperature": 0.9,
    "seed": 12345
  }
}
```

## 사용법

1. `virtual_try_on_js/index.html`을 더블 클릭해서 브라우저에서 엽니다 (Chrome, Edge 권장).
2. 좌측 사이드바의 **API Key**에 Gemini API Key를 입력합니다.
3. **모델**을 선택합니다 (기본: `gemini-2.5-flash-image`).
   - `사용 가능한 모델 불러오기`로 계정에서 호출 가능한 이미지 모델 목록을 갱신할 수 있습니다.
4. **생성 옵션**:
   - **Sample count** (1–4): 병렬 호출 수 = 생성 이미지 장수.
   - **Image size**: 1K / 2K / 4K (모델 지원 시).
   - **Temperature**: 비워두면 모델 기본값. 값이 클수록 샘플 간 다양성↑.
   - **Seed**: 지정 시 동일 결과가 나오므로, N장 다양성을 위해 비워두는 걸 권장합니다.
     (지정 시 각 호출마다 `seed+i`로 1씩 증가시켜 호출합니다.)
5. 가운데에서 **인물 이미지**, **의상 이미지**를 각각 업로드합니다.
6. Prompt는 기본값으로 try-on에 맞는 문장이 미리 채워져 있습니다. 필요 시 수정합니다.
7. **생성** 버튼을 누르면 결과가 그리드에 표시됩니다 (실패한 칸은 에러 메시지로 표시).

## 보안 메모

- API Key는 브라우저에서 직접 Google API로 전송됩니다 (CORS 허용됨). 키가 페이지 메모리/`localStorage`에
  노출되므로 **신뢰할 수 있는 로컬 환경에서만** 사용하세요.
- `localStorage` 저장이 싫다면 체크박스를 끄세요 (페이지 닫으면 사라짐).

## 파일 구성

- `index.html` — UI 레이아웃
- `style.css` — 다크 테마
- `app.js` — API 호출 (병렬), 로깅, 결과 렌더링 로직
