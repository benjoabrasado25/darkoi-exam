"""Cut the clock hands + centre cap out of REFERENCE IMAGE.png and build a hand-free background.
This is a one-off helper used to make the game images; the game does not need it.
Requires: pip install pillow numpy scipy
Usage:    python extract_assets.py "REFERENCE IMAGE.png" <out_dir>
Then background.png was saved as background.jpg (quality 90) to keep the game light."""
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as nd

src, out = sys.argv[1], sys.argv[2]
rgb = np.array(Image.open(src).convert("RGB")).astype(float)
H, W, _ = rgb.shape
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
YEL = np.array([253, 213, 3.0])                       # clock-face yellow
CX, CY = 723.0, 549.5                                  # pivot = centre of green cap
yy, xx = np.mgrid[0:H, 0:W]
rad = np.hypot(xx - CX, yy - CY)

def comp(mask, seed):
    lab, _ = nd.label(mask); return lab == lab[seed]

blue = comp((B > R + 40) & (B > G + 10), (400, 722))
red = comp((R > 110) & (G < 0.45 * R) & (B < 0.45 * R), (600, 840))
green = comp((G > R + 20) & (G > B + 20), (545, 725))
nonyellow = np.linalg.norm(rgb - YEL, axis=2) > 25

def color_to_alpha(region):
    """GIMP-style colour-to-alpha against the face yellow (for soft outline/shadow pixels)."""
    p = rgb[region]
    up = (p - YEL) / np.maximum(255 - YEL, 1); dn = (YEL - p) / np.maximum(YEL, 1)
    a = np.clip(np.max(np.where(p > YEL, up, dn), axis=1), 0, 1)
    col = np.where(a[:, None] > 0, (p - YEL) / np.maximum(a[:, None], 1e-3) + YEL, 0)
    return np.clip(col, 0, 255), a

def layer(core, halo_px, exclude):
    """RGBA layer: solid core + colour-to-alpha halo (dark outline / soft shadow)."""
    # solid part = colour mask + any clearly non-yellow pixel touching it (highlights, outline)
    strong = np.linalg.norm(rgb - YEL, axis=2) > 120
    core = nd.binary_closing(core, iterations=2)
    core = nd.binary_fill_holes(core | (nd.binary_dilation(core, iterations=2) & strong)) & ~exclude
    halo = (nd.binary_dilation(core, iterations=halo_px) if halo_px else np.zeros_like(core)) & ~core & ~exclude
    img = np.zeros((H, W, 4))
    img[core, :3] = rgb[core]; img[core, 3] = 255
    col, a = color_to_alpha(halo)
    img[halo, :3] = col; img[halo, 3] = a * 255
    return img, core | halo


# ---- digital display bounds: first contiguous non-yellow run through the box ----
def run(arr, start):
    i = start
    while i < len(arr) and arr[i]: i += 1
    return i - 1
row = 700
xs = np.nonzero(nonyellow[row, 560:900])[0] + 560
dx0 = xs.min(); dx1 = run(nonyellow[row], dx0)
mid = int((dx0 + dx1) / 2)
dy0 = np.nonzero(nonyellow[600:700, mid])[0].min() + 600
dy1 = run(nonyellow[:, mid], dy0)
in_disp = (xx >= dx0 - 3) & (xx <= dx1 + 3) & (yy >= dy0 - 3) & (yy <= dy1 + 3)
cap_disk = rad <= 40.5
# Hands: keep everything except what is hidden under the cap
blue_img, blue_all = layer(blue, 5, cap_disk | red)
red_img, red_all = layer(red, 5, cap_disk | blue | (in_disp & ~red))
# Cap: green body + its dark rim (non-yellow, non-hand pixels close to the cap)
cap_core = nd.binary_fill_holes(green)
cap_rim = (rad <= 47) & ~cap_core & nonyellow & ~nd.binary_dilation(blue | red, iterations=2)
cap_img, _ = layer(cap_core, 0, np.zeros_like(cap_core))
col, a = color_to_alpha(cap_rim); cap_img[cap_rim, :3] = col; cap_img[cap_rim, 3] = a * 255

# ---- Background: erase hands, fill with face yellow, rebuild display corner by mirroring ----
bg = rgb.copy()
erase = nd.binary_dilation(blue | red, iterations=7) & ~cap_core
mx = int(round(dx0 + dx1))                              # mirror axis * 2
sel = erase & in_disp
bg[sel] = rgb[yy[sel], mx - xx[sel]]                   # copy mirrored left-hand corner
rest = erase & ~in_disp
bg[rest] = YEL                                          # flat face colour (face is uniform)

# blank the "4:00" digits: replace red segments (+ dark edges) inside the display with nearby orange
inner = (xx > dx0 + 18) & (xx < dx1 - 18) & (yy > dy0 + 16) & (yy < dy1 - 16)
orange = inner & (R > 200) & (G > 110) & (G < 190) & (B < 80)
digits = nd.binary_dilation(inner & ~orange, iterations=2) & inner
_, (iy, ix) = nd.distance_transform_edt(digits, return_indices=True)
bg[digits] = bg[iy[digits], ix[digits]]

def save(a, name, box=None):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA" if a.shape[2] == 4 else "RGB")
    if box: im = im.crop(box)
    im.save(f"{out}/{name}", optimize=True)

# Hands/cap are saved as squares centred on the pivot so CSS can rotate them around 50% 50%.
def square(r): return (int(CX - r), int(CY - r + 0.5), int(CX + r), int(CY + r + 0.5))
save(blue_img, "hand-minute.png", square(262))
save(red_img, "hand-hour.png", square(262))
save(cap_img, "center-cap.png", square(48))
save(bg, "background.png")

# geometry report (used by CSS/JS)
def tip_angle(m):
    ys, xs = np.nonzero(m); d = np.hypot(xs - CX, ys - CY); i = d.argmax()
    return float(np.degrees(np.arctan2(xs[i] - CX, CY - ys[i]))), float(d.max())
print(json.dumps({"size": [W, H], "pivot": [CX, CY], "display": [int(dx0), int(dy0), int(dx1), int(dy1)],
                  "inner_orange_bbox": [int(xx[orange].min()), int(yy[orange].min()), int(xx[orange].max()), int(yy[orange].max())],
                  "minute_tip": tip_angle(blue), "hour_tip": tip_angle(red),
                  "squares": {"hand": square(262), "cap": square(48)}}))
