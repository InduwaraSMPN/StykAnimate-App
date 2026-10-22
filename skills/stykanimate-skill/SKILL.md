# StykAnimate Skill

A headless CLI for inspecting, editing, validating, converting, rendering, and launching StyKAnimate projects. It drives the real `Editor` and container modules — no reimplementation of the document format.

## Install

The skill lives in `skills/stykanimate/`. Its scripts run from the repository root with Node 24.

```bash
npm run skill -- <command> [args...]
```

Or directly:

```bash
node skills/stykanimate/scripts/styk.mjs <command> [args...]
```

## Commands

| Command | Description |
|---------|-------------|
| `inspect <file>` | Summarize a project: canvas, fps, figures, frames, layers, dirty state. |
| `frames <file>` | List the animation timeline: one row per keyframe with start, duration, objects. |
| `geometry <file> [frameIndex] [t]` | Show evaluated frame geometry: object roots, rotation, scale, visibility. |
| `edit <file> <op> [args...]` | Edit a project: `move`, `rotate`, `scale`, `set`, `select`, `frame`, `undo`, `redo`. |
| `convert <input> <output>` | Convert between `.styk`, `.stkz`, `.stykmov`, and `.json`. |
| `validate <file>` | Validate a project's structure (scene, animation, frame identities, layers). |
| `render <file> [frameIndex] [output]` | Render a frame to SVG (stdout) or PNG (file). Use `--width`/`--height` to size output. |
| `launch <file>` | Verify a project loads into an editor (same precondition the desktop app uses). |

### Global options

- `--save <file>` — After an edit, write the result to this native `.styk` file.
- `--name <name>` — Document name to stamp on save.
- `--width <n> / --height <n>` — Render output dimensions.

### Edit operations

- `move <dx> <dy>` — Translate selected figures.
- `rotate <radians>` — Rotate selected figures.
- `scale <factor>` — Scale selected figures (non-negative).
- `set <field> <value>` — Set a property on the selected object (e.g. `root_x`, `scale`, `visible`).
- `select <uid>` — Select a figure by unique id.
- `frame <index>` — Select a frame by index.
- `undo` / `redo` — Undo or redo the last command.

## Examples

```bash
# Inspect a project
npm run skill -- inspect project.styk

# List frames
npm run skill -- frames project.styk

# Render frame 0 to PNG
npm run skill -- render project.styk 0 out.png

# Render frame 0 to SVG (stdout)
npm run skill -- render project.styk 0

# Move selected figures and save
npm run skill -- edit project.styk move 40 0 --save project-edited.styk

# Convert .styk to .json
npm run skill -- convert project.styk project.json

# Validate a project
npm run skill -- validate project.styk
```

## Output

All commands print JSON to stdout. Errors print to stderr and exit with code 1.

## Libraries

The skill is built from two reusable libraries:

- `skills/stykanimate/scripts/lib/project.mjs` — project loading, saving, serialization, atomic writes.
- `skills/stykanimate/scripts/lib/inspect.mjs` — read-only inspection of summaries, frames, geometry, figures, and animation channels.

Both libraries import from the real `src/` modules (`Editor`, `native-container`, `svg-export`, `pivot/geometry`, etc.), so behavior matches the desktop app exactly.

## Safety

Nothing in this skill reaches the network, spawns a process, or writes outside the paths a caller names explicitly. Saves are atomic (temp file + rename).