import html2pdf from 'html2pdf.js';

export interface DownloadPdfOptions {
  filename?: string;
  margin?: number | [number, number, number, number];
  orientation?: 'portrait' | 'landscape';
  format?: string;
  scale?: number;
}

/**
 * Downloads an HTML string or element as a high-quality PDF.
 * Ensures proper styling, font rendering, crisp non-empty output, and clean cleanup.
 */
export async function downloadHtmlAsPdf(
  htmlContent: string,
  filename: string,
  options?: DownloadPdfOptions
): Promise<void> {
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const detectedLandscape = options?.orientation === 'landscape' || /size:\s*A4\s+landscape/i.test(htmlContent);
  const orientation = options?.orientation || (detectedLandscape ? 'landscape' : 'portrait');
  const isLandscape = orientation === 'landscape';

  // Normalize margins in mm (default [6, 8, 8, 8] for top, right, bottom, left)
  const marginArray: [number, number, number, number] = Array.isArray(options?.margin)
    ? (options.margin.length === 4 ? (options.margin as [number, number, number, number]) : [6, 8, 8, 8])
    : typeof options?.margin === 'number'
    ? [options.margin, options.margin, options.margin, options.margin]
    : [6, 8, 8, 8];

  const topMarginMm = marginArray[0] ?? 6;
  const rightMarginMm = marginArray[1] ?? 8;
  const bottomMarginMm = marginArray[2] ?? 8;
  const leftMarginMm = marginArray[3] ?? 8;

  // Calculate exact printable width:
  // A4 Portrait = 210mm wide; A4 Landscape = 297mm wide
  // Standard CSS conversion at 96 DPI: 1 inch = 25.4mm => 1mm = 3.779527559px
  const pageWidthMm = isLandscape ? 297 : 210;
  const printableWidthMm = pageWidthMm - (leftMarginMm + rightMarginMm);
  const targetWidthPx = Math.round(printableWidthMm * (96 / 25.4)); // 733px for A4 portrait with 8mm side margins

  // Create an offscreen host wrapper positioned out of view so the user doesn't see a layout flicker.
  // The host holds the container in the DOM so that fonts, styles, and image dimensions can calculate properly.
  const host = document.createElement('div');
  host.id = `pdf-export-host-${Date.now()}`;
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${targetWidthPx}px`;
  host.style.height = 'auto';
  host.style.overflow = 'visible';
  host.style.zIndex = '-99999';
  host.style.pointerEvents = 'none';

  // Inside the offscreen host, the target container itself MUST have:
  // 1. opacity: 1 (NEVER < 1, because html2canvas multiplies opacity, resulting in invisible blank pages)
  // 2. position: relative or static (NEVER position: fixed, which breaks page flow & height calculation in html2pdf)
  // 3. zIndex: 1 (NEVER negative z-index)
  // 4. width matching exact printable dimensions (733px for 194mm printable A4 width)
  const container = document.createElement('div');
  container.id = `pdf-export-container-${Date.now()}`;
  container.style.position = 'relative';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = `${targetWidthPx}px`;
  container.style.maxWidth = `${targetWidthPx}px`;
  container.style.minHeight = '100px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';
  container.style.opacity = '1';
  container.style.margin = '0';
  container.style.padding = '0';
  container.style.boxSizing = 'border-box';

  // Extract <style> and <link rel="stylesheet"> blocks from htmlContent
  const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const linkMatches = htmlContent.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
  let stylesCombined = styleMatches.join('\n');
  let linksCombined = linkMatches.join('\n');

  // Ensure Google Fonts link is included if not already present
  if (!linksCombined.includes('fonts.googleapis.com')) {
    linksCombined += `\n<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Cinzel:wght@700;800;900&family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap">`;
  }

  // Ensure body styles also apply to .pdf-export-wrapper, stripping outer padding so jsPDF margins govern the page cleanly
  stylesCombined = stylesCombined
    .replace(/\b(body|html)\s*\{([^}]*)\}/gi, (_match, tag, bodyProps) => {
      const cleanProps = bodyProps.replace(/padding\s*:[^;]+;?/gi, 'padding: 0 !important;');
      return `${tag}, .pdf-export-wrapper { ${cleanProps} }`;
    });

  // Extract body content or clean HTML if full page markup is provided
  let bodyContent = htmlContent;
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    bodyContent = bodyMatch[1];
  } else {
    // Remove DOCTYPE, html, head tags if present
    bodyContent = htmlContent
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<html[^>]*>/gi, '')
      .replace(/<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  }

  // Base PDF layout rules:
  // Includes embedded @font-face rules so html2canvas renders Cinzel, Carlito, and Plus Jakarta Sans without CORS rejection
  const basePdfStyles = `
    <style>
      @font-face {
        font-family: 'Cinzel';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-jHgTYo.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Cinzel';
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-lbgTYo.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Cinzel';
        font-style: normal;
        font-weight: 900;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-n_gTYo.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Carlito';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/carlito/v4/3Jn9SDPw3m-pk039PDA.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Carlito';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/carlito/v4/3Jn4SDPw3m-pk039BIykaX0.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Plus Jakarta Sans';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qU7NSg.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Plus Jakarta Sans';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_d0nNSg.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Plus Jakarta Sans';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_TknNSg.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Plus Jakarta Sans';
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_KUnNSg.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Plus Jakarta Sans';
        font-style: normal;
        font-weight: 900;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_KUnNSg.ttf) format('truetype');
      }

      .pdf-export-wrapper {
        box-sizing: border-box !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        min-height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        opacity: 1 !important;
        visibility: visible !important;
        background-color: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pdf-export-wrapper * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pdf-export-wrapper tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-export-wrapper thead {
        display: table-header-group !important;
      }
      .pdf-export-wrapper tfoot {
        display: table-footer-group !important;
      }
      .avoid-break, .header-banner, .net-balance-banner, .signatures-block, .summary-cards-table,
      .terms-section, .footer, .quotation-signatures, .totals-table, .totals-box, .notes-section, .ledger-software-credit {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    </style>
  `;

  container.innerHTML = `
    ${linksCombined}
    ${basePdfStyles}
    ${stylesCombined}
    <div class="pdf-export-wrapper" style="background-color: #ffffff; color: inherit; padding: 0; margin: 0; box-sizing: border-box; width: 100%; max-width: 100%; height: auto; min-height: auto;">
      ${bodyContent}
    </div>
  `;

  host.appendChild(container);
  document.body.appendChild(host);

  try {
    // Wait for any embedded images (logos, stamps) to load with a timeout safety
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map((img) => {
          if (!img.crossOrigin) {
            img.crossOrigin = 'anonymous';
          }
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            const timeout = setTimeout(resolve, 2000);
            img.onload = () => {
              clearTimeout(timeout);
              resolve(null);
            };
            img.onerror = () => {
              clearTimeout(timeout);
              resolve(null);
            };
          });
        })
      );
    }

    // Wait for custom web fonts (Cinzel, Plus Jakarta Sans, Carlito) to be fully loaded and rendered
    if ((document as any).fonts) {
      try {
        await Promise.allSettled([
          (document as any).fonts.load('900 36px Cinzel'),
          (document as any).fonts.load('800 36px Cinzel'),
          (document as any).fonts.load('700 36px Cinzel'),
          (document as any).fonts.load('700 16px Carlito'),
          (document as any).fonts.load('400 16px Carlito'),
          (document as any).fonts.load('900 14px "Plus Jakarta Sans"'),
          (document as any).fonts.load('800 14px "Plus Jakarta Sans"'),
          (document as any).fonts.load('700 14px "Plus Jakarta Sans"'),
          (document as any).fonts.load('600 14px "Plus Jakarta Sans"'),
          (document as any).fonts.load('400 14px "Plus Jakarta Sans"'),
          (document as any).fonts.ready
        ]);
      } catch {
        // Fallback gracefully if fonts reject
      }
    }

    // Delay to allow fonts and CSS layout to fully compute
    await new Promise((resolve) => setTimeout(resolve, 250));

    const html2pdfLib: any = (html2pdf as any)?.default || html2pdf || (window as any).html2pdf;
    const measuredWidth = targetWidthPx;

    const opt = {
      margin: [topMarginMm, rightMarginMm, bottomMarginMm, leftMarginMm],
      filename: safeFilename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: options?.scale ?? 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: measuredWidth,
        windowWidth: measuredWidth,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: {
        unit: 'mm',
        format: options?.format ?? 'a4',
        orientation: isLandscape ? 'landscape' : 'portrait'
      },
      pagebreak: { 
        mode: ['css', 'legacy'],
        avoid: [
          'tr',
          '.avoid-break',
          '.summary-card',
          '.summary-cards-table',
          '.net-balance-banner',
          '.signatures-block',
          '.terms-section',
          '.footer',
          '.quotation-signatures',
          '.totals-table',
          '.totals-box',
          '.notes-section',
          '.ledger-software-credit'
        ]
      }
    };

    await html2pdfLib().set(opt).from(container).save();
  } catch (error) {
    console.error('Failed to generate PDF via html2pdf:', error);
    throw error;
  } finally {
    if (document.body.contains(host)) {
      document.body.removeChild(host);
    }
  }
}

