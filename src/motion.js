// Shared GSAP setup and animation helpers for the whole app.
// Everything here is skipped for people who ask their device to reduce motion.
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);
gsap.defaults({ ease: 'power3.out' });

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const DONE = 'transform,opacity,visibility';

/**
 * Fade/slide `targets` in, and make sure they end up visible no matter what: animation frames
 * can be slowed or paused (background tab, power saving, a busy phone), which would otherwise
 * leave content hidden at opacity 0. A plain timer shows everything once the animation's time
 * is up. Returns a cleanup function.
 */
export function reveal(targets, from, to) {
  const list = gsap.utils.toArray(targets);
  if (!list.length) return () => {};
  const tween = gsap.fromTo(list, from, { ...to, clearProps: DONE });
  const total = ((to.delay || 0) + (to.duration || 0.5) + (to.stagger || 0) * list.length) * 1000 + 400;
  const safety = setTimeout(() => {
    tween.progress(1).kill();
    gsap.set(list, { clearProps: DONE });
  }, total);
  return () => clearTimeout(safety);
}

/**
 * Page entrance: when the page (key) changes, the content slides up and fades in, and the
 * cards on it follow one after another.
 */
export function usePageEnter(key) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (reducedMotion() || !ref.current) return undefined;
      const cleanups = [reveal(ref.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45 })];
      // Cards may appear a moment later when their data arrives, so look again shortly after
      const run = () => {
        const cards = gsap.utils.toArray(ref.current?.querySelectorAll('.card:not([data-entered])') || []).slice(0, 16);
        if (!cards.length) return;
        cards.forEach(c => c.setAttribute('data-entered', ''));
        cleanups.push(reveal(cards, { autoAlpha: 0, y: 22, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.06 }));
      };
      run();
      const timers = [setTimeout(run, 350), setTimeout(run, 900)];
      return () => {
        timers.forEach(clearTimeout);
        cleanups.forEach(c => c());
      };
    },
    { dependencies: [key], scope: ref },
  );
  return ref;
}

/**
 * Table rows / list items cascade in whenever the data changes (e.g. after loading or filtering).
 * Put the returned ref on the <tbody> or list container.
 */
export function useRowsReveal(deps) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (reducedMotion() || !ref.current) return undefined;
      const rows = Array.from(ref.current.children).slice(0, 25);
      return reveal(rows, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.03 });
    },
    { dependencies: deps, scope: ref },
  );
  return ref;
}

/** Sidebar links slide in one after another when the layout first appears. */
export function useStaggerIn(selector, deps = []) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (reducedMotion() || !ref.current) return undefined;
      return reveal(ref.current.querySelectorAll(selector), { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.05, delay: 0.1 });
    },
    { dependencies: deps, scope: ref },
  );
  return ref;
}

export { gsap, useGSAP };
