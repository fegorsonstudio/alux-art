"""
Alux Micro Drama — helpers that run INSIDE the Unreal Editor (Python Editor
Script Plugin), called by Claude through Epic's Unreal MCP or from the editor's
Python console:

    import alux_drama as ad
    shots = ad.load_shotlist(r"C:\\AluxStudio\\shotlists\\the-silent-partner-ep1.json")
    cam = ad.camera_for(shots["shots"][3], location=(0, -300, 160), rotation=(0, -5, 90))
    ad.shoot(cam, shots, shots["shots"][3])     # -> C:\\AluxStudio\\renders\\the-silent-partner\\ep1\\04.png

Claude stages each set, actor and light interactively through the MCP tools;
these helpers only do the parts that must be exact every time: the 4:5
filmback, the lens for the framing, and a still saved at the shot list's size
with the right file name. Written 2026-10-20 against the Unreal 5.x Python API
and NOT yet run — the first session on the studio machine checks each function
(see tools/unreal/README.md).
"""
import json
import os

import unreal

RENDERS = r"C:\AluxStudio\renders"
# A 4:5 sensor, so what the camera sees is exactly the Instagram frame.
SENSOR_W_MM, SENSOR_H_MM = 24.0, 30.0
LENS_MM = {"close": 85.0, "medium": 50.0, "wide": 24.0}
APERTURE = {"close": 1.8, "medium": 2.8, "wide": 5.6}


def load_shotlist(path):
    """The brief made by tools/drama/shotlist.mjs."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def camera_for(shot, location=(0.0, 0.0, 160.0), rotation=(0.0, 0.0, 0.0), focus_cm=None):
    """A CineCameraActor with a 4:5 filmback and the lens for the shot's framing."""
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    cam = actors.spawn_actor_from_class(
        unreal.CineCameraActor,
        unreal.Vector(*location),
        unreal.Rotator(roll=rotation[0], pitch=rotation[1], yaw=rotation[2]),
    )
    cam.set_actor_label("AluxShot_%02d" % shot["slide"])
    comp = cam.get_cine_camera_component()
    filmback = comp.filmback
    filmback.sensor_width = SENSOR_W_MM
    filmback.sensor_height = SENSOR_H_MM
    comp.filmback = filmback
    framing = shot.get("framing", "medium")
    comp.current_focal_length = LENS_MM.get(framing, 50.0)
    comp.current_aperture = APERTURE.get(framing, 2.8)
    if focus_cm:
        settings = comp.focus_settings
        settings.focus_method = unreal.CameraFocusMethod.MANUAL
        settings.manual_focus_distance = float(focus_cm)
        comp.focus_settings = settings
    return cam


def out_path(shotlist, shot):
    """C:\\AluxStudio\\renders\\<story>\\ep<n>\\NN.png — what scripts/drama-attach-art.mjs expects."""
    folder = os.path.join(RENDERS, shotlist["story"]["slug"], "ep%d" % shotlist["episode"]["n"])
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, shot["file"])


def shoot(camera, shotlist, shot):
    """Save one still from `camera` at the shot list's size (2160x2700). Returns the file path."""
    width = int(shotlist["render"]["width"])
    height = int(shotlist["render"]["height"])
    path = out_path(shotlist, shot)
    unreal.AutomationLibrary.take_high_res_screenshot(width, height, path, camera)
    unreal.log("Alux: queued %s (%dx%d)" % (path, width, height))
    return path


def summary(shotlist):
    """One line per shot, for a quick read in the Output Log."""
    for s in shotlist["shots"]:
        unreal.log("%02d %-6s %-6s words %-6s  %s" % (s["slide"], s["kind"], s["framing"], s["captionAt"], ", ".join(s["characters"]) or "-"))
