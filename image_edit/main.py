"""Edit an input image with a text prompt using Gemini's image model."""

import argparse
import mimetypes
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types

MODEL = "gemini-2.5-flash-image"


def edit_image(image_path: Path, prompt: str, output_path: Path) -> Path:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        sys.exit("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.")

    if not image_path.is_file():
        sys.exit(f"Input image not found: {image_path}")

    mime_type, _ = mimetypes.guess_type(str(image_path))
    if mime_type is None:
        mime_type = "image/png"

    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=image_path.read_bytes(), mime_type=mime_type),
            prompt,
        ],
    )

    candidates = response.candidates or []
    for candidate in candidates:
        for part in candidate.content.parts:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(inline.data)
                return output_path
            if getattr(part, "text", None):
                print(part.text, file=sys.stderr)

    sys.exit("No image returned from the model.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Edit an image with a Gemini prompt.")
    parser.add_argument("image", type=Path, help="Path to the input image.")
    parser.add_argument("prompt", type=str, help="Edit instruction for the model.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("edited.png"),
        help="Output image path (default: edited.png).",
    )
    args = parser.parse_args()

    result = edit_image(args.image, args.prompt, args.output)
    print(f"Saved edited image to {result}")


if __name__ == "__main__":
    main()
