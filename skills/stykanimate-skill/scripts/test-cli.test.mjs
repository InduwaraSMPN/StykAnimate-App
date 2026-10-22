import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  cmdInspect, cmdFrames, cmdGeometry, cmdEdit, cmdConvert,
  cmdValidate, cmdRender, cmdLaunch,
} from './styk.mjs';
import {Editor} from '../../../src/editor.mjs';
import {saveNative, saveJson, openInEditor, decodeProject, editorFor, fileExists} from './lib/project.mjs';

const selfUrl = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(selfUrl);
const repoRoot = path.resolve(scriptsDir, '..', '..', '..');
const TMP = path.resolve(repoRoot, 'artifacts/styk-cli-test');
const STYK = path.join(TMP, 'test.styk');

let tmpDirCreated = false;

async function ensureTmp() {
  if (tmpDirCreated) return;
  await rm(TMP, {recursive: true, force: true});
  await mkdir(TMP, {recursive: true});
  tmpDirCreated = true;
}

async function makeDemoProject() {
  await ensureTmp();
  const editor = new Editor({demo: false});
  const empty = {version: 5, canvas_width: 960, canvas_height: 540, fps: 24,
    auto_easing: false, auto_easing_disabled_raw: 1, auto_easing_source: 'file',
    backgrounds: [], figure_types: [], keyframes: [{duration_raw: 2, background_id: 0, background_id_b: 0, background_mix: 0,
      camera: {is_default: true, x: 0, y: 0, scale: 1, angle_rad: 0}, objects: [],
      object_draw_order: [], object_draw_order_unique_ids: []}], _styk: {format: 'StykAnimate', format_version: 1, name: 'Test Project'}};
  editor.load(empty, 'Test Project');
  await saveNative(editor, STYK, {name: 'Test Project'});
  return STYK;
}

test('styk: inspect command', async () => {
  const file = await makeDemoProject();
  const result = await cmdInspect([file]);
  assert.strictEqual(result, 0, 'inspect returns 0');
});

test('styk: frames command', async () => {
  const file = await makeDemoProject();
  const result = await cmdFrames([file]);
  assert.strictEqual(result, 0, 'frames returns 0');
});

test('styk: geometry command', async () => {
  const file = await makeDemoProject();
  const result = await cmdGeometry([file, '0', '0']);
  assert.strictEqual(result, 0, 'geometry returns 0');
});

test('styk: validate command', async () => {
  const file = await makeDemoProject();
  const result = await cmdValidate([file]);
  assert.strictEqual(result, 0, 'validate returns 0');
});

test('styk: launch command', async () => {
  const file = await makeDemoProject();
  const result = await cmdLaunch([file]);
  assert.strictEqual(result, 0, 'launch returns 0');
});

test('styk: convert command to json', async () => {
  const file = await makeDemoProject();
  const out = path.join(TMP, 'converted.json');
  const result = await cmdConvert([file, out]);
  assert.strictEqual(result, 0, 'convert returns 0');
  assert.ok(fileExists(out), 'converted json exists');
});

test('styk: render command to png', async () => {
  const file = await makeDemoProject();
  const out = path.join(TMP, 'rendered.png');
  const result = await cmdRender([file, '0', out]);
  assert.strictEqual(result, 0, 'render returns 0');
  assert.ok(fileExists(out), 'rendered png exists');
  const bytes = await readFile(out);
  assert.ok(bytes.length > 0, 'rendered png has bytes');
  assert.strictEqual(bytes.subarray(0, 4).toString('hex'), '89504e47', 'rendered png has valid header');
});

test('styk: edit select command', async () => {
  const file = await makeDemoProject();
  const result = await cmdEdit([file, 'select', '1']);
  assert.strictEqual(result, 0, 'edit select returns 0');
});

test('styk: unknown command not in COMMANDS', async () => {
  const {COMMANDS} = await import('./styk.mjs');
  assert.ok(!COMMANDS['bogus'], 'bogus command not in COMMANDS');
});

test('styk: project library exports', async () => {
  const lib = await import('./lib/project.mjs');
  assert.ok(typeof lib.openProject === 'function', 'openProject exported');
  assert.ok(typeof lib.editorFor === 'function', 'editorFor exported');
  assert.ok(typeof lib.saveNative === 'function', 'saveNative exported');
  assert.ok(typeof lib.saveJson === 'function', 'saveJson exported');
  assert.ok(typeof lib.fileExists === 'function', 'fileExists exported');
  assert.ok(typeof lib.kindOf === 'function', 'kindOf exported');
});

test('styk: inspect library exports', async () => {
  const lib = await import('./lib/inspect.mjs');
  assert.ok(typeof lib.summarize === 'function', 'summarize exported');
  assert.ok(typeof lib.frameList === 'function', 'frameList exported');
  assert.ok(typeof lib.frameGeometry === 'function', 'frameGeometry exported');
  assert.ok(typeof lib.figureList === 'function', 'figureList exported');
  assert.ok(typeof lib.animationChannels === 'function', 'animationChannels exported');
});