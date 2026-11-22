# Byte, the HeapHop robot, in 3D: a 5-second seamless loop where the shell bursts apart,
# the internals pop out (CPU board, RAM, wires, visor LEDs, joint motors and gears), and
# everything snaps back together. Every speed curve and the camera move are computed here
# per frame, so the loop is fully reproducible. See render.sh for the whole pipeline.
#
# Needs Blender as a Python module: pip install bpy (not an npm dependency).
#   python3 byte.py preview [F...]              key frames, 520 px, quick
#   python3 byte.py frames A B [SAMPLES] [SIZE]  frames A..B as transparent PNGs
#   python3 byte.py pose [SAMPLES] [SIZE]        Byte assembled and pointing (the Learn page), transparent PNG
# Output goes to $BYTE_OUT (default ./byte-video-out).
import bpy, bmesh, math, os, sys
from mathutils import Vector

FPS, N = 24, 120  # frame N+1 would equal frame 1: a seamless loop
MODE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else (sys.argv[1] if len(sys.argv) > 1 else "preview")
ARGS = sys.argv[sys.argv.index(MODE) + 1:]
OUT = os.environ.get("BYTE_OUT", "byte-video-out")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, N

# ------------------------------------------------------------------ materials
def hexc(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)

MATS = {}
def mat(name, color, rough=0.4, metal=0.0, coat=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = hexc(color)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    if emit:
        p.inputs["Emission Color"].default_value = hexc(emit)
        p.inputs["Emission Strength"].default_value = strength
    MATS[name] = m
    return m

mat("shell", "#ece8e2", rough=0.28, coat=0.7)
mat("shellIn", "#b9b4ad", rough=0.6)
mat("dark", "#25282e", rough=0.35, metal=0.35)
mat("joint", "#2c2f36", rough=0.25, metal=0.85)
mat("orange", "#ee7a24", rough=0.3, coat=0.5)
mat("core", "#ee7a24", rough=0.2, emit="#ff9a3c", strength=2.0)
mat("visor", "#08090c", rough=0.06, coat=1.0)
mat("eye", "#fff1d6", emit="#ffd39a", strength=14.0)
mat("pcb", "#0d3a3a", rough=0.55)
mat("trace", "#3dd6c6", emit="#3dd6c6", strength=3.0)
mat("chip", "#16181c", rough=0.3, metal=0.4)
mat("chipTop", "#3dd6c6", emit="#3dd6c6", strength=5.0)
mat("pin", "#d6b35a", rough=0.25, metal=1.0)
mat("copper", "#c98a4b", rough=0.28, metal=1.0)
mat("steel", "#8a9099", rough=0.22, metal=1.0)
mat("wireO", "#ee7a24", rough=0.45)
mat("wireT", "#2fbfb1", rough=0.45)
mat("wireG", "#4a4e57", rough=0.5)
mat("led", "#3dd6c6", emit="#3dd6c6", strength=6.0)
mat("ledWarm", "#ffd39a", emit="#ffb35c", strength=6.0)
mat("flame", "#ef9f27", emit="#ff9a2e", strength=10.0)
mat("flameIn", "#fde7b0", emit="#fff1c9", strength=18.0)

# ------------------------------------------------------------------ helpers
def W(sx, sy, y=0.0):
    """A point of the 2D artwork (SVG units) in the 3D world. Front is -Y."""
    return Vector(((sx - 206) * 0.01, y, (464 - sy) * 0.01))

def finish(o, m, smooth=True, parent=None):
    o.data.materials.append(MATS[m] if isinstance(m, str) else m)
    if smooth and o.type == "MESH":
        for poly in o.data.polygons:
            poly.use_smooth = True
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def sphere(loc, scale, m, parent=None, segs=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, location=loc)
    o = bpy.context.object
    o.scale = scale
    return finish(o, m, parent=parent)

def half_shell(loc, scale, m, keep_front, cut_y, thick, parent=None):
    """An ellipsoid cut in two along Y; keeps one half as a hollow panel."""
    o = sphere(loc, scale, m, segs=64)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, cut_y, 0), plane_no=(0, 1, 0), clear_outer=keep_front, clear_inner=not keep_front)
    bm.to_mesh(o.data)
    bm.free()
    for poly in o.data.polygons:
        poly.use_smooth = True
    sol = o.modifiers.new("shell", "SOLIDIFY")
    sol.thickness = thick
    sol.offset = -1
    sol.material_offset = 1
    o.data.materials.append(MATS["shellIn"])
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def cylinder(loc, r, depth, m, rot=(0, 0, 0), parent=None, verts=48, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 4
        b.limit_method = "ANGLE"
    return finish(o, m, parent=parent)

def capsule(a, b, r, m, parent=None):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    bev = o.modifiers.new("round", "BEVEL")
    bev.width = r * 0.95
    bev.segments = 8
    bev.limit_method = "ANGLE"
    return finish(o, m, parent=parent)

def box(loc, size, m, parent=None, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
    return finish(o, m, smooth=False, parent=parent)

def gear(loc, r, teeth, depth, m, axis="X", parent=None):
    """A spur gear: a disc with box teeth around it, as one object."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=r, radius2=r, depth=depth)
    tooth_w, tooth_h = 2 * math.pi * r / teeth * 0.5, r * 0.22
    for i in range(teeth):
        ang = 2 * math.pi * i / teeth
        res = bmesh.ops.create_cube(bm, size=1)
        vs = res["verts"]
        bmesh.ops.scale(bm, vec=(tooth_h, tooth_w, depth), verts=vs)
        bmesh.ops.translate(bm, vec=(r + tooth_h * 0.35, 0, 0), verts=vs)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(ang, 3, "Z"), verts=vs)
    hole = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r * 0.25, radius2=r * 0.25, depth=depth * 1.3)
    me = bpy.data.meshes.new("gear")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("gear", me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_mode = "XYZ"
    o.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return finish(o, m, smooth=False, parent=parent)

def group(name, loc):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = loc
    bpy.context.view_layer.update()  # so children parented next see its real matrix
    return e

def wire(points, r, m, parent=None):
    cu = bpy.data.curves.new("wire", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new("wire", cu)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(MATS[m])
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

# ------------------------------------------------------------------ the robot
# Each animated part is an Empty with its pieces parented to it.
# PARTS: (empty, explode offset, stagger in frames, kind) ; kind "shell" or "inner"
PARTS = []
ROT = {}  # part name -> tumble (radians) at full burst
def part(name, loc, offset, stagger, kind="shell"):
    e = group(name, loc)
    PARTS.append((e, Vector(loc), Vector(offset), stagger, kind))
    return e

HEAD_C = W(206, 154)
TORSO_C = W(206, 288)

# Head: back dome, front face with the visor, ears, antenna
head_back = part("headBack", HEAD_C, (0.25, 0.85, 0.65), 2)
ROT["headBack"] = (-0.35, 0, -0.3)
half_shell(HEAD_C, (0.86, 0.70, 0.68), "shell", keep_front=False, cut_y=-0.12, thick=0.035, parent=head_back)
head_front = part("headFront", HEAD_C, (-0.95, -0.45, 0.95), 0)
ROT["headFront"] = (0.25, 0, 0.75)
half_shell(HEAD_C, (0.86, 0.70, 0.68), "shell", keep_front=True, cut_y=-0.12, thick=0.035, parent=head_front)
sphere(W(206, 163, -0.47), (0.62, 0.25, 0.39), "visor", parent=head_front)
for ex in (183, 230):
    sphere(W(ex, 162, -0.71), (0.105, 0.035, 0.13), "eye", parent=head_front, segs=24)
for side, sx in ((-1, 124), (1, 288)):
    ear = part(f"ear{side}", W(sx, 160), (side * 0.85, 0.1, 0.1), 3)
    c = cylinder(W(sx, 160), 0.22, 0.12, "dark", rot=(0, math.pi / 2, 0), parent=ear)
    c.scale = (1.0, 1.0, 1.0)
    c.scale[0] = 1.35  # taller ellipse (local X is world Z after the rotation)
    o = cylinder(W(sx + side * 4, 160), 0.18, 0.14, "orange", rot=(0, math.pi / 2, 0), parent=ear)
    o.scale[0] = 1.4
antenna = part("antenna", W(206, 90), (0, 0, 1.45), 1)
cylinder(W(205.5, 75), 0.025, 0.34, "dark", parent=antenna)
sphere(W(205.5, 52), (0.12, 0.12, 0.12), "orange", parent=antenna, segs=32)
neck = part("neck", W(206, 225), (0, 0.2, 0.35), 4)
cylinder(W(206, 225), 0.13, 0.24, "dark", parent=neck)

# Torso: front plate with the glowing core, back shell
torso_front = part("torsoFront", TORSO_C, (1.25, -0.35, -0.95), 1)
ROT["torsoFront"] = (-0.2, 0, -0.8)
half_shell(TORSO_C, (0.56, 0.50, 0.62), "shell", keep_front=True, cut_y=-0.08, thick=0.035, parent=torso_front)
cylinder(W(206, 284, -0.49), 0.15, 0.06, "joint", rot=(math.pi / 2, 0, 0), parent=torso_front)
core = cylinder(W(206, 284, -0.525), 0.075, 0.03, "core", rot=(math.pi / 2, 0, 0), parent=torso_front)
torso_back = part("torsoBack", TORSO_C, (-0.3, 1.0, 0.0), 3)
ROT["torsoBack"] = (0, 0, 0.35)
half_shell(TORSO_C, (0.56, 0.50, 0.62), "shell", keep_front=False, cut_y=-0.08, thick=0.035, parent=torso_back)
pelvis = part("pelvis", W(206, 335), (0, 0.15, -0.45), 5)
p = cylinder(W(206, 335), 0.38, 0.22, "dark", parent=pelvis, bevel=0.06)
p.scale = (1.0, 0.8, 1.0)

# Arms: shoulder ball, upper arm, elbow, forearm, claw
for side in (-1, 1):
    sh = W(206 + side * 54, 252)
    elbow = W(206 + side * 78, 304)
    wrist = W(206 + side * 82, 340)
    shoulder = part(f"shoulder{side}", sh, (side * 0.75, 0, 0.2), 2)
    sphere(sh, (0.19, 0.19, 0.19), "joint", parent=shoulder, segs=32)
    upper = part(f"upper{side}", (sh + elbow) / 2, (side * 1.05, -0.1, 0.05), 3)
    capsule(sh + Vector((side * 0.04, 0, -0.1)), elbow, 0.13, "shell", parent=upper)
    sphere(elbow, (0.13, 0.13, 0.13), "joint", parent=upper, segs=32)
    fore = part(f"fore{side}", (elbow + wrist) / 2, (side * 1.4, -0.15, -0.25), 4)
    capsule(elbow, wrist, 0.10, "dark", parent=fore)
    claw = part(f"claw{side}", wrist, (side * 1.7, -0.25, -0.55), 5)
    sphere(wrist, (0.11, 0.11, 0.11), "joint", parent=claw, segs=32)
    for f in (-1, 1):
        capsule(wrist + Vector((0, 0, -0.04)), wrist + Vector((f * 0.08, -0.02, -0.24)), 0.035, "dark", parent=claw)

# Legs: hip ball, thigh, knee, shin, foot with orange accent and sole, and the rocket jet
JETS = []
for side in (-1, 1):
    hip = Vector((side * 0.29, 0, 1.22))
    knee = Vector((side * 0.50, -0.02, 0.70))
    ankle = Vector((side * 0.62, -0.04, 0.30))
    foot_c = Vector((side * 0.66, -0.08, 0.10))
    hipj = part(f"hip{side}", hip, (side * 0.55, 0.05, -0.15), 4)
    sphere(hip, (0.16, 0.16, 0.16), "joint", parent=hipj, segs=32)
    thigh = part(f"thigh{side}", (hip + knee) / 2, (side * 0.8, -0.05, -0.35), 5)
    capsule(hip + Vector((0, 0, -0.08)), knee, 0.18, "shell", parent=thigh)
    kneej = part(f"knee{side}", knee, (side * 1.05, -0.2, -0.45), 6)
    sphere(knee, (0.15, 0.15, 0.15), "joint", parent=kneej, segs=32)
    shin = part(f"shin{side}", (knee + ankle) / 2, (side * 1.15, -0.1, -0.75), 6)
    capsule(knee, ankle, 0.17, "shell", parent=shin)
    foot = part(f"foot{side}", foot_c, (side * 1.25, -0.15, -1.05), 7)
    sphere(foot_c + Vector((0, 0, 0.06)), (0.40, 0.50, 0.27), "shell", parent=foot)
    sphere(foot_c + Vector((side * 0.27, -0.12, 0.06)), (0.14, 0.24, 0.17), "orange", parent=foot, segs=32)
    s = cylinder(foot_c + Vector((0, 0, -0.12)), 0.40, 0.08, "dark", parent=foot, bevel=0.03)
    s.scale = (1.0, 1.2, 1.0)
    jet = group(f"jet{side}", foot_c + Vector((0, 0, -0.17)))
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.15, radius2=0.0, depth=0.75, location=foot_c + Vector((0, 0, -0.55)), rotation=(math.pi, 0, 0))
    finish(bpy.context.object, "flame", parent=jet)
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.08, radius2=0.0, depth=0.42, location=foot_c + Vector((0, 0, -0.38)), rotation=(math.pi, 0, 0))
    finish(bpy.context.object, "flameIn", parent=jet)
    JETS.append(jet)

# ---------------- internals (hidden inside the shell until it opens)
# Circuit board with the CPU, RAM and glowing traces, in the chest
board = part("board", TORSO_C + Vector((0, 0.02, 0)), (0, -0.62, 0.05), 0, "inner")
box(TORSO_C + Vector((0, 0.02, 0)), (0.66, 0.035, 0.80), "pcb", parent=board, bevel=0.01)
for i, (x, z, w, h) in enumerate([(-0.22, 0.25, 0.012, 0.22), (0.22, 0.25, 0.012, 0.22), (-0.15, -0.22, 0.24, 0.012),
                                  (0.15, -0.22, 0.24, 0.012), (0, 0.32, 0.30, 0.012), (-0.26, 0.0, 0.012, 0.36),
                                  (0.26, 0.0, 0.012, 0.36), (0, -0.3, 0.012, 0.14)]):
    box(TORSO_C + Vector((x, -0.002, z)), (w, 0.01, h), "trace", parent=board)
for x in (-0.18, 0.18):  # RAM: a nod to what HeapHop is about
    box(TORSO_C + Vector((x, -0.025, -0.08)), (0.08, 0.03, 0.30), "chip", parent=board, bevel=0.005)
    for k in range(4):
        box(TORSO_C + Vector((x, -0.042, -0.19 + k * 0.075)), (0.05, 0.006, 0.04), "pin", parent=board)
cpu = part("cpu", TORSO_C + Vector((0, -0.03, 0.08)), (0, -0.98, 0.12), 3, "inner")
box(TORSO_C + Vector((0, -0.03, 0.08)), (0.24, 0.05, 0.24), "chip", parent=cpu, bevel=0.01)
box(TORSO_C + Vector((0, -0.058, 0.08)), (0.13, 0.008, 0.13), "chipTop", parent=cpu)
for k in range(6):
    t = -0.1 + k * 0.04
    for (x, z, w, h) in ((t, 0.215, 0.012, 0.03), (t, -0.055, 0.012, 0.03), (0.135, 0.08 + t, 0.03, 0.012), (-0.135, 0.08 + t, 0.03, 0.012)):
        box(TORSO_C + Vector((x, -0.03, z)), (w, 0.02, h), "pin", parent=cpu)

# Wire harness from the board up through the neck and out to the shoulders
harness = part("harness", TORSO_C, (0, -0.28, 0.25), 2, "inner")
for m, dx, dy in (("wireO", -0.05, 0.08), ("wireT", 0.0, 0.11), ("wireG", 0.05, 0.08)):
    wire([TORSO_C + Vector((dx, dy, 0.30)), TORSO_C + Vector((dx * 1.5, dy, 0.55)), W(206 + dx * 100, 222, dy), W(206 + dx * 100, 205, dy + 0.05)], 0.022, m, parent=harness)
for side in (-1, 1):
    for m, dz in (("wireO", 0.0), ("wireT", -0.05)):
        wire([TORSO_C + Vector((side * 0.10, 0.10, 0.28 + dz)), TORSO_C + Vector((side * 0.28, 0.06, 0.40 + dz)), W(206 + side * 48, 252 + dz * 100, 0.02)], 0.02, m, parent=harness)

# Visor LED matrix behind the face
leds = part("leds", HEAD_C + Vector((0, -0.22, -0.06)), (0, -0.62, 0.0), 1, "inner")
box(HEAD_C + Vector((0, -0.2, -0.06)), (0.95, 0.03, 0.46), "pcb", parent=leds, bevel=0.01)
for i in range(9):
    for j in range(4):
        warm = j in (1, 2) and i in (2, 6)
        box(HEAD_C + Vector((-0.38 + i * 0.095, -0.225, -0.21 + j * 0.1)), (0.055, 0.02, 0.055), "ledWarm" if warm else "led", parent=leds)

# Joint motors and gears in the shoulders, hips and knees
GEARS = []
for side in (-1, 1):
    for name, loc, off, r, axis in ((f"shoulderMotor{side}", W(206 + side * 54, 252), (side * 0.45, -0.35, 0.25), 0.14, "X"),
                                    (f"hipMotor{side}", Vector((side * 0.29, 0, 1.22)), (side * 0.32, -0.45, -0.1), 0.13, "X"),
                                    (f"kneeMotor{side}", Vector((side * 0.50, -0.02, 0.70)), (side * 0.55, -0.55, -0.3), 0.085, "X")):
        g = part(name, loc, off, 4, "inner")
        cylinder(loc - Vector((side * 0.06, 0, 0)), r * 0.75, 0.16, "steel", rot=(0, math.pi / 2, 0), parent=g, bevel=0.01)
        gr = gear(loc + Vector((side * 0.06, 0, 0)), r, 12, 0.05, "copper", axis="X", parent=g)
        GEARS.append((gr, side))

# ------------------------------------------------------------------ asymmetry
import random
rng = random.Random(11)
VARIED = []
for e, home, off, st, kind in PARTS:
    if kind == "shell":
        jitter = Vector((rng.uniform(-0.55, 0.55), rng.uniform(-0.45, 0.35), rng.uniform(-0.5, 0.55)))
        new_off = off * rng.uniform(0.8, 1.3) + jitter
        tumble = Vector(ROT.get(e.name, (0, 0, 0))) + Vector([rng.uniform(-0.8, 0.8) for _ in range(3)])
        stg = st + rng.randint(0, 4)
        dur = rng.uniform(14, 24)
        drift = Vector([rng.uniform(-0.28, 0.28) for _ in range(3)])
    else:
        new_off = off + Vector((rng.uniform(-0.15, 0.15), 0, rng.uniform(-0.12, 0.12)))
        tumble = Vector((rng.uniform(-0.25, 0.25), 0, rng.uniform(-0.3, 0.3)))
        stg, dur, drift = st + rng.randint(0, 2), 16, Vector([rng.uniform(-0.08, 0.08) for _ in range(3)])
    VARIED.append((e, home, new_off, stg, kind, tumble, dur, drift))

# ------------------------------------------------------------------ speed curves
def clamp01(t): return max(0.0, min(1.0, t))
def expo_out(t): return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)
def back_out(t, s=1.4): t -= 1; return 1 + (s + 1) * t ** 3 + s * t ** 2
def cubic_in_out(t): return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
def smooth(t): t = clamp01(t); return t * t * (3 - 2 * t)

def shell_amount(f, st, dur=18):
    """0 = assembled, 1 = burst apart. Bursts with an expo ease-out and snaps back with a back ease-out."""
    if f < 12 + st: return 0.0
    if f < 86 + st: return expo_out((f - 12 - st) / dur)
    return 1 - back_out(clamp01((f - 86 - st) / 16), 1.15)

def float_amount(f, st):
    """The zero-gravity beat: each part keeps drifting its own way, then is pulled back with the snap."""
    if f < 22 + st: return 0.0
    if f < 86 + st: return cubic_in_out(clamp01((f - 22 - st) / 64))
    return max(0.0, 1 - cubic_in_out(clamp01((f - 86 - st) / 12)))

def inner_amount(f, st):
    """Internals pop out after the shell opens (overshooting a little), and go home before it closes."""
    if f < 26 + st: return 0.0
    if f < 46 + st: return back_out(clamp01((f - 26 - st) / 16), 1.8)
    if f < 78 + st: return 1.0 + 0.06 * smooth((f - 46 - st) / 32)
    return 1.06 * (1 - cubic_in_out(clamp01((f - 78 - st) / 13)))

# ------------------------------------------------------------------ camera and lights
target = Vector((0, 0, 2.15))
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
focus = bpy.data.objects.new("focus", None)
bpy.context.collection.objects.link(focus)
cam_data.dof.use_dof = True
cam_data.dof.focus_object = focus
cam_data.dof.aperture_fstop = 4.0

def expo_in_out(t):
    if t <= 0: return 0.0
    if t >= 1: return 1.0
    return 2 ** (20 * t - 10) / 2 if t < 0.5 else (2 - 2 ** (-20 * t + 10)) / 2

# Shots: frame, yaw, elevation, distance, look-at height, lens mm, roll, and the curve INTO that key.
SHOTS = [
    (1,     0,  4,  7.4, 2.15, 50,  0, None),
    (12,    6,  3,  6.9, 2.15, 52,  0, cubic_in_out),   # slow push-in, hovering hero shot
    (32,  -50, 22,  9.6, 2.25, 42, -5, expo_out),       # whip around and crane up as Byte bursts
    (58,  -64, 12,  9.2, 2.3,  42, -2, cubic_in_out),   # slow glide around the floating parts
    (80,   14,  4,  6.6, 2.4,  55,  3, cubic_in_out),   # swing to the front and push in on the CPU and LEDs
    (100,  40, 16,  9.0, 2.2,  44, -4, expo_in_out),    # whip the other way as it snaps together
    (121,   0,  4,  7.4, 2.15, 50,  0, cubic_in_out),   # settle on the opening frame: seamless loop
]

def shot_at(f):
    for (f0, *a), (f1, *b) in zip(SHOTS, SHOTS[1:]):
        if f0 <= f <= f1:
            ease = b[-1]
            t = ease((f - f0) / (f1 - f0))
            return [x + (y - x) * t for x, y in zip(a[:-1], b[:-1])]
    return list(SHOTS[0][1:-1])

def camera_at(f):
    yaw, elev, dist, tz, lens, roll = shot_at(f)
    # a little hand-held float; whole cycles per loop so it repeats seamlessly
    ph = 2 * math.pi * (f - 1) / N
    yaw += 1.2 * math.sin(3 * ph)
    elev += 0.8 * math.sin(5 * ph + 1)
    y, e = math.radians(yaw), math.radians(elev)
    look = Vector((0, 0, tz))
    pos = look + Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))) * dist
    return pos, look, lens, math.radians(roll)

def light(name, kind, loc, energy, color, size=2.0):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = hexc(color)[:3]
    if kind == "AREA":
        d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = (target - Vector(loc)).to_track_quat("-Z", "Y")
    return o

light("key", "AREA", (-4.5, -6, 6.5), 1400, "#fff4e6", 4)
light("fill", "AREA", (5, -5, 2.5), 450, "#dfe9f5", 5)
light("rim", "AREA", (3.5, 6, 4.5), 1300, "#3dd6c6", 3)
light("rim2", "AREA", (-4, 5, 1.5), 500, "#ff9a3c", 3)

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = hexc("#16212d")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7


# ------------------------------------------------------------------ keyframes
for f in range(1, N + 2):
    for e, home, off, st, kind, tumble, dur, drift in VARIED:
        a = shell_amount(f, st, dur) if kind == "shell" else inner_amount(f, st)
        fl = float_amount(f, st)
        e.location = home + off * a + drift * fl
        e.keyframe_insert("location", frame=f)
        spin = a + 0.6 * fl  # parts keep turning slowly while they float
        e.rotation_euler = tuple(r * spin for r in tumble)
        e.keyframe_insert("rotation_euler", frame=f)
    for g, side in GEARS:
        spin = 2 * math.pi * 2 * (f - 1) / N * side  # two whole turns per loop: seamless
        g.rotation_euler = (spin, math.pi / 2, 0)
        g.keyframe_insert("rotation_euler", frame=f)
    burst = shell_amount(f, 9)
    for j, jet in enumerate(JETS):
        on = 1 - smooth(burst * 4)
        flick = 1 + 0.12 * math.sin(2 * math.pi * 15 * (f - 1) / N + j)
        jet.scale = (max(on, 0.001), max(on, 0.001), max(on * flick, 0.001))
        jet.keyframe_insert("scale", frame=f)
    # the core flashes as the chest closes
    flash = math.exp(-((f - 108) / 4.0) ** 2)
    MATS["core"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 2.0 + 18.0 * flash
    MATS["core"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].keyframe_insert("default_value", frame=f)
    pos, look, lens, roll = camera_at(f)
    cam.location = pos
    cam.keyframe_insert("location", frame=f)
    cam.rotation_mode = "QUATERNION"
    q = (look - pos).to_track_quat("-Z", "Y")
    q.rotate(__import__("mathutils").Quaternion((look - pos).normalized(), roll))
    cam.rotation_quaternion = q
    cam.keyframe_insert("rotation_quaternion", frame=f)
    cam_data.lens = lens
    cam_data.keyframe_insert("lens", frame=f)
    focus.location = look + (pos - look).normalized() * 0.4
    focus.keyframe_insert("location", frame=f)

for o in list(bpy.data.objects) + [cam_data]:
    if o.animation_data and o.animation_data.action:
        for fc in getattr(o.animation_data.action, "fcurves", []):
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"

# ------------------------------------------------------------------ render
r = scene.render
r.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.use_denoising = True
r.film_transparent = True
r.use_motion_blur = True
r.motion_blur_shutter = 0.45
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGBA"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass

if MODE == "preview":
    r.resolution_x = r.resolution_y = 520
    scene.cycles.samples = 12
    for f in [int(x) for x in (ARGS or ["1", "30", "56", "96"])]:
        scene.frame_set(f)
        r.filepath = os.path.join(OUT, "preview", f"f{f:03d}.png")
        bpy.ops.render.render(write_still=True)
elif MODE == "frames":
    a, b = int(ARGS[0]), int(ARGS[1])
    r.resolution_x = r.resolution_y = int(ARGS[3]) if len(ARGS) > 3 else 900
    scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 24
    out = "frames" if r.resolution_x >= 900 else "frames_low"
    for f in range(a, b + 1):
        scene.frame_set(f)
        r.filepath = os.path.join(OUT, out, f"f{f:03d}.png")
        bpy.ops.render.render(write_still=True)
elif MODE == "pose":
    # Byte assembled (frame 1), right arm raised to point up and to the viewer's left at the
    # Learn heading, head turned a little the same way, seen from slightly to his left.
    from mathutils import Matrix, Euler
    scene.frame_set(1)
    r.use_motion_blur = False
    byname = {e.name: (e, home) for e, home, *_ in PARTS}
    def turn(names, pivot, R):
        for n in names:
            e, home = byname[n]
            e.animation_data_clear()
            e.location = pivot + R @ (Vector(home) - pivot)
            e.rotation_euler = R.to_euler()
    shoulder = W(206 - 54, 252)
    raise_arm = Matrix.Rotation(math.radians(float(os.environ.get("ARM_UP", "105"))), 3, "Y") @ Matrix.Rotation(math.radians(float(os.environ.get("ARM_FWD", "-35"))), 3, "X")
    turn(["shoulder-1", "upper-1"], shoulder, raise_arm)
    # the forearm and claw follow the upper arm, then bend at the (moved) elbow
    elbow = shoulder + raise_arm @ (W(206 - 78, 304) - shoulder)
    B = Matrix.Rotation(math.radians(float(os.environ.get("ARM_BEND", "8"))), 3, "Y")
    for n in ("fore-1", "claw-1"):
        e, home = byname[n]
        e.animation_data_clear()
        moved = shoulder + raise_arm @ (Vector(home) - shoulder)
        e.location = elbow + B @ (moved - elbow)
        e.rotation_euler = (B @ raise_arm).to_euler()
    head_turn = Matrix.Rotation(math.radians(-14), 3, "Z") @ Matrix.Rotation(math.radians(6), 3, "Y")
    turn([n for n in byname if n.startswith(("head", "ear", "antenna", "visor", "eyes", "leds"))], W(206, 225), head_turn)
    for e in JETS:
        e.animation_data_clear()
        e.scale = (0.001, 0.001, 0.001)
    cam.animation_data_clear()
    cam_data.animation_data_clear()
    pos, look, lens, roll = camera_at(1)
    yaw, elev, dist, tz = math.radians(16), math.radians(6), 7.6, 2.05
    look = Vector((0.15, 0, tz))
    cam.location = look + Vector((math.sin(yaw) * math.cos(elev), -math.cos(yaw) * math.cos(elev), math.sin(elev))) * dist
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (look - cam.location).to_track_quat("-Z", "Y")
    cam_data.lens = 50
    focus.animation_data_clear()
    focus.location = look
    r.resolution_x = r.resolution_y = int(ARGS[1]) if len(ARGS) > 1 else 900
    scene.cycles.samples = int(ARGS[0]) if ARGS else 48
    r.filepath = os.path.join(OUT, f"pose-{r.resolution_x}.png")
    bpy.ops.render.render(write_still=True)
elif MODE == "save":
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(OUT, "byte.blend")))
