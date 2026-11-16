# DynaDio Slicer: Rebuild Brief for a New AI Agent

Nov 13, 2026 · @Mehtab Khan

## 1. Read this first

**The goal:** a desktop slicer called DynaDio Slicer that turns an STL model into G-code for an air-pump gel printer, with a professional, realistic interface comparable to Bambu Studio, Anycubic Slicer Next and Creality Print. This brief lets a new AI agent build it from nothing, in an order where every step is proven before the next starts.

**Why the last attempt failed, and what changes:**

| What went wrong | What this brief does instead |
| --- | --- |
| One huge specification and 40 prompts, but no working code behind them | The slicer is built first as a plain Python library with automated tests. The UI comes only after the numbers are proven. |
| UI code was never run before it was handed over | Every UI milestone ends with screenshots the agent must take itself and show you |
| "Done" was the agent's own claim | Every milestone has a pass or fail gate that you can run in under five minutes (section 10) |
| The algorithm lived only in a chat answer | The reference script and its output files are the ground truth, and tests compare against them (section 8) |
| Slicing logic and UI were mixed | The core library never imports any UI code, so a UI bug can never change G-code |

**Ground rules for the agent (paste them into every session):**

1. Do only the milestone you are given. Do not start the next one.
2. Write tests first for anything in the core. A feature without a test does not exist.
3. Run everything you write. Report the exact command and its real output. If you could not run something, say so.
4. Never change slicing behaviour silently. The reference output in section 8 must still match.
5. Every setting is defined once, in one table (section 7). The UI, the profile file, the command line and the tests all read that table.
6. No colour, size or setting default is typed into more than one place.
7. When a requirement is unclear, stop and ask. Do not guess.
8. At the end of every milestone, list what is **not** working. Do not hide gaps.

**My assumptions (please correct any that are wrong, see section 12):**

- Units are millimetres, and the machine understands GRBL-style G-code with `M3 S`, `M5` and `G4 P` (seconds).
- The algorithm is the one in `airpump_slicer.py`, kept exactly in version 1 and extended later.
- The two print methods you described, pump start and stop per layer and continuous spiral, are both supported. I could only read this chat, so I based them on what the reference script already does. Section 5 explains how, and asks you to confirm.
- The interface is a **local web application** (TypeScript, React, three.js) wrapped as a desktop app, talking to the Python core. I recommend this over PySide6 because an AI agent can drive a browser, take screenshots and test it itself, and realistic 3D lighting is far easier in three.js. If you prefer Qt, the core and the tests stay the same.

## 2. Product scope

**Version 1 turns one STL file into one G-code file that prints well on the DynaDio air-pump printer, and lets the user see and adjust the result before exporting.**

| In version 1 | Not in version 1 |
| --- | --- |
| Open an STL (binary or ASCII), report size and whether it is closed | Automatic mesh repair (version 1 only reports problems) |
| Resize to a real size in mm, rotate, lay flat, choose the up axis and tilt | Supports and multi-material printing |
| Slice with two methods: Spiral or Pump start/stop layer by layer (section 5) | Sending G-code to the machine over a network or USB |
| Settings, profiles for machine, needle and process, saved as JSON | Cloud accounts, plug-ins, languages other than English |
| 3D preview with a layer slider, a stroke slider, and playback of the needle and pump | Non-planar or curved-layer slicing |
| Quality warnings, estimated time and gel volume | Slicing models with several separate parts as one job |
| Export G-code for the GRBL dialect, with editable start and end code | Marlin and other dialects (planned for version 2) |

**Users.** The first user is you and your team, who know the machine well. The second is an operator who only opens a file and presses Slice. The interface must serve both: a Simple mode with few settings, and an Advanced mode with all of them.

**Success looks like:**

- A model that printed well with the reference script prints the same, or better, from the new app.
- Opening a file to exporting G-code takes under one minute and five clicks.
- The app never freezes, and every error says what happened and what to do.
- The screenshots look like a real slicer: a lit model on a real bed, with gel beads in the preview.

## 3. Machine and process model

**The printer lays a bead of gel by pushing air through a needle, and the G-code controls the air with the spindle commands.** Moving the needle and switching the pump are separate, so the slicer must decide where the pump is on, how hard, and when it stops.

| G-code | Meaning on this machine |
| --- | --- |
| `G21`, `G90`, `G94` | Millimetres, absolute positions, feed in mm per minute |
| `G1 X Y Z F` | Move. Pump on or off depends on the last pump command. |
| `M3 S1000` | Pump on at full value: the **kick** at the first step of a stroke, to start the flow quickly |
| `M3 S350` | Pump on at the normal **draw** value |
| `M5` | Pump off |
| `G4 P0.05` | Wait 0.05 s. Air stored in the nozzle keeps pushing gel after `M5`, so the machine waits before it moves away. GRBL reads `P` in seconds. |
| `M2` | End of program |

**What a stroke looks like in the output (real lines from the reference script; the notes after ; are mine, the script writes none):**

```
G1 X-2.209 Y-0.635 Z0.590     ; travel to the start, pump off
M3 S1000                      ; kick: pump on at full value
G1 X-2.147 Y-0.651 Z0.594     ; first drawing step
M3 S350                       ; drop to the draw value
G1 X-2.082 Y-0.654 Z0.598     ; ...many more steps...
M5                            ; pump off
G4 P0.05                      ; wait for the stored air
```

