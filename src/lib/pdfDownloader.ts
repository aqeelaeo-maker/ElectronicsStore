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
  const a4WidthPx = isLandscape ? 1123 : 794;

  // Create an offscreen host wrapper positioned out of view so the user doesn't see a layout flicker.
  // The host holds the container in the DOM so that fonts, styles, and image dimensions can calculate properly.
  const host = document.createElement('div');
  host.id = `pdf-export-host-${Date.now()}`;
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${a4WidthPx}px`;
  host.style.height = 'auto';
  host.style.overflow = 'visible';
  host.style.zIndex = '-99999';
  host.style.pointerEvents = 'none';

  // Inside the offscreen host, the target container itself MUST have:
  // 1. opacity: 1 (NEVER < 1, because html2canvas multiplies opacity, resulting in invisible blank pages)
  // 2. position: relative or static (NEVER position: fixed, which breaks page flow & height calculation in html2pdf)
  // 3. zIndex: 1 (NEVER negative z-index)
  // 4. width matching standard A4 dimensions (794px portrait, 1123px landscape)
  const container = document.createElement('div');
  container.id = `pdf-export-container-${Date.now()}`;
  container.style.position = 'relative';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = `${a4WidthPx}px`;
  container.style.maxWidth = `${a4WidthPx}px`;
  container.style.minHeight = '100px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';
  container.style.opacity = '1';
  container.style.margin = '0';
  container.style.padding = '0';
  container.style.boxSizing = 'border-box';

  // Extract <style> blocks from htmlContent
  const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  let stylesCombined = styleMatches.join('\n');

  // Ensure body styles also apply to .pdf-export-wrapper
  stylesCombined = stylesCombined.replace(/\bbody\s*\{/gi, 'body, .pdf-export-wrapper {');

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

  // Base PDF layout and typography rules to guarantee visibility and clean pagination
  const basePdfStyles = `
    <style>
      .pdf-export-wrapper, body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        color: #0f172a !important;
        background-color: #ffffff !important;
        box-sizing: border-box !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        opacity: 1 !important;
        visibility: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pdf-export-wrapper * {
        box-sizing: border-box !important;
      }
      table {
        width: 100% !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        page-break-inside: auto !important;
        box-sizing: border-box !important;
      }
      th, td {
        box-sizing: border-box !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      thead {
        display: table-header-group !important;
      }
      tfoot {
        display: table-footer-group !important;
      }
      .avoid-break, .header-banner, .net-balance-banner, .signatures-block, .summary-cards-grid {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    </style>
  `;

  container.innerHTML = `
    ${basePdfStyles}
    ${stylesCombined}
    <div class="pdf-export-wrapper" style="background-color: #ffffff; color: #000000; padding: 0; margin: 0; box-sizing: border-box; width: 100%; max-width: 100%;">
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

    // Delay to allow fonts and CSS layout to fully compute
    await new Promise((resolve) => setTimeout(resolve, 200));

    const html2pdfLib: any = (html2pdf as any)?.default || html2pdf || (window as any).html2pdf;
    const measuredWidth = Math.max(a4WidthPx, container.offsetWidth || 0, container.scrollWidth || 0);

    const opt = {
      margin: options?.margin ?? [6, 6, 6, 6],
      filename: safeFilename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: options?.scale ?? 2,
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
        avoid: ['tr', '.avoid-break', '.summary-card', '.net-balance-banner', '.signatures-block']
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

