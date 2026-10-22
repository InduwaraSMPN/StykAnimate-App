/**
 * Headless project access for the StykAnimate agent skill.
 *
 * The skill drives the real editor modules, never a re-implementation of the
 * document format. Opening a project decodes it with the same container
 * decoder the app uses, editing goes through the real Editor commands (so undo,
 * history and validation behave exactly as they do in the window), and saving
 * writes the same native container the app writes.
 *
 * Nothing here reaches the network, spawns a process, or writes outside the
 * paths a caller names explicitly.
 */
import {readFile, writeFile, mkdir, rename, unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

import {Editor} from '../../../../src/editor.mjs';
import {decodeDocument, normalizeDecodedDocument, verifyEmbeddedSource, buildContainerV2} from '../../../../src/native-container.mjs';
import {packPoseSequences} from '../../../../src/pose-sequence-storage.mjs';

const NATIVE_KINDS = new Set(['styk', 'stkz', 'stykmov']);
const JSON_KINDS = new Set(['json']);

/** The file kind of a project file, keyed by lowercase extension. */
export function kindOf(filename) {
  const extension = path.extname(String(filename ?? '')).toLowerCase().replace(/^\./, '');
  if (NATIVE_KINDS.has(extension)) return extension;
  if (JSON_KINDS.has(extension)) return 'json';
  return extension;
}


/**
 * Decode a native container or a JSON project into an editable document.
 *
 * Native containers decode locally: the same inflate/materialize path the app's
 * import worker uses. JSON projects are read as text and parsed.
 */
export async function decodeProject(bytes, {filename = 'project.styk', kind} = {}) {
  const resolved = kind ?? kindOf(filename);
  if (NATIVE_KINDS.has(resolved)) {
    const decoded = await decodeDocument(new Uint8Array(bytes), resolved);
    const document = normalizeDecodedDocument(decoded.document, resolved);
    await verifyEmbeddedSource(document);
    return {document, kind: resolved, containerVersion: decoded.version};
  }
  if (resolved === 'json') {
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(text);
    // The early web save wrapper carries the document one level down.
    const document = parsed?.format === 'stykanimate' && parsed?.document ? parsed.document : parsed;
    return {document, kind: 'json'};
  }
  throw new Error(`Unsupported project kind "${resolved}". Open a .styk, .stkz, .stykmov or .json project.`);
}

/** Read and decode a project file from disk. */
export async function openProject(file, options = {}) {
  const absolute = path.resolve(file);
  const bytes = await readFile(absolute);
  const {document, kind, containerVersion} = await decodeProject(bytes, {filename: absolute, kind: options.kind});
  return {document, kind, containerVersion, path: absolute, name: options.name ?? path.basename(absolute, path.extname(absolute))};
}

/**
 * Load a document into a real Editor instance.
 *
 * The editor owns validation, layer state, frame identities and history, so an
 * edited project behaves exactly like one edited in the window.
 */
export function editorFor(document, name = 'Project') {
  const editor = new Editor({demo: false});
  editor.load(document, name);
  return editor;
}

/** Open a project file straight into an editor. */

/**
 * Serialize the editor's current document.
 *
 * This is the same snapshot the app saves: runtime segments are dropped and
 * the document is validated before it leaves the editor.
 */
export function serializeDocument(editor, {name} = {}) {
  const document = editor.serialize();
  if (name) document._styk = {...document._styk, name};
  return document;
}

/**
 * Build the native container bytes for a document.
 *
 * Mirrors the app's export worker: pose sequences are packed, the format
 * marker is set, and the original binary source (when the project still has
 * one) is embedded so the file keeps its provenance.
 */
export async function buildNativeBytes(document, {kind = 'styk', source} = {}) {
  const portable = kind === 'styk' ? document : {...document};
  if (kind !== 'styk') delete portable._stykSource;
  const output = packPoseSequences(portable);
  output._styk = {...output._styk, format: 'StykAnimate', format_version: 1};
  if (kind === 'styk' && source?.bytes) {
    output._stykSource = {...source.metadata, source_base64: source.bytes};
  }
  return buildContainerV2(output, kind);
}

/** Open a project file straight into an editor. */
export async function openInEditor(file, options = {}) {
  const project = await openProject(file, options);
  const editor = editorFor(project.document, project.name);
  return {editor, project};
}

/**
 * Write bytes to a path atomically.
 *
 * The temporary file is written and renamed into place so an interrupted or
 * failed save never replaces a good file with a partial one.
 */
export async function writeFileAtomic(destination, bytes) {
  const absolute = path.resolve(destination);
  await mkdir(path.dirname(absolute), {recursive: true});
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, absolute);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return absolute;
}

/** Save an editor's document as a native project file. */
export async function saveNative(editor, destination, {name, kind = 'styk', source} = {}) {
  const document = serializeDocument(editor, {name});
  const bytes = await buildNativeBytes(document, {kind, source});
  const written = await writeFileAtomic(destination, bytes);
  editor.markSaved();
  return {path: written, bytes: bytes.byteLength};
}

/** Save an editor's document as a JSON project file. */
export async function saveJson(editor, destination, {name} = {}) {
  const document = serializeDocument(editor, {name});
  const bytes = new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`);
  const written = await writeFileAtomic(destination, bytes);
  editor.markSaved();
  return {path: written, bytes: bytes.byteLength};
}

/** Whether a path exists on disk. */
export function fileExists(file) {
  return existsSync(path.resolve(file));
}
