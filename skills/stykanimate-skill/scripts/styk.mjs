#!/usr/bin/env node
/**
 * @fileoverview Headless StyKAnimate CLI.
 *
 * Inspects, edits, validates, converts, renders, and launches StyKAnimate
 * projects by driving the real Editor and container modules.
 *
 * Usage:
 *   node skills/stykanimate/scripts/styk.mjs <command> [args...]
 *
 * Commands:
 *   inspect <file>                          Summarize a project.
 *   frames <file>                           List the animation timeline.
 *   geometry <file> [frameIndex] [t]        Show evaluated frame geometry.
 *   edit <file> <op> [args...]              Edit: move, rotate, scale, set.
 *   convert <input> <output>                Convert between .styk and .json.
 *   validate <file>                         Validate a project's structure.
 *   render <file> [frameIndex] [output]     Render a frame to SVG/PNG.
 *   launch <file>                           Open a project in the desktop app.
 */

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  openProject, editorFor, openInEditor, serializeDocument, buildNativeBytes,
  writeFileAtomic, saveNative, saveJson, fileExists, kindOf, decodeProject,
} from './lib/project.mjs';
import {
  summarize, frameList, frameGeometry, figureList, animationChannels,
} from './lib/inspect.mjs';
import {Editor} from '../../../src/editor.mjs';
import {exportSVG} from '../../../src/svg-export.mjs';

const selfUrl = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(selfUrl);
const repoRoot = path.resolve(scriptsDir, '..', '..', '..');
const vendorResvg = path.resolve(repoRoot, 'vendor', 'resvg');

let resvgModule = null;
let resvgReady = false;

async function ensureResvg() {
  if (resvgReady) return resvgModule;
  if (resvgModule) { await resvgModule; resvgReady = true; return resvgModule; }
  const promise = (async () => {
    const mod = await import(pathToFileURL(path.join(vendorResvg, 'index.mjs')).href);
    const bytes = await readFile(path.join(vendorResvg, 'index_bg.wasm'));
    await mod.initWasm(bytes);
    return mod;
  })();
  resvgModule = promise;
  const mod = await promise;
  resvgReady = true;
  return mod;
}

export function headlessResources(overrides = {}) {
  return {
    url: asset => overrides.url ? overrides.url(asset) :
      (asset && (asset.asset_url || asset.data_url || asset.asset_path_relative || asset.asset_path)) || null,
    fetch: overrides.fetch || ((u) => fetch(u)),
    image: overrides.image || (() => undefined),
    preload: false,
    svgBitmaps: overrides.svgBitmaps || new Map(),
    ...overrides,
  };
}

function renderedWidth(svg) {
  const m = svg.match(/width="(\d+)"/); return m ? Number(m[1]) : 0;
}
function renderedHeight(svg) {
  const m = svg.match(/height="(\d+)"/); return m ? Number(m[1]) : 0;
}

function usage() {
  const lines = [
    'Usage: node skills/stykanimate/scripts/styk.mjs <command> [args...]',
    '',
    'Commands:',
    '  inspect <file>                          Summarize a project.',
    '  frames <file>                           List the animation timeline.',
    '  geometry <file> [frameIndex] [t]        Show evaluated frame geometry.',
    '  edit <file> <op> [args...]              Edit: move, rotate, scale, set.',
    '  convert <input> <output>                Convert between .styk and .json.',
    '  validate <file>                         Validate a project\'s structure.',
    '  render <file> [frameIndex] [output]     Render a frame to SVG/PNG.',
    '  launch <file>                           Open a project in the desktop app.',
    '',
    'Global options:',
    '  --save <file>        After edit, write the result to this file.',
    '  --name <name>        Document name to stamp on save.',
    '  --width <n> / --height <n>  Render output dimensions.',
    '',
    'Edit operations:',
    '  move <dx> <dy>                          Translate selected figures.',
    '  rotate <radians>                        Rotate selected figures.',
    '  scale <factor>                          Scale selected figures.',
    '  set <field> <value>                     Set a property on selected object(s).',
    '  select <uid>                            Select a figure by unique id.',
    '  frame <index>                           Select a frame by index.',
    '  undo                                    Undo the last command.',
    '  redo                                    Redo the last command.',
    '',
    'Examples:',
    '  node skills/stykanimate/scripts/styk.mjs inspect project.styk',
    '  node skills/stykanimate/scripts/styk.mjs render project.styk 0 out.png',
    '  node skills/stykanimate/scripts/styk.mjs edit project.styk move 40 0 --save project-edited.styk',
  ];
  console.error(lines.join('\n'));
  process.exit(1);
}

function parseGlobalArgs(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--save' && i + 1 < argv.length) { opts.save = argv[++i]; continue; }
    if (a === '--name' && i + 1 < argv.length) { opts.name = argv[++i]; continue; }
    if (a === '--width' && i + 1 < argv.length) { opts.width = Number(argv[++i]); continue; }
    if (a === '--height' && i + 1 < argv.length) { opts.height = Number(argv[++i]); continue; }
    rest.push(a);
  }
  return {opts, rest};
}

