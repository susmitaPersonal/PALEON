"""One fixed preprocessing path for every image and model.

Re-encoding from decoded pixels drops EXIF and any other embedded metadata. Random
per-image filenames are unnecessary here because only pixels reach the provider.
"""
import io

from PIL import Image, ImageOps

PREPROCESS_VERSION = "v1"
# Museum runestone photographs reach about 62 megapixels. This is a safety ceiling, not a quality setting.
MAX_PIXELS = 120_000_000


def normalize_image(data: bytes, longest_edge: int = 2048, jpeg_quality: int = 92) -> tuple[bytes, str]:
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS     # Pillow warns far lower, so the explicit check below is the limit.
    with Image.open(io.BytesIO(data)) as source:
        width, height = source.size
        if width * height > MAX_PIXELS:
            raise ValueError(f"image has {width * height} pixels, over the {MAX_PIXELS} limit")
        # Apply orientation before metadata is discarded, or rotated photos arrive sideways.
        image = ImageOps.exif_transpose(source).convert("RGB")
    image.thumbnail((longest_edge, longest_edge), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=jpeg_quality)
    return buffer.getvalue(), "image/jpeg"
