#!/usr/bin/env python3
"""Generate the driver images required by the Homey App Store.

App Store guideline 1.4 asks for a unique image per driver showing the device
on a white background (the first submission used stock photos of furnished
rooms, which was rejected). Each driver gets a flat illustration of its device
type, drawn 4x oversampled and downscaled to the three required sizes:

    small 75x75, large 500x500, xlarge 1000x1000

Run from the repo root:  python3 tools/generate-driver-images.py
"""

import os

from PIL import Image, ImageDraw

# Logical drawing space; every coordinate below is in a 1000x1000 square.
UNIT = 1000
SUPERSAMPLE = 4
SIZES = {"small": 75, "large": 500, "xlarge": 1000}

WHITE = (255, 255, 255)
BODY = (243, 245, 247)
BODY_DARK = (228, 232, 236)
EDGE = (193, 200, 208)
DETAIL = (166, 175, 185)
SCREEN = (43, 49, 56)
ACCENT = (227, 0, 27)  # Atlantic brand red, same as brandColor in app.json
SHADOW = (236, 238, 240)


class Canvas:
    """Draw in 1000x1000 logical units on an oversampled RGB image."""

    def __init__(self):
        self.px = UNIT * SUPERSAMPLE
        self.image = Image.new("RGB", (self.px, self.px), WHITE)
        self.draw = ImageDraw.Draw(self.image)

    def _box(self, x0, y0, x1, y1):
        s = SUPERSAMPLE
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    def rect(self, x0, y0, x1, y1, radius=0, fill=BODY, outline=EDGE, width=5):
        self.draw.rounded_rectangle(
            self._box(x0, y0, x1, y1),
            radius=radius * SUPERSAMPLE,
            fill=fill,
            outline=outline,
            width=width * SUPERSAMPLE if outline else 0,
        )

    def ellipse(self, x0, y0, x1, y1, fill=BODY, outline=None, width=5):
        self.draw.ellipse(
            self._box(x0, y0, x1, y1),
            fill=fill,
            outline=outline,
            width=width * SUPERSAMPLE if outline else 0,
        )

    def line(self, x0, y0, x1, y1, fill=DETAIL, width=4):
        s = SUPERSAMPLE
        self.draw.line([x0 * s, y0 * s, x1 * s, y1 * s], fill=fill, width=width * s)

    def led(self, x, y, r=9):
        self.ellipse(x - r, y - r, x + r, y + r, fill=ACCENT)

    def ground_shadow(self, cx, cy, rx, ry=18):
        self.ellipse(cx - rx, cy - ry, cx + rx, cy + ry, fill=SHADOW)

    def save(self, directory):
        os.makedirs(directory, exist_ok=True)
        for name, size in SIZES.items():
            out = self.image.resize((size, size), Image.LANCZOS)
            out.save(os.path.join(directory, f"{name}.jpg"), "JPEG", quality=92, optimize=True)


# ── Device illustrations ────────────────────────────────────────────


def climate():
    """Split system: indoor head above, outdoor heat pump unit below."""
    c = Canvas()

    # Indoor head
    c.rect(120, 250, 880, 460, radius=50, fill=BODY, outline=EDGE, width=5)
    c.line(165, 295, 835, 295, fill=EDGE, width=4)
    # Air outlet with louver slats
    c.rect(175, 380, 825, 438, radius=20, fill=BODY_DARK, outline=DETAIL, width=4)
    for i in range(4):
        y = 392 + i * 13
        c.line(195, y, 805, y, fill=DETAIL, width=3)
    c.led(795, 345)

    # Outdoor unit
    c.rect(330, 570, 670, 790, radius=24, fill=BODY, outline=EDGE, width=5)
    c.ellipse(365, 605, 545, 755, fill=WHITE, outline=DETAIL, width=5)
    for dx, dy in ((-52, -20), (30, -46), (26, 50)):
        c.line(455, 680, 455 + dx, 680 + dy, fill=DETAIL, width=7)
    for i in range(3):
        x = 580 + i * 26
        c.line(x, 610, x, 750, fill=DETAIL, width=5)

    c.ground_shadow(500, 800, 210, 13)
    return c