**Values from the reference script, which become the defaults:** feed 500 mm per minute, kick S1000, draw S350, dwell 0.05 s, layer distance 0.13 mm, lowest point at Z 0.3 mm, first cut 0.03 mm above the lowest point, maximum distance between G-code points 0.065 mm. The file always starts with `G21 G90 G94 M5` and `G1 F500`, and ends with `M5` and `M2`.

**Values I read from your screenshots of the app (please confirm):** needle 21G with 0.514 mm inner diameter, bead width 0.65 mm, work area about 18.8 × 15.7 mm with an 11 mm height limit. These belong in the Machine and Needle profiles, not in the code.

**Why the shapes are soft:** sharp corners trap air bubbles in the gel, so every outline is rounded before drawing. This is the reason for the smoothing step in section 4 and it must not be removed.

## 4. The slicing algorithm, exactly

**The slicer cuts the model into horizontal outlines, links outlines that continue upward into one rising spiral, and writes the pump and motion commands.** Everything below is read from `airpump_slicer.py` (376 lines, only numpy and scipy). The new agent must reproduce these numbers before changing anything.

&#91;embedded content: slicer pipeline · 8 stages\]

Stage 5 decides how each part is printed: outlines that link upward become spirals, and the rest become flat strokes.

### 4.1 Load the STL

A file is binary STL when `84 + 50 × triangle_count` equals the file size exactly. Otherwise it is read as ASCII by finding every `vertex x y z` triple. Anything else stops with the error "could not read STL". The result is an array of triangles, shape N × 3 × 3.

### 4.2 Orient and scale

- **Up axis.** The chosen model axis becomes print Z by a cyclic swap of axes: `x` uses order (1, 2, 0), `y` uses (2, 0, 1), `z` is unchanged. A cyclic swap never mirrors the model.
- **Scale.** One uniform scale `S = length / extent along the new Z`, so the model is never stretched. Default length is 9.7 mm.
- **Tilt.** Optionally lean the body about the X axis by `tilt` degrees (negative if flipped). The layers stay horizontal, so this is a true re-slice of the tilted model, not a rotated toolpath.
- **Position.** Centre X and Y on the bounding box and move the lowest point to Z 0.

### 4.3 Slice with horizontal planes

- Weld vertices by rounding to 6 decimals.
- Cut planes are at `z = first_plane + k × pitch` for `k = 0 … n-1`, where `n = floor((height − first_plane) / pitch) + 1`. The G-code Z for layer k is `z0 + first_plane + k × pitch`.
- For a plane at height h, every vertex gets a signed distance `z − h`. A distance smaller than 1e-9 is set to 1e-9, so no vertex sits exactly on the plane.
- A triangle is cut when one or two of its vertices are below the plane. The crossing point on each edge is computed from the edge's vertices in canonical order (lower index first), so two triangles that share an edge produce bit-identical points.
- Segments are joined by walking from edge to edge through shared edge keys until the loop closes. Loops with fewer than 3 points are dropped.

### 4.4 Clean every outline

1. Make the loop counter-clockwise (the sign of the shoelace area).
2. Drop it if its perimeter is under 0.2 mm.
3. Resample to equal spacing 0.015 mm, with at least 16 points.
4. Round every corner with a Gaussian filter of sigma 5 samples (kernel radius 15 samples, wrapping around the loop).
5. Drop it if the new perimeter is under 0.5 mm or its thickness is under 0.05 mm. Thickness is `2 × area / perimeter`, which removes specks and slivers too small to draw as a bead.

```latex
t = \frac{2A}{P}
```

### 4.5 Link outlines between layers

For each pair of neighbouring layers, build a cost table between every outline A in the lower layer and every outline B in the upper layer.

- If the perimeter ratio `P_B / P_A` is outside 0.65 to 1.5, the cost is 1,000,000, so the pair can never link.
- Otherwise the cost is the symmetric mean nearest-point distance, using every 6th point of each outline.
- Solve the one-to-one best pairing with the Hungarian method (`scipy.optimize.linear_sum_assignment`).
- A pair is linked only if its cost is below the **link limit** `0.22 mm + pitch × tan(tilt)`, with the tilt capped at 85 degrees.
- Outlines with no outlines linked below them are the **heads** of chains. Following links upward from each head gives one chain.

### 4.6 Turn a chain into one curve

A chain with more than one outline becomes a single rising spiral, so the pump never stops between layers.

- Start the next outline at the point nearest to where the current one starts.
- Resample both outlines to the same number of points by arc length. Blend them while Z rises:

```latex
p(f) = (1-f)\,a(f) + f\,b(f), \qquad z(f) = z_k + (z_{k+1} - z_k)\,f, \qquad f \in [0,1]
```

- The last outline of a chain is drawn once, flat, at its own Z, and closed.
- Remove repeated points, then resample the whole curve at equal arc length with `step = min(step, max(0.02, length / 24))` and at least 6 steps. A tiny stroke still gets about 24 points.
- A chain of one outline is a **flat** stroke: a closed loop at constant Z.

### 4.7 Order the strokes

- The longest stroke (most points) is the main spiral and always runs upward.
- The other strokes are sorted by their first layer, bottom to top.
- Each later stroke is reversed if that makes its start nearer to the needle's current position. The first stroke is reversed only if it runs downward.

This keeps the needle from travelling back down through gel that is already placed.

### 4.8 Write the G-code

For each stroke: move to the first point with the pump off, `M3 S1000` (kick), move one step, `M3 S350` (draw), the remaining steps, then `M5` and `G4 P0.05`. The file header, comments and footer are in section 3.

### 4.9 Known weaknesses, to fix after version 1 is proven

