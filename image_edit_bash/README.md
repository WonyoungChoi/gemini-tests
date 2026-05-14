# image_edit_bash

`image_edit`의 bash 버전. `curl` + `jq`로 Gemini API를 호출해 이미지를 편집합니다. 기본 모델은 `gemini-2.5-flash-image`.

## 요구 사항

- `curl`, `jq`, `base64`, `file`

## 사용법

```bash
export GEMINI_API_KEY=your_api_key_here
chmod +x edit_image.sh

./edit_image.sh [-m MODEL] [-o OUTPUT] [-v] <input_image> "<edit prompt>" [output_image]
./edit_image.sh --list-models
```

옵션:
- `-m, --model MODEL` — 사용할 모델 (기본값: `gemini-2.5-flash-image`)
- `-o, --output PATH` — 출력 이미지 경로 (기본값: `edited.png`)
- `-s, --image-size {1K,2K,4K}` — 출력 이미지 해상도 힌트. 모델이 지원해야 동작. 미지정 시 모델 기본값.
- `-v, --verbose` — 진행 상황을 stderr로 출력
- `--list-models` — 사용 가능한 image 모델 목록 출력

예시:

```bash
./edit_image.sh cat.png "이 고양이가 우주복을 입게 해줘" cat_astronaut.png
./edit_image.sh -m gemini-2.5-flash-image-preview cat.png "background to space"
./edit_image.sh --list-models
```

`-o`/output 인자를 생략하면 `edited.png`로 저장됩니다. 실행 후 Cached/Non-cached Input Token, Output Token 통계가 출력됩니다.
