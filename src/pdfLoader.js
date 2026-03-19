/**
 * pdfLoader.js
 * Carga un PDF y rasteriZa sus páginas como ImageBitmap o DataURL
 * para usar como texturas en Three.js.
 */

;(function(global) {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const RENDER_SCALE = 2.0; // Escala para mayor calidad

  /**
   * Carga un PDF desde un ArrayBuffer y renderiza todas las páginas.
   * @param {ArrayBuffer} buffer
   * @param {function} onProgress - callback(loaded, total, label)
   * @returns {Promise<{pages: string[], width: number, height: number, title: string}>}
   */
  async function loadPDFFromBuffer(buffer, onProgress) {
    const pdf = await pdfjsLib.getDocument({
      data: buffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    }).promise;

    const total = pdf.numPages;

    // Extraer título
    let title = 'Libro sin título';
    try {
      const meta = await pdf.getMetadata();
      if (meta && meta.info && meta.info.Title) title = meta.info.Title;
    } catch(_) {}

    // Obtener dimensiones de la primera página
    const firstPage = await pdf.getPage(1);
    const vp = firstPage.getViewport({ scale: RENDER_SCALE });
    const pageWidth = vp.width;
    const pageHeight = vp.height;

    // Renderizar todas las páginas en batches
    const pages = [];
    const BATCH = 4;

    for (let i = 1; i <= total; i += BATCH) {
      const batch = [];
      for (let j = i; j < i + BATCH && j <= total; j++) {
        batch.push(renderPage(pdf, j, RENDER_SCALE));
      }
      const results = await Promise.all(batch);
      pages.push(...results);

      const loaded = Math.min(i + BATCH - 1, total);
      if (onProgress) onProgress(loaded, total, `Renderizando página ${loaded} de ${total}…`);
    }

    return { pages, width: pageWidth, height: pageHeight, title };
  }

  /**
   * Renderiza una página individual a DataURL.
   */
  async function renderPage(pdf, pageNum, scale) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  /**
   * Crea una textura THREE.js desde un DataURL.
   */
  function createTexture(dataURL) {
    return new Promise(resolve => {
      const loader = new THREE.TextureLoader();
      loader.load(dataURL, tex => {
        tex.encoding = THREE.sRGBEncoding;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8; // se establece externamente si el renderer lo soporta
        resolve(tex);
      });
    });
  }

  // Exportar
  global.PDFLoader = { loadPDFFromBuffer, createTexture };

})(window);