| Weakness | Planned fix |
| --- | --- |
| Size is set only from the up-axis length | Size from any axis, or from a target bounding box |
| The link limit is a fixed distance | Adaptive link limit from the local gap between layers |
| Splits and merges break a chain | Branch handling: continue the longest branch, start a new stroke for the other |
| Smoothing shrinks thin features slightly | Offset the loop by half the bead width and compensate shrinkage |
| The pump values are constant | Flow model: volume = bead width × layer height × length |
| Roofs and floors are not filled | Detect and fill the first and last layer of each solid region |
| Travel between strokes is naive | Route travel moves clear of finished gel |
| No mesh repair or printability check | Report open edges and unprintable features before slicing |

## 5. The two print methods

**The slicer prints in one of two ways: layer by layer with the pump starting and stopping, or as a continuous spiral.** I could not read your earlier chats, so this section is my reading of the reference script. Please check it against what you know (section 12).

|  | Pump start/stop (layer by layer) | Spiral (continuous) |
| --- | --- | --- |
| Idea | Each outline in each layer is its own closed stroke at one fixed Z | Outlines that continue upward are blended into one rising curve |
| Pump | Kick, draw, `M5`, dwell for **every** outline | One kick, one draw, one stop for the whole chain |
| Stage 5 (link layers) | Skipped. Every outline is a chain of one. | Used |
| Strokes on the cube test (75 layers) | **75** | **1** |
| Strokes on the jet test (75 layers) | **87** | **11** |
| Where it suits | Models that change shape quickly between layers, and as a safe fallback | Smooth bodies that grow steadily upward |
| Expected risk (my reasoning, not tested on the machine) | Many pump starts, so more drips and a visible seam at every layer | A wrong link joins unrelated outlines, and shrinkage across the blend |

The strokes counts are real: I ran the reference script on both test models with and without linking. Switching linking off (link limit 0) gives the layer-by-layer method with no other change.

**How the reference script behaves today.** It is the spiral method with a built-in fallback: where an outline has no partner in the next layer it prints that outline flat, with its own pump start and stop. So the jet test gives 4 spirals and 7 flat strokes. It cannot currently be told to print everything layer by layer except by setting the link limit to 0.

**What the new slicer does:**

1. A setting `print_method` with two values, `spiral` (default) and `layered`.
2. `layered` skips stage 5 and treats every cleaned outline as its own chain. Stages 6 to 8 are unchanged.
3. In `layered` mode the starting point of each loop may be moved to the point nearest the needle to shorten travel. This is off by default so the output matches the script.
4. The Strokes table, the pump timeline and the time and gel estimates show both methods in the same way, because both produce the same kind of stroke list.
5. The Quality advisor warns in `spiral` mode when many flat strokes appear (each one costs a pump start and stop), and offers to switch.

**Tests that prove it:** on the cube, `layered` must give exactly 75 strokes and `spiral` exactly 1; on the jet, 87 and 11. Section 8 lists them all.

## 6. Architecture and project layout

**The slicer is a Python library that knows nothing about the interface; the interface only asks it questions.** This is the single most important rule for avoiding another failure: a bug in the screen can never change the G-code, and the slicer can be tested from the command line with no screen at all.

&#91;embedded content: architecture · 5 parts\]

All arrows point toward the core. The command line and the tests reach the same core the interface does, so a result can always be reproduced without the app.

### 6.1 Parts

| Part | Technology | Job | Never does |
| --- | --- | --- | --- |
| Core library `dynadio_core` | Python 3.11+, numpy, scipy | Everything in section 4, settings, profiles, G-code writer, quality checks, simulation | Import any UI or web code |
| Command line `dynadio` | Python, argparse | `dynadio slice model.stl out.gcode --profile x.json` and `dynadio check`, so every result can be reproduced without the app | Contain slicing logic of its own |
| Local API `dynadio_api` | Python, FastAPI | Runs the core in a worker process, streams progress, returns results | Contain slicing logic of its own |
| Interface `ui/` | TypeScript, React, three.js, Vite | Everything the user sees (section 9) | Calculate toolpaths |
| Tests `tests/` | pytest, Playwright | Prove every milestone (section 8) | Depend on the interface for core tests |
| Desktop shell | Tauri or Electron, added last | Window, file dialogs, starts the local API | Change behaviour |

### 6.2 Folder layout

```
dynadio/
  core/
    dynadio_core/
      stl.py          # stage 1: load STL
      orient.py       # stage 2: axis swap, scale, tilt
      slicer.py       # stage 3: planes and loops
      clean.py        # stage 4: resample and smooth
      link.py         # stage 5: layer linking (spiral method)
      curves.py       # stage 6: chain to curve
      order.py        # stage 7: stroke order
      gcode.py        # stage 8: writer, dialect, templates
      settings.py     # section 7: the one table of settings
      profiles.py     # load, save, validate JSON profiles
      quality.py      # warnings and printability checks
      simulate.py     # time, gel volume, pump events from G-code
      pipeline.py     # slice_model(): runs stages 1 to 8
    tests/            # section 8
    pyproject.toml
  cli/                # dynadio command
  api/                # FastAPI app
  ui/                 # React and three.js
  reference/          # airpump_slicer.py and its golden outputs (read only)
  docs/               # this brief and the design specification
```

### 6.3 The one function everything calls

```python
# core/dynadio_core/pipeline.py (the contract; the agent writes the body)
def slice_model(stl_path: str, settings: Settings,
                on_progress=None, should_cancel=None) -> SliceResult: ...

# SliceResult holds: strokes (list of N x 3 float arrays, in print order),
# kind per stroke ("spiral" or "flat"), layer range per stroke, gcode (str),
# stats (layers, strokes, points, length mm, time s, gel mL), warnings (list).
```

