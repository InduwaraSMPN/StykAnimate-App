# StykAnimate CLI Skill

Headless command-line interface for inspecting, editing, validating, converting, rendering, and launching StyKAnimate projects. It drives the real `Editor` and container modules from `src/` — no reimplementation of the document format.

```bash
npm run skill -- <command> [args...]

# or directly
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
| `help` | Print usage information. |

## Global options

- `--save <file>` — After an edit, write the result to this native `.styk` file.
- `--name <name>` — Document name to stamp on save.
- `--width <n> / --height <n>` — Render output dimensions.

## Edit operations

| Operation | Args | Description |
|-----------|------|-------------|
| `move <dx> <dy>` | numbers | Translate selected figures. |
| `rotate <radians>` | number | Rotate selected figures. |
| `scale <factor>` | number | Scale selected figures (non-negative). |
| `set <field> <value>` | field, value | Set a property on the selected object (e.g. `root_x`, `scale`, `visible`). |
| `select <uid>` | figure id | Select a figure by unique id. |
| `frame <index>` | frame number | Select a frame by index. |
| `undo` | — | Undo the last command. |
| `redo` | — | Redo the last command. |

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

# Launch-check that a project opens cleanly
npm run skill -- launch project.styk
```

## Output

All commands print JSON to stdout. Errors print to stderr and exit with code 1.

## Project structure

```
skills/stykanimate/
├── README.md               # this file
├── SKILL.md                # skill usage contract
├── scripts/
│   ├── styk.mjs            # CLI entry point (8 commands + library exports)
│   ├── test-cli.test.mjs   # 11 unit tests (node:test)
│   └── lib/
│       ├── project.mjs     # project loading, saving, serialization, atomic writes
│       └── inspect.mjs     # read-only inspection: summary, frames, geometry, figures, channels
```

Both libraries import from the real `src/` modules (`Editor`, `native-container`, `svg-export`, `pivot/geometry`, etc.), so behavior matches the desktop app exactly.

## Testing

Run the unit tests:

```bash
node --test skills/stykanimate/scripts/test-cli.test.mjs
```

Syntax check the CLI:

```bash
npm run skill
```

The `skills` directory is included in `scripts/check.mjs` discovery, so `npm run check` covers these files too (when scoped appropriately).

## Safety

- Nothing reaches the network, spawns a process, or writes outside paths named by the caller.
- Saves are atomic (temp file + rename).
- No full-document cloning or serialization on interactive paths.

## Details

See [`SKILL.md`](./SKILL.md) for the full usage contract, output schemas, and library API reference.