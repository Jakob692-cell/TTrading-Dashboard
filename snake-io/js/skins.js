/* ============================================================================
 *  skins.js
 *  Skin-Definitionen. Ein Skin ist eine Farbliste, die in Baendern entlang
 *  des Koerpers wiederholt wird.
 *
 *  band     : Anzahl Segmente pro Farbband (kleiner = feineres Muster)
 *  scroll   : Baender pro Sekunde – 0 = statisch, >0 = animiertes Muster
 *  glow     : Farbe des Aussenleuchtens
 *  outline  : Umrandungsfarbe (Standard: sehr dunkles Blau)
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});

  const DEFAULT_OUTLINE = '#080b13';

  /** Kleiner Fabrik-Helfer, damit die Liste kompakt bleibt. */
  function skin(id, name, band, scroll, colors, glow, outline) {
    return {
      id: id,
      name: name,
      band: band,
      scroll: scroll || 0,
      colors: colors,
      glow: glow || colors[0],
      outline: outline || DEFAULT_OUTLINE
    };
  }

  /** 12-stufiger Regenbogen. */
  const RAINBOW = [
    '#ff3b5c', '#ff7a2f', '#ffc22e', '#d8ff3a', '#6bff4d', '#2fffa3',
    '#33f0ff', '#3aa8ff', '#5c6cff', '#9b4dff', '#dd3dff', '#ff36a8'
  ];

  const SKINS = [
    skin('aqua', 'Neon Aqua', 4, 0,
      ['#1ce6d6', '#12b8c9', '#0e8fb8', '#12b8c9'], '#2ff6e4'),

    skin('rainbow', 'Regenbogen', 3, 2.6, RAINBOW, '#ff6bd6'),

    skin('fire', 'Feuer', 3, 3.4,
      ['#fff3a0', '#ffc233', '#ff8a1f', '#ff4d18', '#c81f0f', '#ff8a1f'], '#ff8a1f'),

    skin('ice', 'Eis', 4, 0,
      ['#eafcff', '#b6ecff', '#7fd4ff', '#4fb2f5', '#7fd4ff'], '#a9e9ff'),

    skin('gold', 'Gold', 3, 1.1,
      ['#fff5c2', '#ffe17a', '#f5c022', '#c98f0d', '#f5c022', '#ffe17a'], '#ffd54a'),

    skin('cyber', 'Cyber', 3, 1.8,
      ['#00f0ff', '#0b1a2a', '#b14dff', '#0b1a2a'], '#00f0ff'),

    skin('galaxy', 'Galaxy', 5, 0.5,
      ['#1a1040', '#3d1f7a', '#7a3fd6', '#c86bff', '#f0e6ff', '#7a3fd6'], '#b96bff'),

    skin('lava', 'Lava', 4, 2.2,
      ['#1a0806', '#5c1206', '#c22a08', '#ff6a12', '#ffd24a', '#c22a08'], '#ff6a12'),

    skin('emerald', 'Emerald', 4, 0,
      ['#d6ffe9', '#4dffa3', '#12c46e', '#0a7d49', '#12c46e'], '#3affa0'),

    skin('diamond', 'Diamond', 3, 1.4,
      ['#ffffff', '#dff6ff', '#a8ddf5', '#dff6ff'], '#ffffff'),

    skin('toxic', 'Toxic', 3, 1.6,
      ['#c6ff2e', '#7ab80f', '#141a08', '#7ab80f'], '#c6ff2e'),

    skin('sunset', 'Sunset', 5, 0.7,
      ['#ffd66b', '#ff9448', '#ff5a7a', '#c94bd6', '#6b4bd6', '#ff5a7a'], '#ff7a5c'),

    skin('ocean', 'Ocean', 5, 0.4,
      ['#0a2a4a', '#1157a0', '#1f9ad6', '#5fd6e6', '#1f9ad6'], '#3fc4e6'),

    skin('blood', 'Blood', 4, 0,
      ['#2a0508', '#7a0d18', '#c41230', '#ff3b52', '#c41230'], '#ff2f4a'),

    skin('void', 'Void', 4, 0.9,
      ['#05050a', '#1a0f33', '#3d1f66', '#6b2fb8', '#3d1f66'], '#8a3fff'),

    skin('candy', 'Candy', 3, 1.2,
      ['#ffffff', '#ff8fc4', '#ff4fa3', '#ff8fc4'], '#ff7ec0'),

    skin('matrix', 'Matrix', 2, 4.2,
      ['#0a1a0c', '#1f6b2a', '#3fd64f', '#c2ffc9', '#3fd64f', '#1f6b2a'], '#3fd64f'),

    skin('plasma', 'Plasma', 3, 3.0,
      ['#ff2ed6', '#8a2eff', '#2e6bff', '#2ed6ff', '#8a2eff'], '#c22eff'),

    skin('bumble', 'Bumblebee', 3, 0,
      ['#ffd21f', '#141208', '#ffd21f', '#141208'], '#ffd21f'),

    skin('aurora', 'Aurora', 5, 1.0,
      ['#0d2a33', '#1fd6a8', '#7affd6', '#5c8aff', '#a86bff', '#1fd6a8'], '#5fffd0'),

    skin('magma', 'Magma Core', 3, 2.8,
      ['#0f0f12', '#3d0f0a', '#ff4a12', '#ffd66b', '#ff4a12', '#3d0f0a'], '#ff6a2f'),

    skin('frost', 'Frostbite', 4, 0.6,
      ['#f0f8ff', '#8fd0ff', '#4f7ae6', '#6b4fd6', '#4f7ae6'], '#8fd0ff'),

    skin('radiant', 'Radiant', 3, 1.5,
      ['#ffffff', '#fff0b8', '#ffd45c', '#ffb02e', '#ffd45c'], '#fff0b8'),

    skin('nebula', 'Nebula Drift', 4, 1.9,
      ['#2a1040', '#7a2fb8', '#e64fb8', '#4f8aff', '#7a2fb8'], '#e64fb8'),

    skin('circuit', 'Circuit', 2, 2.4,
      ['#08181a', '#0f3d3a', '#1fd6b8', '#c6ff4a', '#1fd6b8', '#0f3d3a'], '#1fd6b8'),

    skin('shadow', 'Shadow', 4, 0,
      ['#0a0a0f', '#1a1a26', '#2e2e42', '#4a4a66', '#2e2e42'], '#5c5c8a'),

    skin('coral', 'Coral Reef', 4, 0.8,
      ['#ff7a5c', '#ffd166', '#2fd6c4', '#3f8ae6', '#2fd6c4'], '#ff9a7a'),

    skin('venom', 'Venom', 3, 1.3,
      ['#1a0a2e', '#5c1fb8', '#a64fff', '#d6ff2e', '#a64fff'], '#b86bff')
  ];

  /** Farbe eines Segments – mit animiertem Bandversatz. */
  function colorAt(skinDef, index, offset) {
    const band = skinDef.band;
    const cols = skinDef.colors;
    let i = ((index / band) | 0) + offset;
    i %= cols.length;
    if (i < 0) i += cols.length;
    return cols[i];
  }

  /** CSS-Gradient fuer die Skin-Vorschau im Menue. */
  function previewGradient(skinDef) {
    const c = skinDef.colors;
    const stops = [];
    for (let i = 0; i < c.length; i++) {
      stops.push(c[i] + ' ' + Math.round((i / c.length) * 100) + '%');
      stops.push(c[i] + ' ' + Math.round(((i + 1) / c.length) * 100) + '%');
    }
    return 'linear-gradient(135deg,' + stops.join(',') + ')';
  }

  SNK.SKINS = SKINS;
  SNK.skinColorAt = colorAt;
  SNK.skinPreview = previewGradient;

  /** Sicherer Zugriff per Index. */
  SNK.skinByIndex = function (i) {
    if (typeof i !== 'number' || !isFinite(i)) return SKINS[0];
    const n = ((i % SKINS.length) + SKINS.length) % SKINS.length;
    return SKINS[n | 0];
  };

})(typeof window !== 'undefined' ? window : this);