`on_progress(stage, done, total)` is called at least once per layer. `should_cancel()` is checked between layers. Both are optional so the command line and tests can ignore them.

### 6.4 How the interface talks to the core

- The interface sends the model and the settings to the local API. The API starts a job and streams progress events (stage, percent, layer, time left) to the interface.
- When the job finishes, the strokes go to the interface as binary float arrays, not as JSON text, so large models stay fast.
- Cancel stops the job within one layer and keeps the previous result.
- The G-code is generated by the core and shown and saved exactly as received. The interface never edits it.

## 7. Settings and profiles

**Every setting is defined once, in `settings.py`, as a row with a key, a label, a unit, a default, an allowed range and a group.** The command line, the profile files, the interface, the validation and the tests are all generated from that one table, so a setting can never exist in one place and be missing in another.

### 7.1 The settings table

Defaults come from `airpump_slicer.py`. Ranges are my proposal: the agent must enforce them and you can change them.

| Key | Label | Unit | Default | Range | Group | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `length` | Size along the up axis | mm | 9.7 | 0.5 to 200 | Model | Simple |
| `up_axis` | Up axis | x, y or z | z | x, y, z | Model | Simple |
| `tilt` | Tilt | degrees | 0 | 0 to 85 | Model | Advanced |
| `flip` | Lean the other way | on or off | off |  | Model | Advanced |
| `pitch` | Layer distance | mm | 0.13 | 0.03 to 0.5 | Layers | Simple |
| `z0` | Z of the lowest point | mm | 0.3 | 0 to 5 | Layers | Advanced |
| `first_plane` | First cut above the lowest point | mm | 0.03 | 0.005 to pitch | Layers | Advanced |
| `print_method` | Print method | spiral or layered | spiral |  | Method | Simple |
| `link` | Link limit | mm | 0.22 | 0 to 1 | Method | Advanced |
| `feed` | Feed | mm per minute | 500 | 50 to 3000 | Motion | Simple |
| `kick` | Pump kick | S value | 1000 | 0 to 1000 | Pump | Simple |
| `draw` | Pump draw | S value | 350 | 0 to 1000 | Pump | Simple |
| `dwell` | Dwell after stop | seconds | 0.05 | 0 to 2 | Pump | Simple |
| `step` | Distance between points | mm | 0.065 | 0.02 to 0.3 | Path | Advanced |
| `resample` | Outline resample spacing | mm | 0.015 | 0.005 to 0.1 | Path | Advanced |
| `corner_softness` | Corner softness | mm | 0.075 | 0 to 0.5 | Path | Simple |
| `min_perimeter` | Smallest outline kept | mm | 0.2 | 0 to 5 | Path | Advanced |
| `min_perimeter_after` | Smallest outline kept after smoothing | mm | 0.5 | 0 to 5 | Path | Advanced |
| `min_thickness` | Thinnest feature drawn | mm | 0.05 | 0 to 1 | Path | Advanced |

**Corner softness is shown in millimetres, not in samples.** The script's "sigma 5" means 5 resample steps, which is 5 × 0.015 = 0.075 mm. The setting is stored as `corner_softness = sigma × resample` and converted back to sigma by the slicer, so changing the resample spacing does not silently change how round the corners are.

**One difference to resolve.** The second version of your app showed resample 0.010, corner radius 0.070 and step 0.070. The script uses 0.015, 0.075 (sigma 5) and 0.065. The new app uses the script's values as defaults because the reference output depends on them. Tell me if your app's values are the ones you want.

### 7.2 Machine and needle profiles

These belong to the printer and the needle, not to each job. A job may choose one of each.

| Key | Label | Unit | Default | Mode |
| --- | --- | --- | --- | --- |
| `bed_x`, `bed_y` | Work area | mm | 18.84, 15.67 (from your screenshots, to confirm) | Machine |
| `max_z` | Height limit | mm | 11 (from your screenshots, to confirm) | Machine |
| `dialect` | G-code dialect | grbl | grbl | Machine |
| `start_gcode`, `end_gcode` | Start and end code | text | the lines in section 3 | Machine |
| `needle_gauge`, `needle_id` | Needle | gauge, mm | 21G, 0.514 | Needle |
| `bead_width` | Measured bead width | mm | 0.65 (from your screenshots, to confirm) | Needle |

### 7.3 Profile files

Profiles are plain JSON with a version number, so old files keep opening. The same file works with the interface and with `dynadio slice --profile`.

```json
{
  "schema": 1,
  "kind": "process",
  "name": "Jet 9.7 mm, spiral",
  "values": {
    "length": 9.7, "up_axis": "x", "pitch": 0.13,
    "print_method": "spiral", "feed": 500,
    "kick": 1000, "draw": 350, "dwell": 0.05,
    "step": 0.065, "resample": 0.015, "corner_softness": 0.075,
    "link": 0.22
  }
}
```

Rules: unknown keys are kept and reported, missing keys take the default, and an out-of-range value is an error that names the key and the allowed range. A value changed from the profile is shown in the interface with a small dot and a reset arrow.

## 8. Testing and ground truth

**The new slicer is correct when it reproduces the reference script's results on four test models, and every stage passes its own test.** The agent receives the reference files in a read-only `reference/` folder and may never edit them.

### 8.1 Reference files

