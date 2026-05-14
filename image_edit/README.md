# image_edit

원본 이미지와 prompt를 입력 받아 Gemini API(`gemini-2.5-flash-image`)로 이미지를 편집합니다.

## 설치

```bash
pip install -r requirements.txt
export GEMINI_API_KEY=your_api_key_here
```

## 사용법

```bash
python main.py <input_image> "<edit prompt>" -o <output_image>
```

예시:

```bash
python main.py cat.png "이 고양이가 우주복을 입게 해줘" -o cat_astronaut.png
```

`-o` 옵션을 생략하면 `edited.png`로 저장됩니다.
