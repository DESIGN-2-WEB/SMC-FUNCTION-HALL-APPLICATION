import { useEffect, useRef } from 'react';
import { reducedMotion } from '../motion.js';

/**
 * Animated 3D background (Vanta.js "NET": gold points and lines that react to the mouse).
 * Loaded on demand so three.js is only downloaded where this is used, skipped on small
 * screens and for people who ask their device to reduce motion, and destroyed on unmount.
 */
export default function VantaBackground({ className = '', color = 0xd4ad5e, backgroundColor = 0x0e1a2b }) {
  const ref = useRef(null);

  useEffect(() => {
    if (reducedMotion() || window.matchMedia('(max-width: 1023px)').matches) return undefined;
    let effect = null;
    let cancelled = false;
    Promise.all([import('three'), import('vanta/dist/vanta.net.min')])
      .then(([THREE, mod]) => {
        if (cancelled || !ref.current) return;
        // The file is a UMD bundle: depending on the bundler, the function sits at
        // mod.default or one level deeper at mod.default.default
        const NET = [mod.default, mod.default?.default, mod].find(f => typeof f === 'function');
        if (!NET) throw new Error('Vanta NET effect not found in the loaded module');
        effect = NET({
          el: ref.current,
          THREE,
          color,
          backgroundColor,
          points: 9,
          maxDistance: 21,
          spacing: 18,
          showDots: true,
          mouseControls: true,
          touchControls: false,
          gyroControls: false,
          scale: 1,
        });
      })
      .catch(err => {
        // e.g. WebGL not available: the plain navy background is shown instead
        console.warn('[vanta] background disabled:', err?.message || err);
      });
    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, [color, backgroundColor]);

  return <div ref={ref} aria-hidden="true" className={`pointer-events-auto ${className}`} />;
}
