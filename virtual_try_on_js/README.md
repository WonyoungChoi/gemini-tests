# virtual_try_on_js

Gemini API의 **Virtual Try-On** 모델을 호출해, 인물 사진과 의상 사진을 입력 받아
인물이 해당 의상을 착용한 결과 이미지를 최대 4장까지 생성하는 **정적 웹 페이지** 버전입니다.
별도 서버 없이 브라우저에서 바로 실행할 수 있습니다.

## 사용법

1. `virtual_try_on_js/index.html`을 더블 클릭해서 브라우저에서 엽니다 (Chrome, Edge 권장).
2. 좌측 사이드바의 **API Key** 필드에 Gemini API Key를 붙여 넣습니다.
   - 체크박스를 켜두면 브라우저 `localStorage`에 저장됩니다.
3. **모델**을 선택합니다 (기본: `virtual-try-on-preview-08-26`).
   - `사용 가능한 모델 불러오기` 버튼으로 계정에서 호출 가능한 try-on 모델 목록을 갱신할 수 있습니다.
4. **생성 옵션**에서 sample count(1–4), base steps, person generation, safety setting, 출력 MIME, seed,
   워터마크 여부 등을 설정합니다. 비워두면 모델 기본값이 적용됩니다.
5. 폼에서 **인물 이미지**와 **의상 이미지**를 각각 선택하고 **생성** 버튼을 누릅니다.
6. 결과 영역에 생성된 이미지들이 그리드로 표시되며, MIME · 파일 크기 · 가로×세로 정보와
   다운로드 링크가 함께 제공됩니다.
7. 하단의 **Verbose Log** 패널에 요청·응답 진행 상황과 안전 필터링 정보 등이 누적됩니다.

## API 호출 형식

엔드포인트:

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predict
```

요청 본문(요약):

```json
{
  "instances": [{
    "personImage":   { "image": { "bytesBase64Encoded": "...", "mimeType": "image/png" } },
    "productImages": [{ "image": { "bytesBase64Encoded": "...", "mimeType": "image/png" } }]
  }],
  "parameters": {
    "sampleCount": 4,
    "baseSteps": 32,
    "personGeneration": "allow_adult",
    "safetySetting": "block_low_and_above",
    "outputMimeType": "image/png",
    "seed": 12345,
    "addWatermark": false
  }
}
```

응답에서 `predictions[i].bytesBase64Encoded` 또는 `predictions[i].image.bytesBase64Encoded`
필드를 읽어 이미지를 디코딩합니다.

## 보안 메모

- API Key는 브라우저에서 직접 Google API로 전송됩니다 (CORS 허용됨). 키가 페이지 메모리/`localStorage`에
  노출되므로 **신뢰할 수 있는 로컬 환경에서만** 사용하세요.
- `localStorage` 저장이 싫다면 체크박스를 끄세요 (페이지 닫으면 사라짐).

## 파일 구성

- `index.html` — UI 레이아웃
- `style.css` — 다크 테마
- `app.js` — API 호출, 로깅, 결과 렌더링 로직
