/**
 * Convert HTML string to PDF buffer using Playwright.
 * Launches headless browser, loads HTML, and generates PDF.
 * 
 * Note: Playwright is dynamically imported to avoid loading it during Next.js startup,
 * which significantly speeds up dev server startup time.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  // Dynamic import to avoid loading playwright during Next.js startup
  // This is a huge package (hundreds of MB) and would slow down dev server
  const { chromium } = await import("playwright");
  
  let browser;
  
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
    });

    // Create a new page
    const page = await browser.newPage();

    // Set content from HTML string
    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    // Format date for footer
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).replace(/\//g, ".");

    // Generate PDF with A4 size and proper margins
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "0.5in",
        right: "0.5in",
        bottom: "0.8in", // Extra bottom margin for footer
        left: "0.5in",
      },
      printBackground: true, // Include background colors/images
      displayHeaderFooter: true,
      headerTemplate: '<div></div>', // Empty header
      footerTemplate: `
        <div style="font-size: 10px; color: #888; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 20mm; border-top: 1px solid #e2e8f0; padding-top: 8px;">
          <span style="flex: 1; text-align: left;">${date}</span>
          <span style="flex: 1; text-align: right;">Page <span class="pageNumber"></span></span>
        </div>
      `,
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[htmlToPdf] Error generating PDF:", error);
    }
    
    if (error instanceof Error) {
      throw new Error(`PDF generation failed: ${error.message}`);
    }
    
    throw new Error("PDF generation failed with unknown error");
  } finally {
    // Clean up browser
    if (browser) {
      await browser.close();
    }
  }
}


