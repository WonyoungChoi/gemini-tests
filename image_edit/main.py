"""Edit an input image with a text prompt using Gemini's image model."""

import argparse
import mimetypes
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash-image"


def get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        sys.exit("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.")
    return genai.Client(api_key=api_key)


def list_models() -> None:
    client = get_client()
    image_models = []
    for model in client.models.list():
        methods = getattr(model, "supported_actions", None) or getattr(
            model, "supported_generation_methods", []
        )
        name = (model.name or "").removeprefix("models/")
        if "generateContent" not in methods:
            continue
        if "image" not in name.lower():
            continue
        image_models.append((name, getattr(model, "display_name", "") or ""))

    if not image_models:
        print("No image-capable models found.")
        return

    print("Available image-capable models:")
    width = max(len(n) for n, _ in image_models)
    for name, display in sorted(image_models):
        suffix = f"  {display}" if display else ""
        print(f"  {name:<{width}}{suffix}")


def edit_image(image_path: Path, prompt: str, output_path: Path, model: str) -> Path:
    if not image_path.is_file():
        sys.exit(f"Input image not found: {image_path}")

    mime_type, _ = mimetypes.guess_type(str(image_path))
    if mime_type is None:
        mime_type = "image/png"

    client = get_client()

    response = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=image_path.read_bytes(), mime_type=mime_type),
            prompt,
        ],
    )

    saved_path: Path | None = None
    candidates = response.candidates or []
    for candidate in candidates:
        for part in candidate.content.parts:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data and saved_path is None:
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(inline.data)
                saved_path = output_path
            elif getattr(part, "text", None):
                print(part.text, file=sys.stderr)

    print_token_usage(response)

    if saved_path is None:
        sys.exit("No image returned from the model.")
    return saved_path


def print_token_usage(response) -> None:
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return
    prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
    cached_tokens = getattr(usage, "cached_content_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    non_cached_tokens = max(prompt_tokens - cached_tokens, 0)

    print("Token usage:")
    print(f"  Cached Input Token:     {cached_tokens}")
    print(f"  Non-cached Input Token: {non_cached_tokens}")
    print(f"  Output Token:           {output_tokens}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Edit an image with a Gemini prompt.")
    parser.add_argument("image", nargs="?", type=Path, help="Path to the input image.")
    parser.add_argument("prompt", nargs="?", type=str, help="Edit instruction for the model.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("edited.png"),
        help="Output image path (default: edited.png).",
    )
    parser.add_argument(
        "-m",
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Model to use (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List image-capable models and exit.",
    )
    args = parser.parse_args()

    if args.list_models:
        list_models()
        return

    if args.image is None or args.prompt is None:
        parser.error("image and prompt are required (unless --list-models is given).")

    result = edit_image(args.image, args.prompt, args.output, args.model)
    print(f"Saved edited image to {result}")


if __name__ == "__main__":
    main()
