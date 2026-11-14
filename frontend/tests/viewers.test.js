import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

// Render the actual JSX: bundling alone cannot catch undefined variables in a render.
// Build in memory and use existing dependencies; no HTTP server, browser or output files.
test('both viewers render custom pointings, valid defaults, and invalid-link errors', async () => {
  const require = createRequire(import.meta.url);
  const entry = 'virtual:viewer-render-test';
  const pagePath = page => fileURLToPath(new URL(`../src/pages/${page}.jsx`, import.meta.url));
  const built = await build({
    logLevel: 'error',
    plugins: [{ name: 'viewer-render-test',
      resolveId(id) { if (id.endsWith(entry)) return '\0' + entry; },
      load(id) { if (id.endsWith(entry)) return `
        import { createElement } from 'react';
        import { renderToString } from 'react-dom/server';
        import { MemoryRouter, Routes, Route } from 'react-router-dom';
        import Explorer from ${JSON.stringify(pagePath('ExplorerPage'))};
        import Scene from ${JSON.stringify(pagePath('ScenePage'))};
        import Home from ${JSON.stringify(pagePath('HomePage'))};
        import Learn from ${JSON.stringify(pagePath('LearnPage'))};
        import Targets from ${JSON.stringify(pagePath('TargetsPage'))};
        import Missions from ${JSON.stringify(pagePath('MissionsPage'))};
        import Experiments from ${JSON.stringify(pagePath('ExperimentsPage'))};
        import Library from ${JSON.stringify(pagePath('LibraryPage'))};
        import DataNotice from ${JSON.stringify(fileURLToPath(new URL('../src/components/DataNotice.jsx', import.meta.url)))};
        import SpectrumChart from ${JSON.stringify(fileURLToPath(new URL('../src/components/SpectrumChart.jsx', import.meta.url)))};
        export function renderMeasured() { return renderToString(createElement(SpectrumChart, { measured: true, bands: [{ bandId: 1, wavelength: 3.05, flux: -0.2, err: .1, bandwidth: .08 }], inSpherexFootprint: true, activeWavelength: 3.05, onSelectWavelength: () => {}, showLines: true })); }
        export function renderData(props) { return renderToString(createElement(DataNotice, props)); }
        export function render(page, query) {
          const component = ({explorer: Explorer, scene: Scene, learn: Learn, home: Home, targets: Targets, missions: Missions, mission: Missions, experiments: Experiments, library: Library})[page];
          return renderToString(createElement(MemoryRouter, { initialEntries: [page === 'mission' ? '/missions/invisible-universe' : '/view?' + query] }, createElement(Routes, null, createElement(Route, { path: page === 'mission' ? '/missions/:missionId' : '*', element: createElement(component) }))));
        }
      `; }
    }],
    build: { ssr: entry, write: false, rollupOptions: {
      output: { inlineDynamicImports: true, paths: id => pathToFileURL(require.resolve(id)).href }
    } }
  });
  const code = built.output.find(item => item.type === 'chunk').code;
  const { render, renderData, renderMeasured } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const measuredChart = renderMeasured();
  assert.match(measuredChart, /Measured SPHEREx samples wavelength/);
  assert.match(measuredChart, /MJy\/sr/);
  assert.match(measuredChart, /CO2 Ice/);
  assert.doesNotMatch(measuredChart, /arbitrary units|Simulated spectrum/);
  for (const lab of ['redshift', 'dust', 'spectrum']) {
    const experiment = render('experiments', 'lab=' + lab);
    assert.match(experiment, /NOT TELESCOPE DATA/);
    assert.match(experiment, /Interactive model/);
    assert.match(experiment, /0(?:<!-- -->)?3<\/span>Observe/);
    assert.match(experiment, /0(?:<!-- -->)?5<\/span>Reflect/);
    assert.match(experiment, /Learning progress/);

    assert.match(experiment, /Check my thinking/);
  }
  assert.match(render('mission', ''), /Your exploration objectives/);
  assert.match(render('mission', ''), /Complete mission/);
  assert.match(render('missions', ''), /The Invisible Universe/);
  assert.match(render('library', ''), /Write an entry/);
  const frames = ['FIRST_RELEASE', 'SELECTED_RELEASE'].map(release => ({ meta: { release, provenance: 'unWISE-Archive', dataKind: 'observed', epoch: 'unknown', bunit: 'unknown', bandIndex: 1, wavelengthUm: 3.4, width: 512, height: 512, sourceUrl: 'https://unwise.me/cutout_fits' } }));
  const dataPanel = renderData({ frames, activeIndex: 1 });
  assert.match(dataPanel, /SELECTED_RELEASE/);
  assert.doesNotMatch(dataPanel, /FIRST_RELEASE/);
  assert.match(dataPanel, /Not supplied/);
  assert.match(renderData({ frames, mode: 'swipe' }), /FIRST_RELEASE/);
  const realNotice = renderData({ spherex: true, frames: [{ meta: { dataKind: 'observed', provenance: 'SPHEREx / NASA-IPAC IRSA', spectralRange: '1.6301–2.4346 µm', gridWidth: 128, gridHeight: 128, width: 512, height: 512, epoch: '2025-08-15 UTC' } }] });
  assert.match(realNotice, /1.6301–2.4346/);
  assert.match(realNotice, /128 × 128 sky-grid pixels/);
  assert.doesNotMatch(realNotice, /No SPHEREx observations are connected/);
  const learning = render('learn', '');
  assert.match(learning, /NASA/);
  assert.match(learning, /Science behind it/);
  assert.match(learning, /The language of light/);
  assert.equal((learning.match(/class="chapter-progress"/g) || []).length, 5);
  assert.match(learning, /Traveling wave model/);
  assert.match(learning, /glowing dot marks a traveling crest/);
  assert.match(learning, /Assigned false-color scale/);
  assert.match(learning, /Inspect the model dip/);
  assert.match(learning, /SIMULATED DISPLAY COMPARISON/);
  assert.match(learning, /NOT X-RAY DATA/);
  assert.match(learning, /Move the demonstration loupe horizontally/);

  assert.doesNotMatch(learning, /3D SCHEMATIC/);
  assert.match(learning, /Webb NIRCam/);
  assert.match(learning, /Choose an image detail/);
  assert.match(learning, /Cloud edge/);
  assert.match(learning, /no added objects/);
  assert.match(learning, /aria-label="Learning navigation"/);
  for (const step of ['Ask', 'Explore', 'Observe', 'Explain', 'Reflect']) {
    assert.match(learning, new RegExp(`</span>${step}</h3>`));
  }
  assert.equal((learning.match(/id="wave-wavelength"/g) || []).length, 1);
  assert.match(learning, /What changes when a light wave gets longer/);
  assert.match(learning, /Compare your thinking/);
  assert.match(learning, /Longer wavelength means wider peak spacing/);
  assert.doesNotMatch(learning, /does not change a telescope observation/);
  assert.match(learning, /href="#first-lesson"/);
  assert.match(learning, /id="first-lesson"/);
  assert.match(learning, /href="#learning-questions"/);
  assert.match(learning, /id="learning-questions"/);
  assert.match(render('learn', ''), /Schematic, not a physical scale/);
  assert.match(render('home', ''), /Meet the invisible universe/);
  assert.match(render('targets', ''), /Find a starting point/);
  for (const page of ['explorer', 'scene']) {
    assert.match(render(page, 'ra=10.000001&dec=0&fov=5.01&name=Chosen'), /Chosen/);
    assert.match(render(page, ''), /Barnard/);
    assert.match(render(page, ''), /What am I seeing/);
    assert.match(render(page, 'ra=10&dec=91'), /role="alert"/);
    assert.match(render(page, 'ra=10&dec=91'), /invalid sky coordinates/);
  }
});
