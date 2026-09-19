#!/usr/bin/env python3
"""Convert a photo into pixel-art style, for use as Unity sprite source art.

Usage:
    python pixelate.py input.jpg output.png --pixel-size 8 --colors 32

The output keeps the original image dimensions but is built from blocky
pixel_size x pixel_size cells and a reduced color palette, so it reads as
pixel art at any zoom level. Import the result into Unity with
Filter Mode = Point (no filter) and Compression = None to keep the hard
edges (see the README's "Pixel Art 素材製作" section).
"""

import argparse
from pathlib import Path

from PIL import Image


def pixelate(source: Path, pixel_size: int, colors: int) -> Image.Image:
    image = Image.open(source).convert("RGB")
    width, height = image.size

    small_width = max(1, width // pixel_size)
    small_height = max(1, height // pixel_size)

    small = image.resize((small_width, small_height), Image.BILINEAR)
    quantized = small.quantize(colors=colors, method=Image.MEDIANCUT)
    return quantized.convert("RGB").resize((width, height), Image.NEAREST)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="來源照片路徑")
    parser.add_argument("output", type=Path, help="輸出的像素畫 PNG 路徑")
    parser.add_argument(
        "--pixel-size",
        type=int,
        default=8,
        help="每個像素方塊對應原圖的邊長（越大越粗糙），預設 8",
    )
    parser.add_argument(
        "--colors",
        type=int,
        default=32,
        help="輸出圖片的色盤數量，預設 32",
    )
    args = parser.parse_args()

    result = pixelate(args.input, args.pixel_size, args.colors)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    print(f"已輸出：{args.output}")


if __name__ == "__main__":
    main()
