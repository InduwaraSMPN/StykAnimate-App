/**
 * Read-only scene inspection for the StykAnimate agent skill.
 *
 * Everything reported here is read from the live editor state, so the numbers
 * an agent sees are the numbers the app would show.
 */
import {timeline, evaluatedFrame, buildGeometry} from '../../../../src/pivot/geometry.mjs';

/** A short, human-readable summary of a project. */
export function summarize(editor) {
  const report = editor.report;
  const figures = report.figure_types ?? [];
  const keyframes = report.keyframes ?? [];
  const durationSeconds = editor.totalTicks / Math.max(1, report.fps);
  return {
    name: editor.name,
    version: report.version,
    canvas: {width: report.canvas_width, height: report.canvas_height},
    fps: report.fps,
    figures: figures.length,
    keyframes: keyframes.length,
    ticks: editor.totalTicks,
    durationSeconds: Number(durationSeconds.toFixed(3)),
    layers: editor.layers.map(layer => ({
      id: layer.id,
      kind: layer.kind ?? 'layer',
      name: layer.name,
      visible: layer.visible !== false,
      locked: Boolean(layer.locked),
      figures: (layer.figureUids ?? []).length,
    })),
    figureTypes: figures.map(figure => ({
      id: figure.figure_type_id,
      name: figure.name,
      segments: figure.segments?.length ?? 0,
      movieclip: Boolean(figure._styk?.movieclip),
    })),
    dirty: editor.dirty,
  };
}

/**
 * The animation timeline: one row per stored keyframe.
 *
 * `duration` is the frame's own length in ticks; `start` is where it begins.
 */
export function frameList(editor) {
  const report = editor.report;
  const rows = timeline(report);
  return rows.map((row, index) => {
    const frame = report.keyframes[index] ?? {};
    const objects = frame.objects ?? [];
    return {
      index,
      start: row.start,
      end: row.start + row.count,
      duration: row.count,
      objects: objects.length,
      figures: objects.length ? [...new Set(objects.map(object => object.figure_type_id))] : [],
      names: objects.map(object => object.name).filter(Boolean),
    };
  });
}

/**
 * The evaluated pose of one frame, with the solved geometry of every figure.
 *
 * `t` is a position inside the frame (0 to 1); the default is the frame start.
 */
export function frameGeometry(editor, index = 0, t = 0) {
  const report = editor.report;
  const rows = timeline(report);
  const row = rows[index];
  if (!row) throw new Error(`Frame ${index} does not exist. The project has ${rows.length} frames.`);
  const position = Math.max(0, Math.min(1, t));
  const frame = evaluatedFrame(report, index, position);
  const geometry = buildGeometry(report, frame);
  return {
    index,
    start: row.start,
    duration: row.count,
    objects: (frame.objects ?? []).map(object => {
      const solved = geometry.objects.get(object.object_slot);
      return {
        uniqueId: object.unique_id,
        figureTypeId: object.figure_type_id,
        name: object.name ?? null,
        slot: object.object_slot,
        root: solved ? {x: Number(solved.root.x.toFixed(3)), y: Number(solved.root.y.toFixed(3))} : null,
        rotation: object.rotation ?? 0,
        scale: object.scale ?? 1,
        visible: object.visible !== false,
        joinedTo: object.join?.target_object_slot ?? null,
        anchor: object.anchor ?? null,
        color: object.color_override_raw ?? null,
      };
    }),
  };
}

/**
 * The figures placed in one frame, with their segment list.
 *
 * This is the figure-level view: what is drawn, with what shape.
 */
export function figureList(editor, index = 0) {
  const report = editor.report;
  const rows = timeline(report);
  const row = rows[index];
  if (!row) throw new Error(`Frame ${index} does not exist. The project has ${rows.length} frames.`);
  const frame = evaluatedFrame(report, index, 0);
  return (frame.objects ?? []).map(object => {
    const figure = report.figure_types.find(candidate => candidate.figure_type_id === object.figure_type_id);
    return {
      uniqueId: object.unique_id,
      figureTypeId: object.figure_type_id,
      name: object.name ?? figure?.name ?? null,
      rootX: Number((object.root_x ?? 0).toFixed(3)),
      rootY: Number((object.root_y ?? 0).toFixed(3)),
      segments: (figure?.segments ?? []).map((segment, position) => ({
        index: position,
        name: segment.name ?? null,
        type: segment.type ?? 'line',
        length: segment.length ?? null,
        color: segment.color ?? null,
      })),
    };
  });
}

/**
 * The project's animation channels (properties that vary over time).
 */
export function animationChannels(editor) {
  return (editor.animationChannels ?? []).map(channel => ({
    id: channel.id ?? null,
    target: channel.target ? {...channel.target} : null,
    property: channel.property ?? null,
    keys: (channel.keys ?? []).length,
  }));
}
