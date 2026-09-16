/**
 * A single-use canvas 2D probe: records every call and property set so a
 * drawing routine can be asserted on (balanced save/restore, restored alpha,
 * no shadowBlur, actually drew something).
 */
const GRADIENT = { addColorStop() {} };

function makeProbeContext() {
  const state = {
    depth: 0,
    minDepth: 0,
    ops: 0,
    shadow: false,
    props: { globalAlpha: 1, lineWidth: 1 },
    stack: [],          // real canvases push/pop the whole property set
    calls: {},
  };

  const DRAW_OPS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'arc',
    'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'rect',
    'roundRect', 'fillText', 'strokeText', 'drawImage', 'arcTo']);

  const ctx = new Proxy({}, {
    get(_t, key) {
      if (typeof key === 'symbol') return undefined;
      if (key === 'canvas') return { width: 640, height: 640 };
      if (key in state.props) return state.props[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient' ||
          key === 'createConicGradient' || key === 'createPattern') {
        return () => GRADIENT;
      }
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args) => {
        state.calls[key] = (state.calls[key] || 0) + 1;
        if (DRAW_OPS.has(key)) state.ops += 1;
        if (key === 'save') {
          state.depth += 1;
          state.stack.push({ ...state.props });
        }
        if (key === 'restore') {
          state.depth -= 1;
          state.minDepth = Math.min(state.minDepth, state.depth);
          const restored = state.stack.pop();
          if (restored) {
            for (const name of Object.keys(state.props)) delete state.props[name];
            Object.assign(state.props, restored);
          }
        }
        return undefined;
      };
    },
    set(_t, key, value) {
      state.props[key] = value;
      if (key === 'shadowBlur' && value) state.shadow = true;
      if (key === 'shadowColor' && value && value !== 'transparent') state.shadow = true;
      if (key === 'filter' && value && value !== 'none') state.shadow = true;
      return true;
    },
    has() { return true; },
  });

  return {
    ctx,
    depth: () => state.depth,
    underflow: () => state.minDepth < 0,
    alpha: () => state.props.globalAlpha,
    usedShadow: () => state.shadow,
    ops: () => state.ops,
    calls: () => state.calls,
  };
}

module.exports = { makeProbeContext };
