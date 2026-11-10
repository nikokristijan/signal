// Geometry for the five zoom stages. Shared by the build script and the tests.
// Everything is expressed as fractions (0..1) of the 4:3 master frame, so the
// maths is independent of the photo's pixel size.

export const DEFAULT_ZOOMS = [7, 4, 2.4, 1.5, 1];

/**
 * Returns one rect {x, y, w, h} per stage (fractions of the master frame).
 * Stage N+1 always fully contains stage N: the crops are nested, so the player
 * is really zooming out of ONE photograph.
 */
export function stageRects(focus, zooms = DEFAULT_ZOOMS) {
  const rects = new Array(zooms.length);
  rects[zooms.length - 1] = { x: 0, y: 0, w: 1, h: 1 };
  for (let i = zooms.length - 2; i >= 0; i--) {
    const w = 1 / zooms[i];
    const h = 1 / zooms[i];
    const outer = rects[i + 1];
    const x = Math.min(Math.max(focus.x - w / 2, outer.x), outer.x + outer.w - w);
    const y = Math.min(Math.max(focus.y - h / 2, outer.y), outer.y + outer.h - h);
    rects[i] = { x, y, w, h };
  }
  return rects;
}

export function contains(outer, inner, eps = 1e-9) {
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
}
