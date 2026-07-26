/* ============================================================================
 *  main.js
 *  Einstiegspunkt: wartet auf das DOM und startet das Spiel.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK;

  function boot() {
    // Fehler sichtbar machen, statt still im Menue haengen zu bleiben.
    try {
      global.SnakeIO = new SNK.Game().init();
    } catch (err) {
      const box = global.document.getElementById('bootError');
      if (box) {
        box.style.display = 'block';
        box.textContent = 'Startfehler: ' + (err && err.message ? err.message : err);
      }
      throw err;
    }
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(typeof window !== 'undefined' ? window : this);
