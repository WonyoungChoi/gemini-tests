# image_edit

원본 이미지와 prompt를 입력 받아 Gemini API로 이미지를 편집합니다. 기본 모델은 `gemini-2.5-flash-image`.

## 설치

```bash
pip install -r requirements.txt
export GEMINI_API_KEY=your_api_key_here
```

## 사용법

```bash
python main.py [-m MODEL] [-o OUTPUT] [-v] <input_image> "<edit prompt>"
python main.py --list-models
```

옵션:
- `-m, --model MODEL` — 사용할 모델 (기본값: `gemini-2.5-flash-image`)
- `-o, --output PATH` — 출력 이미지 경로 (기본값: `edited.png`)
- `-s, --image-size {1K,2K,4K}` — 출력 이미지 해상도 힌트. 모델이 지원해야 동작 (예: `gemini-2.5-flash-image`는 일반적으로 1K, 일부 모델/티어는 2K/4K 지원). 미지정 시 모델 기본값.
- `-v, --verbose` — 진행 상황을 stderr로 출력
- `--list-models` — 사용 가능한 image 모델 목록 출력

예시:

```bash
python main.py cat.png "이 고양이가 우주복을 입게 해줘" -o cat_astronaut.png
python main.py -m gemini-2.5-flash-image-preview cat.png "background to space"
python main.py --list-models
```

`-o`를 생략하면 `edited.png`로 저장됩니다. 실행 후 Cached/Non-cached Input Token, Output Token 통계가 출력됩니다.
