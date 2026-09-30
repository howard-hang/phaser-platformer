#!/usr/bin/env python3
"""生成安卓桌面图标和启动图：紫色底上的白色方块，画法和游戏里的玩家一致。

依赖 Pillow：pip install pillow
然后在仓库根目录运行：python3 scripts/generate-android-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "android" / "app" / "src" / "main" / "res"
PURPLE = (192, 38, 211, 255)
WHITE = (244, 244, 245, 255)
SHADE = (212, 212, 216, 255)
INK = (17, 17, 17, 255)
CENTER = (22, 22, 22, 255)

# 传统启动图标边长。
LAUNCHER = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# 自适应图标前景是 108dp，四周留给系统遮罩。
FOREGROUND = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# 覆盖 Capacitor 模板里已有的启动图尺寸。
SPLASHES = {
    "drawable/splash.png": (480, 320),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
}


def draw_player(base, left, top, size):
    """按 src/game/textures.js 的比例画玩家方块，先放大再缩小，边缘更干净。"""
    scale = 8
    big = size * scale
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    pen.rectangle([0, 0, big - 1, big - 1], fill=WHITE)
    inset = 8 * big / 42
    inner = 34 * big / 42
    pen.polygon(
        [
            (big, 0),
            (big, big),
            (0, big),
            (inset, inner),
            (inner, inner),
            (inner, inset),
        ],
        fill=SHADE,
    )
    stroke = max(scale, int(round(4 * big / 42)))
    pen.rectangle(
        [stroke // 2, stroke // 2, big - 1 - stroke // 2, big - 1 - stroke // 2],
        outline=INK,
        width=stroke,
    )
    cell = 13 * big / 42
    hole = 16 * big / 42
    pen.rectangle([cell, cell, cell + hole, cell + hole], fill=CENTER)
    sprite = layer.resize((size, size), Image.Resampling.LANCZOS)
    base.alpha_composite(sprite, (int(left), int(top)))


def launcher_icon(size, rounded):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    if rounded:
        pen.ellipse([0, 0, size - 1, size - 1], fill=PURPLE)
    else:
        pen.rectangle([0, 0, size - 1, size - 1], fill=PURPLE)
    block = int(round(size * 0.56))
    origin = (size - block) / 2
    draw_player(image, origin, origin, block)
    return image


def foreground_icon(size):
    """前景透明，紫色由自适应图标的背景色提供。方块落在中间安全区。"""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    block = int(round(size * 0.46))
    origin = (size - block) / 2
    draw_player(image, origin, origin, block)
    return image


def splash_image(width, height):
    image = Image.new("RGBA", (width, height), PURPLE)
    block = int(round(min(width, height) * 0.22))
    draw_player(image, (width - block) / 2, (height - block) / 2, block)
    return image


def save(image, relative):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")
    print(path.relative_to(ROOT.parent.parent.parent.parent))


def main():
    for folder, size in LAUNCHER.items():
        save(launcher_icon(size, rounded=False), f"{folder}/ic_launcher.png")
        save(launcher_icon(size, rounded=True), f"{folder}/ic_launcher_round.png")
    for folder, size in FOREGROUND.items():
        save(foreground_icon(size), f"{folder}/ic_launcher_foreground.png")
    for relative, (width, height) in SPLASHES.items():
        save(splash_image(width, height), relative)


if __name__ == "__main__":
    main()
