#!/usr/bin/env sh
# Renders Byte's landing-page loop and writes the four files in public/media.
# Needs: python3 with `pip install bpy pillow`, and ffmpeg. About 35 minutes on 2 CPU cores.
set -e
cd "$(dirname "$0")"
export BYTE_OUT="${BYTE_OUT:-byte-video-out}"
python3 byte.py frames 1 120 24 900
for theme in dark light; do
  python3 comp.py "$BYTE_OUT/frames" "$theme" "$BYTE_OUT/$theme"
  ffmpeg -y -loglevel error -framerate 24 -i "$BYTE_OUT/$theme/f%03d.png" \
    -vf "scale=900:900:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 20 \
    -profile:v high -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart -an \
    "../../public/media/byte-$theme.mp4"
  python3 -c "from PIL import Image; Image.open('$BYTE_OUT/$theme/f001.png').save('../../public/media/byte-$theme.webp', quality=82)"
done
echo "done: public/media/byte-{dark,light}.{mp4,webp}"