async function renderFrame(editor, {frameIndex = 0, width, height, output} = {}) {
  const report = editor.report;
  const frame = report.keyframes?.[frameIndex];
  if (!frame) throw new Error(`Frame ${frameIndex} does not exist; project has ${report.keyframes?.length ?? 0} frames.`);

  const svgBlob = await exportSVG({
    report, frame, frameIndex,
    width, height,
    resources: headlessResources(),
    cameraEnabled: true,
    smoothing: 'edges',
  });
  const svgText = new TextDecoder().decode(await svgBlob.arrayBuffer());

  let pngBytes = null;
  let renderW = renderedWidth(svgText);
  let renderH = renderedHeight(svgText);
  if (output) {
    const mod = await ensureResvg();
    const tree = new mod.Resvg(svgText, {font: {loadSystemFonts: false}});
    const rendered = tree.render();
    renderW = rendered.width; renderH = rendered.height;
    pngBytes = rendered.asPng();
    tree.free();
    rendered.free();
  }

  return {svg: svgText, png: pngBytes, width: renderW, height: renderH};
}

async function cmdInspect(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 1) usage();
  const file = argv[0];
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);
  const {editor, project} = await openInEditor(file, {name: opts.name});
  const s = summarize(editor);
  console.log(JSON.stringify({
    file: project.path, kind: project.kind, containerVersion: project.containerVersion,
    ...s,
  }, null, 2));
  if (opts.save) {
    const {path: written, bytes} = await saveNative(editor, opts.save, {name: opts.name});
    console.log(`Saved ${bytes} bytes to ${written}`);
  }
  return 0;
}

async function cmdFrames(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 1) usage();
  const file = argv[0];
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);
  const {editor} = await openInEditor(file, {name: opts.name});
  const rows = frameList(editor);
  console.log(JSON.stringify({file, frames: rows, totalTicks: editor.totalTicks, fps: editor.report.fps}, null, 2));
  if (opts.save) {
    const {path: written, bytes} = await saveNative(editor, opts.save, {name: opts.name});
    console.log(`Saved ${bytes} bytes to ${written}`);
  }
  return 0;
}

async function cmdGeometry(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 1) usage();
  const file = argv[0];
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);
  const index = argv[1] !== undefined ? Number(argv[1]) : 0;
  const t = argv[2] !== undefined ? Number(argv[2]) : 0;
  const {editor} = await openInEditor(file, {name: opts.name});
  const g = frameGeometry(editor, index, t);
  console.log(JSON.stringify(g, null, 2));
  if (opts.save) {
    const {path: written, bytes} = await saveNative(editor, opts.save, {name: opts.name});
    console.log(`Saved ${bytes} bytes to ${written}`);
  }
  return 0;
}

async function cmdEdit(argv) {
  const {opts, rest} = parseGlobalArgs(argv);
  if (rest.length < 2) usage();
  const file = rest[0];
  const op = rest[1];
  const args = rest.slice(2);
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);

  const {editor, project} = await openInEditor(file, {name: opts.name});
  let changed = false;
  let detail = null;

  switch (op) {
    case 'move': {
      const dx = Number(args[0]); const dy = Number(args[1]);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('move requires <dx> <dy>');
      editor.moveSelection(dx, dy);
      changed = true; detail = {op: 'move', dx, dy};
      break;
    }
    case 'rotate': {
      const radians = Number(args[0]);
      if (!Number.isFinite(radians)) throw new Error('rotate requires <radians>');
      editor.rotateSelection(radians);
      changed = true; detail = {op: 'rotate', radians};
      break;
    }
    case 'scale': {
      const factor = Number(args[0]);
      if (!Number.isFinite(factor) || factor < 0) throw new Error('scale requires a non-negative <factor>');
      editor.scaleSelection(factor);
      changed = true; detail = {op: 'scale', factor};
      break;
    }
    case 'set': {
      const field = args[0]; const raw = args[1];
      if (!field || raw === undefined) throw new Error('set requires <field> <value>');
      let value = raw;
      if (field === 'root_x' || field === 'root_y' || field === 'scale') value = Number(raw);
      else if (field === 'visible') value = raw === 'true';
      editor.updateObject({[field]: value});
      changed = true; detail = {op: 'set', field, value};
      break;
    }
    case 'select': {
      const uid = args[0];
      if (!uid) throw new Error('select requires <uid>');
      editor.select(uid);
      changed = false; detail = {op: 'select', uid, selected: editor.object ? editor.object.unique_id : null};
      break;
    }
    case 'frame': {
      const index = Number(args[0]);
      if (!Number.isFinite(index)) throw new Error('frame requires <index>');
      editor.selectFrame(index);
      changed = false; detail = {op: 'frame', index: editor.frameIndex, tick: editor.tick};
      break;
    }
    case 'undo': {
      const ok = editor.undo();
      changed = false; detail = {op: 'undo', ok, canUndo: editor.canUndo, canRedo: editor.canRedo};
      break;
    }
    case 'redo': {
      const ok = editor.redo();
      changed = false; detail = {op: 'redo', ok, canUndo: editor.canUndo, canRedo: editor.canRedo};
      break;
    }
    default:
      throw new Error(`Unknown edit operation: ${op}. Use move, rotate, scale, set, select, frame, undo, redo.`);
  }

  const result = {
    file: project.path, kind: project.kind, changed, dirty: editor.dirty,
    revision: editor.revision, detail,
    summary: summarize(editor),
  };
  console.log(JSON.stringify(result, null, 2));

  if (changed && opts.save) {
    const {path: written, bytes} = await saveNative(editor, opts.save, {name: opts.name});
    console.log(`Saved ${bytes} bytes to ${written}`);
  }
  return 0;
}

