/**
 * Utility functions for converting between plain text and HTML
 * Used for WooCommerce product descriptions
 */

/**
 * Convert plain text with newlines to HTML paragraphs
 * Each line becomes a paragraph, empty lines create spacing
 */
export function textToHtml(text: string): string {
  if (!text || !text.trim()) return '';
  
  // Split by newlines and wrap each non-empty line in <p> tags
  const lines = text.split('\n');
  const html = lines
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return ''; // Skip empty lines
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join('\n');
  
  return html;
}

/**
 * Convert HTML to plain text with newlines
 * Strips tags and converts block elements to newlines
 */
export function htmlToText(html: string): string {
  if (!html || !html.trim()) return '';
  
  let text = html;
  
  // Replace closing block tags with newlines
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up multiple newlines and trim
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  
  return text;
}