| File | What it is |
| --- | --- |
| `airpump_slicer.py` | The script from your earlier chat, unchanged |
| `f22.stl` | The jet model, the real use case |
| `ref.gcode` | The G-code your earlier chat produced for the jet. It is the physical target. |
| `out_default.gcode` | What the script produces today for the jet with default settings (`--up-axis x`) |
| `cube.stl`, `sphere.stl`, `torus.stl`, `mk.py` | Simple shapes, and the script that makes them. The sphere is open at the poles on purpose. |

### 8.2 Golden results from the script

I ran the script on each model. These numbers must match exactly (`--length 9.7`, defaults otherwise).

| Model | Up axis | Layers | Strokes | Spirals | Flat | Points |
| --- | --- | --- | --- | --- | --- | --- |
| `f22.stl` | x | 75 | 11 | 4 | 7 | 7,754 |
| `cube.stl` | z | 75 | 1 | 1 | 0 | 44,547 |
| `sphere.stl` | z | 75 | 11 | 1 | 10 | 27,610 |
| `torus.stl` | z | 75 | 22 | 2 | 20 | 212,023 |

For the jet, the G-code must match `out_default.gcode` line for line on every line that does not start with `;`. The whole file's MD5 is `9e60ab040ea5956f98df0e24abf7f4fa`, and running the new slicer twice must give identical bytes. Jet extents: X −3.41 to 3.36, Y −1.10 to 1.06, Z 0.59 to 9.69, scale 0.05108, longest step 0.066 mm, longest travel 3.94 mm.

### 8.3 Where the script and your original result differ

I compared `ref.gcode` with the script's output. They are close but **not identical**, and the agent must not hide this:

- X and Y differ by at most 0.003 mm.
- Every Z in the script is **0.03 mm higher** than in `ref.gcode`. The script writes `z0 + first_plane + k × pitch`. The original result wrote `z0 + k × pitch`. The script's way is geometrically consistent, because the first cut really is 0.03 mm above the lowest point.
- `ref.gcode` has 12 strokes. The last two are a spiral over layers 18 to 72 and a flat stroke at layer 73. The script has 11, with one spiral over layers 18 to 73. The first 10 strokes have the same layer ranges.

Version 1 follows the script, so the golden tests above hold. A test named `test_reference_close` checks the original result with a tolerance: 0.005 mm in X and Y, a known 0.03 mm in Z, and the first 10 strokes equal in structure. **You must decide which Z is right for your machine (section 12).**

### 8.4 Tests for every stage

| Stage | Test |
| --- | --- |
| 1 Load | A binary and an ASCII copy of the cube give identical triangles. A broken file gives the error "could not read STL". |
| 2 Orient | Axis swaps keep the sign of the determinant, so nothing is mirrored. The scale is uniform. The lowest point is at 0 and XY is centred. |
| 3 Slice | A cube cut at half height gives one closed square with the cube's side length. A sphere of radius 1 scaled to 9.7 mm gives circles with the right radius at the middle. |
| 4 Clean | Every loop is counter-clockwise. Resample spacing is within 1% of 0.015 mm. Specks and slivers are removed. |
| 5 Link | The torus never links its two rings together. The cube links all 75 layers into one chain. |
| 6 Curves | Distance between points never exceeds the step plus 0.001 mm. Z never decreases along a stroke. |
| 7 Order | Strokes are ordered by first layer. The longest stroke runs upward. |
| 8 G-code | Every stroke follows: travel, `M3 S1000`, one step, `M3 S350`, steps, `M5`, `G4`. The pump is never on during travel. The file starts and ends as in section 3. |
| Methods | `layered` gives 75 strokes on the cube and 87 on the jet. `spiral` gives 1 and 11. |
| Settings | Every row of section 7 loads, saves and rejects an out-of-range value with a clear message. |
| Speed | The jet slices in under 3 seconds and the torus in under 10 on a normal laptop. The script takes 0.8 and 3.3 seconds on my machine. |

### 8.5 What the agent must show at every milestone

1. The exact test command and its real, complete output.
2. The golden comparison result.
3. For interface milestones, screenshots taken by the agent itself (Playwright), in light and dark themes.
4. A list of what is not working yet.

A milestone with no such evidence is not finished, however good the explanation sounds.

## 9. UI and UX specification

**The interface must look like a real slicer: a bright, branded window around a lit 3D model on a real bed, and in the preview the gel itself drawn as beads.** This is a condensed version of the earlier UI/UX specification, rebuilt for a web interface, and it is complete enough to build from.

### 9.1 Principles

1. **One obvious next step.** The yellow button always moves the job forward: Slice, then Export. Nothing else on screen is yellow.
2. **The model is the star.** The 3D view takes at least 55% of the window width.
3. **Simple first.** A Simple mode shows about eight settings. Advanced shows all of them.
4. **Never block, never mystify.** Long work shows progress and a Cancel button. Errors say what happened and what to do.
5. **Consistent.** Every colour, size and radius comes from the tokens below.

### 9.2 Layout

| Region | Size | Contents |
| --- | --- | --- |
| Top bar | 52 px | Logo mark, Open, Save, the **Prepare / Preview** switch in the centre, undo, redo, theme, settings |
| Left panel | 300 px (260 to 380) | Model card (name, size, triangles, repair status), then move, rotate, scale, lay flat, auto-orient |
| 3D view | the rest | Model, bed, view cube (top right), layer slider (left edge), stroke slider and playback (bottom), legend, scale bar |
| Right panel | 360 px (320 to 460) | Machine, Needle and Process preset pills, Simple/Advanced switch, collapsible setting groups |
| Footer | 72 px | Time and gel estimate at the left, the yellow Slice or Export button at the right |
| Inspector drawer | 36 px closed, 240 px open | Strokes table, pump timeline, quality advisor, G-code view |
| Status bar | 28 px | Strokes, points, drawn length, time, gel |

