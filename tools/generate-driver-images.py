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
    """Pass Cozytouch: slim io-homecontrol radio module with mounting holes."""
    c = Canvas()

    # Slim vertical body
    c.rect(330, 140, 670, 860, radius=40, fill=BODY, outline=EDGE, width=5)
    # Diagonal fixing holes (top-left / bottom-right)
    c.ellipse(375, 195, 445, 265, fill=WHITE, outline=DETAIL, width=5)
    c.ellipse(555, 735, 625, 805, fill=WHITE, outline=DETAIL, width=5)
    # Embossed io-homecontrol plate
    c.rect(400, 360, 600, 560, radius=28, fill=WHITE, outline=EDGE, width=5)
    # Stylized "io": dotted i + o ring
    c.ellipse(430, 400, 465, 435, fill=SCREEN, outline=None, width=0)
    c.rect(440, 445, 455, 520, radius=7, fill=SCREEN, outline=None, width=0)
    c.ellipse(495, 410, 565, 500, fill=WHITE, outline=SCREEN, width=6)
    # homecontrol wordmark as a simple bar
    c.line(430, 595, 570, 595, fill=DETAIL, width=5)
    c.led(500, 680, 11)

    c.ground_shadow(500, 890, 190, 13)
    return c


def zone_control():
    """Shogun Zone Control: répartiteur + tall controller + square sonde stacked."""
    c = Canvas()
    charcoal = SCREEN
    port_inner = (70, 76, 84)

    # Répartiteur — silver lid / charcoal body / 3 circular duct collars
    c.rect(40, 300, 610, 700, radius=28, fill=charcoal, outline=EDGE, width=5)
    c.rect(40, 300, 610, 400, radius=28, fill=BODY, outline=EDGE, width=5)
    c.line(60, 400, 590, 400, fill=EDGE, width=4)

    for cx in (145, 325, 505):
        c.ellipse(cx - 75, 445, cx + 75, 595, fill=BODY_DARK, outline=DETAIL, width=5)
        c.ellipse(cx - 54, 466, cx + 54, 574, fill=port_inner, outline=DETAIL, width=4)
        c.line(cx - 46, 520, cx + 46, 520, fill=DETAIL, width=4)

    c.rect(75, 700, 140, 760, radius=8, fill=BODY_DARK, outline=EDGE, width=4)
    c.rect(510, 700, 575, 760, radius=8, fill=BODY_DARK, outline=EDGE, width=4)

    # ── Tall wall controller (top right) ────────────────────────────
    c.rect(700, 90, 940, 520, radius=26, fill=BODY, outline=EDGE, width=5)
    # Square LCD centered in upper half
    c.rect(755, 125, 885, 255, radius=12, fill=SCREEN)
    # MENU — between screen and dial, upper-left
    c.ellipse(720, 270, 765, 315, fill=WHITE, outline=EDGE, width=4)
    # Scroll dial + center button
    c.ellipse(755, 325, 885, 455, fill=WHITE, outline=EDGE, width=5)
    c.ellipse(795, 365, 845, 415, fill=BODY, outline=DETAIL, width=4)
    # Back button — lower-right of dial, with return arrow
    c.ellipse(875, 435, 925, 485, fill=WHITE, outline=EDGE, width=4)
    c.draw.arc(
        c._box(886, 447, 914, 475),
        start=200,
        end=20,
        fill=DETAIL,
        width=4 * SUPERSAMPLE,
    )
    c.line(886, 453, 886, 467, fill=DETAIL, width=4)
    c.line(886, 467, 896, 467, fill=DETAIL, width=4)
    # io mark bottom-left
    c.rect(720, 475, 765, 512, radius=8, fill=WHITE, outline=EDGE, width=3)
    c.ellipse(728, 483, 742, 497, fill=SCREEN, outline=None, width=0)
    c.ellipse(746, 485, 758, 505, fill=WHITE, outline=SCREEN, width=3)

    # ── Square ambient sensor (bottom right) ────────────────────────
    c.rect(700, 555, 940, 795, radius=22, fill=BODY, outline=EDGE, width=5)
    # Screen centered upper half
    c.rect(770, 585, 870, 655, radius=8, fill=SCREEN)
    # House icon left of screen
    c.rect(725, 598, 755, 640, radius=4, fill=WHITE, outline=DETAIL, width=3)
    c.line(732, 628, 748, 628, fill=DETAIL, width=3)
    # Round button right of screen
    c.ellipse(885, 600, 920, 635, fill=WHITE, outline=EDGE, width=4)
    # Round button left of split dial
    c.ellipse(720, 690, 770, 740, fill=WHITE, outline=EDGE, width=4)
    # Split up/down circular control
    c.ellipse(790, 670, 900, 780, fill=WHITE, outline=EDGE, width=5)
    c.line(800, 725, 890, 725, fill=DETAIL, width=4)
    # Sensor vents bottom-left
    for i in range(3):
        x = 715 + i * 10
        c.line(x, 765, x, 785, fill=DETAIL, width=3)

    c.ground_shadow(500, 840, 430, 16)
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