def heater():
    """Panel radiator with fins and a control dial."""
    c = Canvas()

    c.rect(180, 220, 820, 700, radius=26, fill=BODY, outline=EDGE, width=5)
    # Fins
    for i in range(9):
        x = 245 + i * 64
        c.line(x, 265, x, 655, fill=EDGE, width=6)
    # Top and bottom rails
    c.rect(180, 220, 820, 268, radius=26, fill=BODY_DARK, outline=EDGE, width=5)
    c.rect(180, 652, 820, 700, radius=26, fill=BODY_DARK, outline=EDGE, width=5)
    # Control panel on the bottom rail: display bar, dial, status LED
    c.rect(590, 655, 800, 697, radius=18, fill=WHITE, outline=EDGE, width=4)
    c.rect(610, 666, 700, 686, radius=8, fill=SCREEN)
    c.ellipse(715, 662, 755, 690, fill=BODY_DARK, outline=DETAIL, width=4)
    c.led(778, 676, 9)
    # Wall brackets
    c.rect(280, 700, 330, 775, radius=10, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(480, 700, 530, 775, radius=10, fill=BODY_DARK, outline=EDGE, width=4)

    c.ground_shadow(500, 800, 280, 13)
    return c


def water_heater():
    """Floor-standing cylindrical tank with a control panel."""
    c = Canvas()

    # Tank body as a capsule
    c.rect(330, 155, 670, 795, radius=170, fill=BODY, outline=EDGE, width=5)
    # Top dome highlight and seams
    c.line(350, 300, 650, 300, fill=EDGE, width=4)
    c.line(350, 690, 650, 690, fill=EDGE, width=4)
    # Control panel
    c.rect(400, 400, 600, 560, radius=22, fill=WHITE, outline=EDGE, width=5)
    c.rect(430, 430, 570, 490, radius=10, fill=SCREEN)
    c.line(455, 455, 545, 455, fill=WHITE, width=8)
    c.ellipse(440, 510, 480, 550, fill=BODY_DARK, outline=DETAIL, width=4)
    c.led(545, 530, 12)
    # Pipe stub out of the dome
    c.rect(475, 90, 525, 180, radius=14, fill=BODY_DARK, outline=EDGE, width=4)
    # Feet
    c.rect(390, 780, 450, 830, radius=8, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(550, 780, 610, 830, radius=8, fill=BODY_DARK, outline=EDGE, width=4)

    c.ground_shadow(500, 848, 230, 14)
    return c


def towel_rack():
    """Ladder-style heated towel rail."""
    c = Canvas()

    # Uprights
    c.rect(310, 170, 350, 810, radius=20, fill=BODY, outline=EDGE, width=5)
    c.rect(650, 170, 690, 810, radius=20, fill=BODY, outline=EDGE, width=5)
    # Rungs
    for i in range(8):
        y = 225 + i * 72
        c.rect(325, y, 675, y + 34, radius=17, fill=BODY, outline=EDGE, width=5)
    # Heating element box with LED at the bottom left
    c.rect(255, 700, 330, 800, radius=16, fill=BODY_DARK, outline=EDGE, width=5)
    c.led(292, 750, 11)
    # Wall mounts
    c.rect(690, 250, 745, 290, radius=10, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(690, 690, 745, 730, radius=10, fill=BODY_DARK, outline=EDGE, width=4)

    c.ground_shadow(500, 838, 230, 13)
    return c


def pass_cozytouch():
    """Pass Cozytouch radio module: small wall box with a pairing button."""
    c = Canvas()

    c.rect(285, 330, 715, 670, radius=48, fill=BODY, outline=EDGE, width=5)
    # Pairing button
    c.ellipse(430, 425, 570, 565, fill=WHITE, outline=EDGE, width=5)
    c.ellipse(470, 465, 530, 525, fill=BODY_DARK, outline=DETAIL, width=4)
    c.led(500, 615, 12)
    # Radio waves off the top corner, for the wireless link to the heater
    for r in (55, 95, 135):
        c.draw.arc(
            c._box(700 - r, 345 - r, 700 + r, 345 + r),
            start=-75,
            end=5,
            fill=DETAIL,
            width=5 * SUPERSAMPLE,
        )
    # Cable stub to the heater
    c.rect(475, 665, 525, 760, radius=12, fill=BODY_DARK, outline=EDGE, width=4)

    c.ground_shadow(500, 790, 190, 13)
    return c


def zone_control():
    """Shogun Zone Control: wall controller showing per-zone bars."""
    c = Canvas()

    c.rect(230, 250, 770, 700, radius=40, fill=BODY, outline=EDGE, width=5)
    # Screen
    c.rect(280, 300, 720, 530, radius=20, fill=SCREEN)
    # Three zone bars, the active one in brand red
    bars = ((320, 150), (440, 105), (560, 60))
    for i, (x, height) in enumerate(bars):
        top = 490 - height
        fill = ACCENT if i == 0 else (108, 118, 128)
        c.rect(x, top, x + 80, 490, radius=8, fill=fill, outline=None, width=0)
    c.line(300, 500, 700, 500, fill=(108, 118, 128), width=4)
    # Buttons
    c.ellipse(300, 570, 370, 640, fill=WHITE, outline=EDGE, width=5)
    c.line(320, 605, 350, 605, fill=DETAIL, width=7)
    c.ellipse(630, 570, 700, 640, fill=WHITE, outline=EDGE, width=5)
    c.line(650, 605, 680, 605, fill=DETAIL, width=7)
    c.line(665, 590, 665, 620, fill=DETAIL, width=7)
    c.led(500, 605, 12)

    c.ground_shadow(500, 730, 250, 14)
    return c


def heat_pump():
    """Air/water heat pump (Alféa): outdoor unit plus the indoor tank module."""
    c = Canvas()

    # Outdoor unit on the left: fan grille and exchanger fins
    c.rect(90, 380, 470, 700, radius=28, fill=BODY, outline=EDGE, width=5)
    c.ellipse(120, 410, 330, 620, fill=WHITE, outline=DETAIL, width=5)
    for dx, dy in ((-62, -24), (36, -55), (31, 60)):
        c.line(225, 515, 225 + dx, 515 + dy, fill=DETAIL, width=8)
    for i in range(4):
        x = 360 + i * 26
        c.line(x, 415, x, 615, fill=DETAIL, width=5)
    c.rect(120, 640, 440, 680, radius=14, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(140, 700, 200, 760, radius=8, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(360, 700, 420, 760, radius=8, fill=BODY_DARK, outline=EDGE, width=4)

    # Water pipes running to the indoor module
    c.line(470, 470, 610, 470, fill=DETAIL, width=12)
    c.line(470, 545, 610, 545, fill=DETAIL, width=12)

    # Indoor hydraulic module with its hot water tank
    c.rect(600, 180, 910, 780, radius=40, fill=BODY, outline=EDGE, width=5)
    c.line(625, 400, 885, 400, fill=EDGE, width=4)
    # Control panel above the tank section
    c.rect(645, 230, 865, 360, radius=22, fill=WHITE, outline=EDGE, width=5)
    c.rect(670, 258, 840, 312, radius=10, fill=SCREEN)
    c.line(692, 285, 762, 285, fill=WHITE, width=8)
    c.ellipse(675, 322, 711, 350, fill=BODY_DARK, outline=DETAIL, width=4)
    c.led(830, 336, 11)
    # Tank body seam and feet
    c.line(625, 700, 885, 700, fill=EDGE, width=4)
    c.rect(650, 780, 710, 820, radius=8, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(800, 780, 860, 820, radius=8, fill=BODY_DARK, outline=EDGE, width=4)

    c.ground_shadow(500, 838, 430, 14)
    return c


DRIVERS = {
    "climate": climate,
    "heater": heater,
    "water_heater": water_heater,
    "towel_rack": towel_rack,
    "pass_cozytouch": pass_cozytouch,
    "zone_control": zone_control,
    "heat_pump": heat_pump,
}


def main():
    for driver, build in DRIVERS.items():
        directory = os.path.join("drivers", driver, "assets", "images")
        build().save(directory)
        print(f"wrote {directory}/{{small,large,xlarge}}.jpg")


if __name__ == "__main__":
    main()