Minimum window 1180 × 700. There are no floating or closable panel headers.

### 9.3 Colour: derived from your logo

Your logo is a blue that fades into white, with a yellow accent. I measured the logo pixels: the blue runs from about #2D8EB8 to #2EB3DD and the yellow is about #F6D30D. The app is **white and light grey**, uses **blue for structure**, and uses **yellow only for the one primary button**.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | #F4F6F9 | #0E1217 | Window background |
| `panel` | #FFFFFF | #161B22 | Panels, top bar, footer |
| `card` | #F7F9FC | #1D242D | Setting groups, cards |
| `border` | #DDE3EA | #2A333F | Dividers, field outlines |
| `text` | #18212C | #E9EEF4 | Main text |
| `text2` | #5A6676 | #9AA6B5 | Labels, hints, units |
| `blue` | #1F8FCB | #3FB0EB | Selection, sliders, icons, focus ring |
| `blueText` | #0F6FA8 | #7CCBF2 | Blue text, filled blue buttons |
| `blueSoft` | #E3F2FA | #12354A | Selected and hover backgrounds |
| `yellow` | #F5C400 | #FFD43B | Primary button fill only |
| `yellowText` | #18212C | #18212C | Text on yellow, always dark |
| `ok` / `warn` / `danger` | #1E9E5A / #C77700 / #D6453D | #3CC77F / #F0A33A / #FF6B63 | Status |

**Contrast was measured:** white text on the logo blue is only 3.6 to 1, so filled blue buttons use `blueText` (5.4 to 1). White text on this yellow is 1.6 to 1, which fails, so text on yellow is always dark (9.9 to 1). The theme follows the operating system and can be switched.

```css
:root {
  --bg:#F4F6F9; --panel:#FFFFFF; --card:#F7F9FC; --border:#DDE3EA;
  --text:#18212C; --text2:#5A6676; --blue:#1F8FCB; --blue-text:#0F6FA8;
  --blue-soft:#E3F2FA; --yellow:#F5C400; --yellow-text:#18212C;
  --radius-s:6px; --radius-m:10px; --radius-l:12px;
}
:root[data-theme="dark"] { --bg:#0E1217; --panel:#161B22; --card:#1D242D;
  --border:#2A333F; --text:#E9EEF4; --text2:#9AA6B5; --blue:#3FB0EB;
  --blue-text:#7CCBF2; --blue-soft:#12354A; --yellow:#FFD43B; }
```

### 9.4 Type, spacing and size

- **Font:** Inter. Sizes 20 (title), 14 (section), 13 (body), 11.5 (caption). Tabular figures for numbers.
- **Spacing:** 4-pt scale: 4, 8, 12, 16, 24, 32.
- **Heights:** field 32, button 36, primary button 44, tab 40. Every click target is at least 32 × 32 px.
- **Icons:** one SVG line set, 20 px, 1.5 px stroke, recoloured from tokens. Every icon button has a tooltip with its shortcut.
- **Focus:** a 2 px blue ring on every control, never removed.
- **Motion:** 120 ms hover, 200 ms panel, 250 ms camera. A reduce-motion preference turns it off.

### 9.5 Screens

- **Empty.** A real empty bed with a card in the middle: "Drop an STL file here", an Open button, recent files as thumbnails. Right-panel fields are disabled and the Slice button says why in a tooltip. No message boxes.
- **Prepare.** Shaded model with a ground shadow. Orange tint where a feature is thinner than the needle can print. The size shows in mm.
- **Slicing.** The footer button turns into a progress area (stage, bar, percent, "Layer 15 of 75", time left, Cancel). Settings lock. When done, the app moves to Preview and a toast says "Sliced in 4.2 s".
- **Preview.** Gel beads, a vertical layer slider showing "Layer 70 · Z 9.30 mm", a stroke slider with play, pause and step, the needle with a glowing tip, and a pump timeline. A legend selects the colour mode: material, stroke, layer, speed, pump state.
- **Warnings.** The quality advisor lists issues with Show and Fix buttons, in the form what, why, fix.
- **Export.** A small sheet with file name, dialect, previews of the start and end code, and a Save button. If serious warnings exist the button says "Export anyway". It never blocks.

### 9.6 Realism features (what makes it look like a real slicer)

| Feature | Detail |
| --- | --- |
| Real bed | Plate with printed grid (5 mm major, 1 mm minor), axis arrows, size labels, a faint box for the height limit |
| Lit model | Three lights, soft shadow, smooth shading. Wireframe is only a toggle. |
| Gel beads | Each stroke is a tube at the measured bead width, glossy, slightly transparent. Kick shows a wider blob at the start of a stroke. |
| Needle | A 3D needle at the true diameter, moving along the path in playback, glowing yellow when the pump is on and blue on the kick |
| Gizmos | Move, rotate and scale handles; lay flat; section plane; measure; scale bar; view cube |
| Overlays | Thin-feature and overhang tint, gap and overlap map, link map (which layers became a spiral) |
| Pump timeline | A graph of the pump over time (1000 kick, 350 draw, 0 off) built from the G-code. Click to jump. |
| Gel material | A small library with colour and gloss, so the preview looks like the real gel |
| Thumbnails | Saved with each project and shown in the empty state |

### 9.7 Key components

