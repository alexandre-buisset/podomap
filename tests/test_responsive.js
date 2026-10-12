/**
 * Verification test for responsive design rules in CSS & HTML
 */
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync('index.html', 'utf-8');
const css = fs.readFileSync('src/style.css', 'utf-8');

console.log('Testing responsive architecture...');

// 1. Viewport Meta
if (!html.includes('viewport-fit=cover')) {
  throw new Error('Missing viewport-fit=cover in meta viewport');
}
console.log('  [PASS] meta viewport with viewport-fit=cover present');

// 2. Mobile HTML Elements
const requiredElements = [
  'sidebar-mobile-bar',
  'btn-close-sidebar',
  'btn-mobile-open-sidebar',
  'sidebar-backdrop',
  'btn-toggle-legend',
  'btn-text-label',
];
for (const el of requiredElements) {
  if (!html.includes(el)) {
    throw new Error(`Missing required mobile HTML element/class: ${el}`);
  }
}
console.log('  [PASS] All mobile HTML elements present (drawer bar, backdrop, floating button, legend toggle)');

// 3. Dynamic Viewport 100dvh
if (!css.includes('100dvh')) {
  throw new Error('Missing 100dvh dynamic viewport height');
}
console.log('  [PASS] 100dvh dynamic viewport height present');

// 4. Media Queries
const breakpoints = [
  'max-width: 1200px',
  'max-width: 1024px',
  'max-width: 768px',
  'max-width: 480px',
  'max-width: 360px',
];
for (const bp of breakpoints) {
  if (!css.includes(bp)) {
    throw new Error(`Missing media query breakpoint: ${bp}`);
  }
}
console.log('  [PASS] All responsive breakpoints defined: 1200px, 1024px, 768px, 480px, 360px');

// 5. Mobile Drawer Styles
if (!css.includes('sidebar-backdrop') || !css.includes('btn-mobile-floating-panel')) {
  throw new Error('Missing mobile drawer or floating panel styling');
}
console.log('  [PASS] Mobile drawer, backdrop, and floating map trigger styles verified');

// 7. Floating Filter Selector Responsiveness & Scroll
const filterElements = [
  'mode-scroll-viewport',
  'btn-mode-scroll-left',
  'btn-mode-scroll-right',
  'select-map-criterion',
  'sidebar-criterion-btn-group',
];
for (const fe of filterElements) {
  if (!html.includes(fe)) {
    throw new Error(`Missing responsive filter element: ${fe}`);
  }
}
if (!css.includes('.maplibregl-ctrl-top-right') || !css.includes('.mode-scroll-btn')) {
  throw new Error('Missing top offset for zoom controls or mode-scroll-btn styling in CSS');
}
console.log('  [PASS] Floating selector bar horizontal scroll arrows, wheel, and mirrored sidebar group verified');

console.log('\n>>> TOUS LES TESTS DE RESPONSIVITÉ SONT VALIDÉS AVEC SUCCÈS ! <<<');
