const { gsap, ScrollTrigger, Lenis } = window;

// Watch pose per chapter. x/y: screen offset (fraction of viewport), zoom: camera zoom,
// rx/ry: rig rotation, strapY: bracelet slide-out (mm).
const POSES = {
  wide: {
    hero: { x: 0, y: 0.13, zoom: 0.58, rx: 0, ry: 0, strapY: 0 },
    case: { x: 0.2, y: 0, zoom: 0.72, rx: 0.1, ry: -0.75, strapY: 0 },
    glass: { x: 0.24, y: -0.03, zoom: 1.35, rx: -0.25, ry: 0.2, strapY: 0 },
    movement: { x: 0.2, y: 0, zoom: 0.95, rx: 0.05, ry: Math.PI, strapY: -200 },
    configureIn: { x: -0.2, y: 0, zoom: 0.72, rx: 0.05, ry: -1.1, strapY: 0 },
    configure: { x: -0.2, y: 0, zoom: 0.72, rx: 0.05, ry: -0.35, strapY: 0 },
  },
  narrow: {
    hero: { x: 0, y: 0.15, zoom: 0.78, rx: 0, ry: 0, strapY: 0 },
    case: { x: 0, y: -0.14, zoom: 0.62, rx: 0.1, ry: -0.75, strapY: 0 },
    glass: { x: 0, y: -0.14, zoom: 1.05, rx: -0.25, ry: 0.2, strapY: 0 },
    movement: { x: 0, y: -0.14, zoom: 0.8, rx: 0.05, ry: Math.PI, strapY: -260 },
    configureIn: { x: 0, y: 0.3, zoom: 0.5, rx: 0.05, ry: -1.1, strapY: 0 },
    configure: { x: 0, y: 0.3, zoom: 0.5, rx: 0.05, ry: -0.35, strapY: 0 },
  },
};

const narrow = window.matchMedia('(max-width: 860px)');
const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY;

export function initScroll(viewer, { reducedMotion = false } = {}) {
  if (!gsap || !ScrollTrigger) {
    console.warn('GSAP not available, scroll animations disabled');
    viewer.setFrame(POSES[narrow.matches ? 'narrow' : 'wide'].hero);
    return null;
  }
  gsap.registerPlugin(ScrollTrigger);

  let lenis = null;
  if (!reducedMotion && Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  initAnchors(lenis);
  initWatchJourney(viewer, reducedMotion);
  if (!reducedMotion) initReveals();
  return lenis;
}

function initAnchors(lenis) {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    const target = hash === '#top' ? 0 : document.querySelector(hash);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.1 });
    else if (target === 0) window.scrollTo({ top: 0 });
    else target.scrollIntoView();
  });
}

function initWatchJourney(viewer, reducedMotion) {
  const strap = viewer.parts.strap;
  let timeline = null;

  function build() {
    const poses = POSES[narrow.matches ? 'narrow' : 'wide'];
    const state = { ...poses.hero };
    const apply = () => {
      viewer.setFrame({ x: state.x, y: state.y, zoom: state.zoom });
      viewer.rig.rotation.set(state.rx, state.ry, 0);
      if (strap) strap.position.y = state.strapY;
    };

    const vh = window.innerHeight;
    const steps = [...document.querySelectorAll('.story-step')].map(pageTop);
    const banner = pageTop(document.querySelector('.banner'));
    const configure = pageTop(document.getElementById('configure'));

    // Timeline time is measured in scroll pixels
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' }, onUpdate: apply });
    const go = (pose, from, to) => tl.to(state, { ...poses[pose], duration: reducedMotion ? 0 : Math.max(to - from, 1) }, reducedMotion ? to : from);

    go('case', steps[0] - vh * 0.8, steps[0]);
    go('glass', steps[1] - vh * 0.8, steps[1]);
    go('movement', steps[2] - vh * 0.8, steps[2]);
    // Reposition while banner and details cover the stage, then turn into view
    go('configureIn', banner + vh, banner + vh * 1.5);
    go('configure', configure - vh, configure);
    tl.set({}, {}, configure);

    apply();
    return ScrollTrigger.create({
      start: 0,
      end: configure,
      scrub: reducedMotion ? true : 0.4,
      animation: tl,
    });
  }

  const rebuild = () => {
    timeline?.animation?.kill();
    timeline?.kill();
    timeline = build();
  };
  rebuild();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { rebuild(); ScrollTrigger.refresh(); }, 200);
  });
  // Late-loading fonts and images shift section offsets
  window.addEventListener('load', () => { rebuild(); ScrollTrigger.refresh(); });
}

function initReveals() {
  gsap.to('.hero-copy, .scroll-hint, .stage-hint', {
    opacity: 0,
    y: -60,
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '60% top', scrub: true },
  });

  document.querySelectorAll('.story-step').forEach((step) => {
    const text = step.querySelector('.story-text');
    gsap.timeline({ scrollTrigger: { trigger: step, start: 'top 85%', end: 'bottom 45%', scrub: true } })
      .fromTo(text, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' })
      .to(text, { opacity: 1, duration: 0.5 })
      .to(text, { opacity: 0, y: -40, duration: 0.25, ease: 'power2.in' });
  });

  gsap.fromTo('.banner-image', { yPercent: -8 }, {
    yPercent: 8,
    ease: 'none',
    scrollTrigger: { trigger: '.banner', start: 'top bottom', end: 'bottom top', scrub: true },
  });
  gsap.fromTo('.banner-quote p', { opacity: 0, scale: 0.92 }, {
    opacity: 1,
    scale: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.banner', start: 'top 70%', end: 'center center', scrub: true },
  });

  gsap.fromTo('.details-figure img', { scale: 1.18 }, {
    scale: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.details-figure', start: 'top bottom', end: 'bottom 60%', scrub: true },
  });

  const reveal = (targets, trigger, vars = {}) => gsap.from(targets, {
    opacity: 0,
    y: 40,
    duration: 1,
    stagger: 0.12,
    ease: 'power3.out',
    scrollTrigger: { trigger, start: 'top 80%', toggleActions: 'play none none reverse' },
    ...vars,
  });

  document.querySelectorAll('.details .container > .eyebrow, .collection .container > .eyebrow').forEach((el) => {
    reveal([el, el.nextElementSibling], el);
  });
  reveal('.stats li', '.stats');
  reveal('.detail-card', '.details-grid');
  reveal('.product-card', '.collection-grid');
  reveal('.configure-panel', '#configure', { x: 60, y: 0, stagger: 0 });
}