- **Number field:** 32 px, the unit shown inside, minus and plus on hover, drag the label to change the value, arrow keys step (Shift ×10, Alt ÷10), accepts "0.13\*2" and "130um", shows a red outline and the allowed range for a bad value, and never silently changes it.
- **Setting row:** label left, field right, a 16 px gap, an info tooltip, a blue dot and reset arrow when the value differs from the preset.
- **Strokes table:** columns #, Type (spiral or flat), Layers, Length, Time, Warnings. Clicking a row highlights that stroke. Reverse, move earlier, move later, skip and convert to flat are undoable.
- **Buttons:** one yellow primary button; the rest are white with an outline.

### 9.8 Keyboard

Open Ctrl+O, Save Ctrl+S, Slice Ctrl+Enter, Export Ctrl+E, switch stage Tab, move/rotate/scale G/R/S, lay flat L, frame model F, previous and next layer Up and Down, ten layers Page Up and Down, play and pause Space, step stroke Left and Right, section plane X, shortcuts sheet ?.

### 9.9 How the agent proves the interface

With Playwright, the agent takes a screenshot of each screen in section 9.5 in **light and dark** themes at **1180 × 700 and 1920 × 1080**, and shows them to you. It also checks automatically that no text is clipped, that contrast is at least 4.5 to 1, and that every control can be reached with Tab.

## 10. Build plan with gates

**The build has ten milestones, and the agent may start the next one only after you have seen the evidence for the current one.** The slicer comes first because its results can be proven with numbers. The interface comes after, so a screen problem can never hide a slicing problem.

| Milestone | What gets built | Gate: the evidence you must see | Needs |
| --- | --- | --- | --- |
| **M0** Setup | Repository from section 6.2, Python environment, `reference/` folder, `pytest` and a one-line test script | `pytest` runs. The MD5 of `out_default.gcode` is `9e60ab040ea5956f98df0e24abf7f4fa`. |  |
| **M1** Load, orient, slice | Stages 1 to 3 as `stl.py`, `orient.py`, `slicer.py` | Stage 1 to 3 tests from 8.4 pass. Loop counts per layer printed for the cube, sphere and torus. | M0 |
| **M2** Clean and link | Stages 4 and 5 | Stage 4 and 5 tests pass. Chain counts are 11 (jet), 1 (cube), 11 (sphere) and 22 (torus). | M1 |
| **M3** Curves, order, G-code, command line | Stages 6 to 8, `pipeline.py`, `dynadio slice` | The golden table in 8.2 matches on all four models. Jet G-code equals `out_default.gcode` on every non-comment line. Two runs give identical bytes. `test_reference_close` passes. | M2 |
| **M4** Settings, profiles, methods | `settings.py` table, JSON profiles, machine and needle profiles, start and end templates, `print_method` | Every setting round-trips. Bad values give clear errors. `layered` gives 75 and 87 strokes. Default output unchanged. | M3 |
| **M5** Quality and simulation | `quality.py` and `simulate.py`: warnings, time and gel estimate, pump events read from the G-code | Hand calculation of one stroke matches within 1%. Cube and jet warnings listed. | M4 |
| **M6** API and interface shell | FastAPI with progress and cancel, React and Vite shell with tokens, both themes, empty state, shaded model on a real bed | API returns the same statistics as the command line. Screenshots of empty and loaded screens, light and dark, at two window sizes. | M4 |
| **M7** Prepare screen | Panels, preset pills, settings generated from the table, move, rotate, scale, lay flat | Changing a setting in the interface gives the same G-code as the same profile on the command line. Screenshots. | M6 |
| **M8** Preview screen | Gel beads, layer and stroke sliders, playback, needle, pump timeline, legend, strokes table, quality advisor, inline progress with Cancel | Screenshots of every state. 30 frames per second or better with 300,000 points. Cancel works within a second. | M5, M7 |
| **M9** Export and packaging | Export sheet, shortcuts, remembered layout, desktop shell | A fresh install opens a model and exports G-code identical to the command line. All acceptance lines in 9.9 pass. | M8 |
| **M10** Slicer upgrades | One at a time: perimeter offset, volume flow, roof and floor fill, printability check, adaptive linking, branch handling, auto-orientation | Each has an on and off switch, and with it off the G-code is byte-identical to before. A new test proves the feature on its own model. | M9 |

**Stop rule.** If a gate fails twice, the agent stops, shows the failing evidence and asks. It does not work around the test.

**After M8 the app already looks and behaves like a real slicer.** M9 and M10 are polish and growth, so if time is short, stop at M8.

## 11. Prompts for the new agent

**Use an agent that can run commands and tests on your computer, and that can drive a browser for screenshots** (for example Claude Code, Codex CLI or Cursor in agent mode). A chat window that only writes code cannot prove anything, which is what went wrong last time.

Export this document as Markdown (or PDF) and put it in the project as `docs/BRIEF.md`. Put the files from section 8.1 in `reference/`. Then paste the **kickoff prompt** once, and after that **one milestone prompt per session**.

### Kickoff prompt (once)

```
You are building DynaDio Slicer from scratch. Read docs/BRIEF.md completely before
doing anything. It is the single source of truth. The reference/ folder is read
only and holds the ground truth.

Rules:
1. Do only the milestone I give you. Do not start the next one.
2. Write the tests first for anything in core/. A feature without a test does not exist.
3. Run everything you write. Show me the exact command and the real, complete output.
   If you could not run something, say so.
4. Never change slicing behaviour silently. The golden results in section 8.2 must
   keep passing.
5. core/ must never import interface or web code.
6. Every setting is defined once in core/dynadio_core/settings.py (section 7).
7. If anything in the brief is unclear or contradictory, stop and ask me.
8. End every milestone with: what passed, what is not working, and what you are
   unsure about.

First task: confirm you have read the brief by listing, in your own words, the eight
slicer stages, the two print methods, and the milestone gates M0 to M10.
Do not write code yet.
```

