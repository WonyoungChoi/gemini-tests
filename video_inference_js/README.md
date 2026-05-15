# video_inference_js

Gemini 모델로 **동영상의 내용을 분석**(video understanding)하는 정적 웹 페이지 버전입니다. `image_edit_js` / `video_gen_js`와 동일한 패턴이며, 10초 내외의 짧은 영상을 입력으로 받아 모델이 텍스트로 분석 결과를 출력합니다.

## 사용법

1. `video_inference_js/index.html`을 브라우저에서 엽니다 (Chrome / Edge 권장).
2. 좌측에서 **API Key**, **모델**, **업로드 방식**, **생성 옵션**을 설정합니다.
   - `사용 가능한 모델 불러오기` 버튼은 `generateContent`를 지원하는 Gemini 텍스트/멀티모달 모델만 필터링합니다.
3. 메인 폼에서 **동영상 파일**(필수, 약 10초)과 **프롬프트**(분석 지시문)를 입력하고 **분석 시작**.
4. 결과 영역에 모델 응답 텍스트가, 하단 로그 패널에 **토큰 사용량**이 출력됩니다.

## 옵션

| 옵션               | 값                                          | 비고                                              |
| ------------------ | ------------------------------------------- | ------------------------------------------------- |
| Model              | `gemini-2.5-flash`, `gemini-2.5-pro`, ...   | 직접 입력하거나 목록에서 선택                     |
| Upload mode        | `inline` (≤ 20MB) / `Files API`             | 큰 파일은 Files API 권장                          |
| Temperature        | 0 ~ 2                                       | 창의성                                            |
| Top P / Top K      | 자유                                        | 비워두면 모델 기본값                              |
| Max output tokens  | 정수                                        | 응답 길이 상한                                    |
| Thinking budget    | `-1` auto / `0` off / 정수                  | Gemini 2.5 thinking 제어                          |
| Media resolution   | LOW / MEDIUM / HIGH                         | 프레임당 토큰 수 (비용/정밀도 트레이드오프)       |
| FPS                | 0.1 ~ 30                                    | 영상 샘플링 fps (기본 1 fps)                      |

## 토큰 정보

응답의 `usageMetadata`에서 다음을 추출해 로그에 출력합니다:

- Cached Input Token
- Non-cached Input Token
- Output Token
- Thinking Token (있을 경우)
- Total Token
- Prompt 입력 modality 별 분해 (VIDEO / AUDIO / TEXT 등)

Gemini는 영상을 **1 fps 샘플링**해 프레임 + 오디오를 토큰화합니다. `mediaResolution`에 따라 프레임당 토큰 수가 달라지므로 비용을 줄이려면 `MEDIA_RESOLUTION_LOW`를 사용하세요.

## 업로드 방식

- **inline**: 파일을 base64로 인코딩해서 `inline_data` 파트로 직접 전송. 요청 전체 크기 ≤ 20MB 제한 (Gemini API 한계).
- **Files API**: `https://generativelanguage.googleapis.com/upload/v1beta/files`로 resumable 업로드 → 상태가 `ACTIVE`가 될 때까지 폴링 → `file_data.file_uri`로 참조. 큰 파일/긴 영상에 권장.

## 제약 / 주의

- **CORS**: Gemini API는 브라우저 직접 호출이 허용됩니다. Files API도 동일.
- **API Key 노출**: 정적 페이지이므로 키가 네트워크 탭에 노출됩니다. 공유 환경에서는 사용하지 마세요.
- **MIME**: `video/mp4`, `video/webm`, `video/mov`, `video/avi`, `video/x-flv`, `video/mpg`, `video/wmv`, `video/3gpp` 지원.
- **길이 제한**: 모델별로 다르나 2.5 계열은 수 분 ~ 1시간까지 분석 가능. 다만 inline 모드는 20MB 제한이 먼저 걸립니다.

## 파일 구성

- `index.html` — UI 레이아웃
- `style.css` — 다크 테마
- `app.js` — inline / Files API 업로드, `generateContent` 호출, 토큰 사용량 출력
