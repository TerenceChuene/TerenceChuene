#!/usr/bin/env python3
"""Compose a GitFut-style scout dashboard PNG for the profile README."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


W, H = 1100, 720


def font(size: int, bold: bool = False):
    candidates = (
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        if bold
        else [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
    )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def stars(n: int, max_n: int = 5) -> str:
    n = max(0, min(max_n, int(n)))
    return "★" * n + "☆" * (max_n - n)


def panel(draw, box):
    rounded_rect(draw, box, 14, fill=(18, 24, 40), outline=(42, 51, 72), width=1)


def main():
    data = json.load(sys.stdin)

    img = Image.new("RGB", (W, H), (11, 16, 32))
    draw = ImageDraw.Draw(img, "RGBA")

    # Ambient blobs
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((860, -80, 1180, 240), fill=(42, 27, 74, 90))
    g.ellipse((-40, 520, 260, 820), fill=(26, 42, 74, 80))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    f_title = font(28, bold=True)
    f_small = font(12)
    f_label = font(11, bold=True)
    f_body = font(13)
    f_ovr = font(28, bold=True)
    f_tiny = font(10)

    # OVR badge
    rounded_rect(draw, (36, 28, 108, 100), 12, fill=(20, 27, 45), outline=(44, 53, 77))
    draw.text((72, 40), str(data["overall"]), fill=(255, 255, 255), font=f_ovr, anchor="mt")
    draw.text((72, 78), data["finish"], fill=(201, 164, 92), font=f_tiny, anchor="mt")

    # Name + tags
    draw.text((124, 34), data["name"], fill=(255, 255, 255), font=f_title)
    rounded_rect(draw, (124, 72, 172, 94), 4, fill=(31, 143, 78))
    draw.text((148, 83), data["position"], fill=(255, 255, 255), font=f_small, anchor="mm")

    arch = data["archetype"]
    aw = max(90, int(f_small.getlength(arch) + 20))
    rounded_rect(draw, (180, 72, 180 + aw, 94), 4, fill=(42, 51, 72))
    draw.text((180 + aw / 2, 83), arch, fill=(215, 221, 232), font=f_small, anchor="mm")

    handle = f"@{data['login']}"
    draw.text((180 + aw + 14, 83), handle, fill=(139, 147, 167), font=f_small, anchor="lm")

    lang = data["language"]
    lx = 180 + aw + 14 + int(f_small.getlength(handle)) + 16
    lw = max(56, int(f_small.getlength(lang) + 20))
    rounded_rect(draw, (lx, 72, lx + lw, 94), 4, fill=(91, 61, 145))
    draw.text((lx + lw / 2, 83), lang, fill=(255, 255, 255), font=f_small, anchor="mm")

    draw.text(
        (124, 108),
        f"ONE TO WATCH  ·  {data['blurb']}",
        fill=(212, 181, 106),
        font=f_small,
    )
    draw.text((1064, 40), f"ZA", fill=(107, 115, 136), font=f_small, anchor="rt")

    # Left attributes
    panel(draw, (36, 140, 286, 350))
    draw.text((56, 156), "ATTRIBUTES", fill=(139, 147, 167), font=f_label)
    rows = [
        ("Skill moves", stars(data["skill_moves"])),
        ("Weak foot", stars(data["weak_foot"])),
        ("Work rate", data["work_rate"]),
        ("Style", data["style"]),
    ]
    y = 190
    for label, value in rows:
        draw.text((56, y), label, fill=(200, 208, 224), font=f_body)
        color = (240, 215, 140) if "★" in value else (255, 255, 255)
        draw.text((266, y), value, fill=color, font=f_body, anchor="rt")
        y += 34

    # Playstyles
    panel(draw, (36, 370, 286, 490))
    draw.text((56, 386), "PLAYSTYLES", fill=(139, 147, 167), font=f_label)
    # wrap text
    text = data["playstyles"]
    words = text.split()
    lines, cur = [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if f_small.getlength(trial) <= 210:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    yy = 416
    for line in lines[:4]:
        draw.text((56, yy), line, fill=(154, 163, 181), font=f_small)
        yy += 18

    # Center card
    card = Image.open(data["card_path"]).convert("RGBA")
    card.thumbnail((340, 480), Image.Resampling.LANCZOS)
    cx = 330 + (340 - card.width) // 2
    cy = 130 + (480 - card.height) // 2
    # soft shadow
    shadow = Image.new("RGBA", (card.width + 24, card.height + 24), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((8, 12, card.width + 16, card.height + 20), 18, fill=(0, 0, 0, 90))
    img.paste(shadow, (cx - 8, cy - 8), shadow)
    img.paste(card, (cx, cy), card)
    draw = ImageDraw.Draw(img)
    first = data["name"].split()[0]
    draw.text(
        (500, 625),
        f"{first} · {data['overall']} OVR · {data['position']}",
        fill=(107, 115, 136),
        font=f_small,
        anchor="mt",
    )

    # Right metrics
    panel(draw, (710, 140, 1064, 440))
    draw.text((730, 156), "SCOUTING METRICS", fill=(139, 147, 167), font=f_label)
    my = 188
    for m in data["metrics"]:
        label = m["label"]
        raw = f"{m['value']} {m['unit']}"
        score = int(m["score"])
        draw.text((730, my), label, fill=(154, 163, 181), font=f_small)
        draw.text((1044, my), raw, fill=(200, 208, 224), font=f_small, anchor="rt")
        # bar
        bar_y = my + 16
        draw.rounded_rectangle((730, bar_y, 890, bar_y + 6), 3, fill=(42, 51, 72))
        fill_w = int(160 * min(100, score) / 100)
        if fill_w > 0:
            draw.rounded_rectangle((730, bar_y, 730 + fill_w, bar_y + 6), 3, fill=(215, 181, 109))
        draw.text((1044, bar_y + 3), str(score), fill=(139, 147, 167), font=f_tiny, anchor="rm")
        my += 30

    # Distribution
    panel(draw, (710, 460, 1064, 630))
    draw.text((730, 476), "DISTRIBUTION", fill=(139, 147, 167), font=f_label)
    bins = 24
    peak = 11
    ovr = int(data["overall"])
    marker = round((ovr / 99) * (bins - 1))
    base_y = 560
    max_h = 70
    for i in range(bins):
        dist = abs(i - peak)
        amp = pow(2.718281828, -(dist * dist) / 18)
        bh = max(4, int(max_h * amp))
        bx = 730 + i * (310 / bins)
        bw = 310 / bins - 2
        color = (240, 215, 140) if i == marker else (61, 74, 102)
        draw.rectangle((bx, base_y - bh, bx + bw, base_y), fill=color)
    mx = 730 + marker * (310 / bins) + (310 / bins) / 2
    for yy in range(490, 560, 6):
        draw.line((mx, yy, mx, min(yy + 3, 560)), fill=(240, 215, 140), width=1)

    ranks = data["ranks"]
    draw.text(
        (730, 580),
        f"TOP {ranks['github']}% of GitHub   |   TOP {ranks['active']}% of active devs",
        fill=(200, 208, 224),
        font=f_small,
    )
    draw.text(
        (730, 602),
        f"{data['login'].lower()} · {ovr} · updated {data['scouted_at']}",
        fill=(92, 101, 122),
        font=f_tiny,
    )

    draw.text(
        (550, 690),
        "Auto-scouted from GitFut · country ZA",
        fill=(74, 82, 104),
        font=f_tiny,
        anchor="mt",
    )

    out = Path(data["out_path"])
    img.save(out, format="PNG", optimize=True)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
