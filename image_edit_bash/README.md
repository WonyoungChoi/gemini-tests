# image_edit_bash

`image_edit`의 bash 버전. `curl` + `jq`로 Gemini API(`gemini-2.5-flash-image`)를 호출해 이미지를 편집합니다.

## 요구 사항

- `curl`, `jq`, `base64`, `file`

## 사용법

```bash
export GEMINI_API_KEY=your_api_key_here
chmod +x edit_image.sh
./edit_image.sh <input_image> "<edit prompt>" [output_image]
```

예시:

```bash
./edit_image.sh cat.png "이 고양이가 우주복을 입게 해줘" cat_astronaut.png
```

세 번째 인자를 생략하면 `edited.png`로 저장됩니다. 실행 후 Cached/Non-cached Input Token, Output Token 통계가 출력됩니다.