### Milestone prompts (one per session)

**M0.**

```
Do milestone M0 from section 10. Create the repository layout from section 6.2, a
Python 3.11 virtual environment with numpy, scipy and pytest, and a script run_tests.sh.
Copy nothing into reference/ yourself. Show that the MD5 of reference/out_default.gcode
is 9e60ab040ea5956f98df0e24abf7f4fa and that pytest runs.
```

**M1.**

```
Do milestone M1: stages 1 to 3 (sections 4.1 to 4.3) as stl.py, orient.py and slicer.py.
Write the tests from section 8.4 first. Match the reference script's behaviour exactly,
including the vertex rounding to 6 decimals and the 1e-9 nudge. Print the number of
loops per layer for the cube, sphere and torus.
```

**M2.**

```
Do milestone M2: stages 4 and 5 (sections 4.4 and 4.5) as clean.py and link.py. Tests
first. Show the chain counts: jet 11, cube 1, sphere 11, torus 22, using --length 9.7,
the up axes in section 8.2 and default settings.
```

**M3.**

```
Do milestone M3: stages 6 to 8 (sections 4.6 to 4.8), pipeline.slice_model() as in
section 6.3, and the command line `dynadio slice`. Run the four golden models and show
the table from section 8.2 with your numbers beside mine. Compare every non-comment
line of the jet G-code with reference/out_default.gcode and show the result. Also write
test_reference_close as described in section 8.3 and show it passing.
```

**M4.**

```
Do milestone M4: the settings table (section 7.1 and 7.2), JSON profiles (7.3), the
print_method setting with spiral and layered (section 5), and editable start and end
G-code templates. Prove: every setting round-trips, bad values give clear errors,
layered gives 75 strokes on the cube and 87 on the jet, and the default output is
unchanged (re-run the golden tests).
```

**M5.**

```
Do milestone M5: quality.py (warnings: model larger than the machine, features thinner
than the needle limit, more than five single flat strokes, open mesh edges) and
simulate.py (reads the generated G-code and returns time, position, feed, pump state
and gel volume as numpy arrays). Prove one stroke against a hand calculation within 1%.
```

**M6.**

```
Do milestone M6: the FastAPI app (section 6.4) with job start, progress events, cancel
and result, and the React and Vite interface shell with the tokens in section 9.3, a
light and a dark theme, the empty state, and a shaded model on a real bed (section 9.6).
Use Playwright to take screenshots of the empty and loaded screens in both themes at
1180x700 and 1920x1080 and show them to me. Show that the API statistics equal the
command line statistics for the jet.
```

**M7.**

```
Do milestone M7: the Prepare screen. Layout from section 9.2, preset pills, Simple and
Advanced modes, setting groups generated from settings.py, number fields and setting
rows from section 9.7, move, rotate, scale and lay flat. Prove that a setting changed in
the interface gives the same G-code as the same profile on the command line. Screenshots
as in M6.
```

**M8.**

```
Do milestone M8: the Preview screen (sections 9.5 to 9.7): gel beads as merged tube
meshes, layer slider, stroke slider with play, the needle, the pump timeline, legend
colour modes, strokes table, quality advisor and inline progress with Cancel. Measure the
frame rate with 300,000 points and show it. Screenshots of every state, both themes.
```

**M9.**

```
Do milestone M9: the export sheet, shortcuts (section 9.8), remembered layout and theme,
and the desktop shell. Prove that an exported G-code file is identical to the command
line's. Walk through section 9.9 and report each check as pass or fail.
```

**M10 (repeat once per upgrade).**

```
Do this slicer upgrade only: <perimeter offset | volume flow | roof and floor fill |
printability check | adaptive linking | branch handling | auto-orientation>.
Add a setting that turns it on, off by default. Write a test with its own model that
proves the feature works. Prove that with the setting off the G-code is byte-identical
to before, by showing the MD5 of the golden jet file before and after.
```

## 12. Open questions for you

The brief works as it stands, but these answers change details. Where you do not answer, the agent uses the default in brackets.

1. **Which Z is right for your machine?** The script writes Z 0.03 mm higher than your original result (section 8.3). \[Default: follow the script.\]
2. **Are the two print methods what you meant?** I read them as spiral and layer by layer with pump start and stop (section 5), because I could not open your other chats. If your earlier chats describe different methods, paste the key prompt or answer from each, or a G-code file from each, and I will correct sections 4 and 5. \[Default: as written.\]
3. **Are the app's values or the script's values right?** Your app showed resample 0.010, corner radius 0.070 and step 0.070. The script uses 0.015, 0.075 and 0.065 (section 7.1). \[Default: the script's.\]
4. **Are the machine values correct?** Work area 18.84 × 15.67 mm, height limit 11 mm, needle 21G with 0.514 mm inner diameter, bead width 0.65 mm (section 3). \[Default: as read from your screenshots.\]
5. **Web interface or Qt?** I recommend the web interface because the agent can test it itself. If you want Qt, the core and all tests stay the same and only milestones M6 to M9 change. \[Default: web.\]
6. **Which operating system do you use?** This decides how the desktop shell in M9 is packaged. \[Default: Windows first.\]
7. **Which AI agent will you use?** Any agent that can run commands and a browser works (section 11). \[Default: no preference.\]
8. **Can you supply the logo as an SVG?** The top bar needs a flat mark. \[Default: a plain text wordmark.\]
