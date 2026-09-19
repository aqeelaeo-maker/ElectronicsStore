declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | [number, number] | [number, number, number, number];
    filename?: string;
    image?: { type?: 'jpeg' | 'png' | 'webp' | string; quality?: number };
    enableLinks?: boolean;
    html2canvas?: {
      scale?: number;
      useCORS?: boolean;
      letterRendering?: boolean;
      allowTaint?: boolean;
      logging?: boolean;
      scrollX?: number;
      scrollY?: number;
      windowWidth?: number;
      [key: string]: any;
    };
    jsPDF?: {
      unit?: string;
      format?: string | [number, number];
      orientation?: 'portrait' | 'landscape';
      compress?: boolean;
      [key: string]: any;
    };
    pagebreak?: {
      mode?: string | string[];
      before?: string | string[];
      after?: string | string[];
      avoid?: string | string[];
    };
  }

  interface Html2PdfWorker {
    from(src: HTMLElement | string): Html2PdfWorker;
    set(opt: Html2PdfOptions): Html2PdfWorker;
    toContainer(): Html2PdfWorker;
    toCanvas(): Html2PdfWorker;
    toImg(): Html2PdfWorker;
    toPdf(): Html2PdfWorker;
    save(filename?: string): Promise<void>;
    output(type?: string, options?: any): Promise<any>;
    then(onFulfilled?: () => any, onRejected?: (err: any) => any): Promise<any>;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(element: HTMLElement | string, options?: Html2PdfOptions): Html2PdfWorker;

  export default html2pdf;
}
