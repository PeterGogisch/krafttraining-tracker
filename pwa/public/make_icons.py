from PIL import Image, ImageDraw

for size in (192, 512):
    img = Image.new("RGB", (size, size), "#111111")
    d = ImageDraw.Draw(img)
    m = size // 5
    d.rectangle([m, size * 0.45, size - m, size * 0.55], fill="#f5a623")      # Stange
    d.rectangle([m, size * 0.3, m + size * 0.08, size * 0.7], fill="#f5a623")  # Scheibe links
    d.rectangle([size - m - size * 0.08, size * 0.3, size - m, size * 0.7], fill="#f5a623")  # Scheibe rechts
    img.save(f"icon-{size}.png")