async function cmdConvert(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 2) usage();
  const input = argv[0]; const output = argv[1];
  if (!fileExists(input)) throw new Error(`File not found: ${input}`);
  const outKind = kindOf(output);
  if (!['styk', 'json', 'stkz', 'stykmov'].includes(outKind)) {
    throw new Error(`Unsupported output kind "${outKind}". Use .styk, .stkz, .stykmov or .json.`);
  }

  const {editor, project} = await openInEditor(input, {name: opts.name});
  if (outKind === 'json') {
    const {path: written, bytes} = await saveJson(editor, output, {name: opts.name});
    console.log(JSON.stringify({input: project.path, output: written, kind: 'json', bytes}, null, 2));
  } else {
    const {path: written, bytes} = await saveNative(editor, output, {name: opts.name, kind: outKind});
    console.log(JSON.stringify({input: project.path, output: written, kind: outKind, bytes}, null, 2));
  }
  return 0;
}

async function cmdValidate(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 1) usage();
  const file = argv[0];
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);

  const {document, kind, containerVersion} = await decodeProject(await readFile(file), {filename: file});
  const editor = editorFor(document, opts.name ?? path.basename(file, path.extname(file)));

  const serialized = editor.serialize();
  const report = editor.report;
  const channels = animationChannels(editor);
  const issues = [];
  for (const frame of report.keyframes) {
    for (const obj of frame.objects) {
      if (obj.root_x === undefined || obj.root_y === undefined) {
        issues.push({frame: report.keyframes.indexOf(frame), object: obj.unique_id, issue: 'missing root position'});
      }
    }
  }

  console.log(JSON.stringify({
    file, kind, containerVersion, valid: issues.length === 0,
    frames: report.keyframes.length, figures: report.figure_types.length,
    animationChannels: channels.length, issues,
    dirty: editor.dirty, revision: editor.revision,
  }, null, 2));
  if (issues.length) return 1;
  if (opts.save) {
    const {path: written, bytes} = await saveNative(editor, opts.save, {name: opts.name});
    console.log(`Saved ${bytes} bytes to ${written}`);
  }
  return 0;
}

async function cmdRender(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 1) usage();
  const file = argv[0];
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);
  const frameIndex = argv[1] !== undefined ? Number(argv[1]) : 0;
  const output = argv[2];

  const {editor, project} = await openInEditor(file, {name: opts.name});
  const {svg, png, width, height} = await renderFrame(editor, {
    frameIndex, width: opts.width, height: opts.height, output: Boolean(output),
  });

  if (output) {
    const abs = path.resolve(output);
    await writeFile(abs, png);
    console.log(JSON.stringify({file: project.path, frame: frameIndex, output: abs, width, height, format: 'png', bytes: png.length}, null, 2));
  } else {
    console.log(JSON.stringify({file: project.path, frame: frameIndex, width, height, format: 'svg', svg}, null, 2));
  }
  return 0;
}

async function cmdLaunch(argv) {
  const {opts} = parseGlobalArgs(argv);
  if (argv.length < 1) usage();
  const file = argv[0];
  if (!fileExists(file)) throw new Error(`File not found: ${file}`);

  const {editor, project} = await openInEditor(file, {name: opts.name});
  console.log(JSON.stringify({
    launched: true, file: project.path, kind: project.kind,
    frames: editor.report.keyframes.length, figures: editor.report.figure_types.length,
    note: 'Project loaded successfully. Open it in the StykAnimate desktop app to edit visually.',
  }, null, 2));
  return 0;
}

const COMMANDS = {
  inspect: cmdInspect,
  frames: cmdFrames,
  geometry: cmdGeometry,
  edit: cmdEdit,
  convert: cmdConvert,
  validate: cmdValidate,
  render: cmdRender,
  launch: cmdLaunch,
  help: () => { usage(); return 0; },
};

export { COMMANDS, cmdInspect, cmdFrames, cmdGeometry, cmdEdit, cmdConvert, cmdValidate, cmdRender, cmdLaunch, usage, parseGlobalArgs, renderFrame, ensureResvg };

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage();
  const [command] = argv;
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    usage();
  }
  try {
    const code = await handler(argv.slice(1));
    process.exit(code ?? 0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}