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
 * Ensures proper styling, font rendering, and clean cleanup.
 */
export async function downloadHtmlAsPdf(
  htmlContent: string,
  filename: string,
  options?: DownloadPdfOptions
): Promise<void> {
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  // Create a container with opacity instead of negative coordinates so html2canvas computes accurate geometry
  const container = document.createElement('div');
  container.id = `pdf-export-container-${Date.now()}`;
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = options?.orientation === 'landscape' ? '1123px' : '794px'; // standard A4 width
  container.style.opacity = '0.01';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-99999';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';

  // Extract <style> blocks and body contents to ensure CSS applies properly
  const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const stylesCombined = styleMatches.join('\n');
  
  // Extract body content or use full content if not a full HTML page
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

  container.innerHTML = `
    ${stylesCombined}
    <div class="pdf-export-wrapper" style="background-color: #ffffff; color: #000000; padding: 0; margin: 0; box-sizing: border-box; width: 100%;">
      ${bodyContent}
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Wait for any embedded images (logos, stamps) to load
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );
    }

    // Small delay to allow fonts and CSS layout to settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    const html2pdfLib: any = (html2pdf as any)?.default || html2pdf || (window as any).html2pdf;

    const opt = {
      margin: options?.margin ?? [6, 8, 6, 8],
      filename: safeFilename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: options?.scale ?? 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#ffffff'
      },
      jsPDF: {
        unit: 'mm',
        format: options?.format ?? 'a4',
        orientation: options?.orientation ?? 'portrait'
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    await html2pdfLib().set(opt).from(container).save();
  } catch (error) {
    console.error('Failed to generate PDF via html2pdf:', error);
    throw error;
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
