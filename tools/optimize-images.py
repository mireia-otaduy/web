#!/usr/bin/env python3
"""
Genera las versiones WebP de las imágenes de src/img y las variantes reducidas.

No forma parte del build normal: los resultados ya están en src/img. Solo hay que
ejecutarlo cuando se añadan o cambien fotos o logotipos.

  - Cada .jpg/.png genera un .webp (solo si ocupa al menos un 10 % menos).
  - Las imágenes listadas en VARIANTS generan además copias más pequeñas
    (por ejemplo portada-800.jpg) que el build enlaza con srcset.

Requiere Pillow:  pip install pillow
Uso:  python3 tools/optimize-images.py
"""
from pathlib import Path
from PIL import Image

IMG = Path(__file__).resolve().parent.parent / "src" / "img"

# Imagen -> anchos adicionales (px)
VARIANTS = {"portada.jpg": [800]}

# Imágenes que no se convierten (Open Graph: las leen redes sociales, que no admiten WebP en todos los casos)
SKIP_PREFIXES = ("og-",)


def save_webp(image: Image.Image, target: Path, lossless: bool) -> int:
    if lossless:
        image.save(target, "WEBP", lossless=True, quality=100, method=6)
    else:
        image.save(target, "WEBP", quality=82, method=6)
    return target.stat().st_size


saved_total = 0
for source in sorted(IMG.iterdir()):
    if source.suffix.lower() not in (".jpg", ".png") or source.name.startswith(SKIP_PREFIXES):
        continue
    if "-" in source.stem and source.stem.rsplit("-", 1)[-1].isdigit() and source.stem.rsplit("-", 1)[0] in {
        Path(name).stem for name in VARIANTS
    }:
        continue  # variantes generadas por este mismo script

    original = Image.open(source)
    original.load()
    is_png = source.suffix.lower() == ".png"

    outputs = [(source, original)]
    for width in VARIANTS.get(source.name, []):
        if original.width > width:
            height = round(original.height * width / original.width)
            resized = original.resize((width, height), Image.LANCZOS)
            variant = source.with_name(f"{source.stem}-{width}{source.suffix}")
            if is_png:
                resized.save(variant, optimize=True)
            else:
                resized.convert("RGB").save(variant, "JPEG", quality=84, optimize=True, progressive=True)
            outputs.append((variant, resized))

    for path, image in outputs:
        target = path.with_suffix(".webp")
        size = save_webp(image, target, lossless=is_png)
        if size > path.stat().st_size * 0.9:
            target.unlink()  # no compensa
            continue
        saved_total += path.stat().st_size - size
        print(f"{path.name:28} {path.stat().st_size:>8} -> {target.name:28} {size:>8}")

print(f"\nAhorro total: {saved_total / 1024:.0f} KiB")
