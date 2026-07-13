const MAX_LENGTH = 200;
const ELLIPSIS = '…';

/**
 * A SOP's title: short, human-facing, used for search and display.
 *
 * Authored by the SOP's creator via the Slack modal (see SopController), but
 * the modal is prefilled with a value derived from the source message —
 * SopTitle.deriveFrom() computes that default.
 */
export class SopTitle {
  static deriveFrom(messageText: string): string {
    const firstLine = messageText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
    const collapsed = firstLine.replace(/\s+/g, ' ').trim();
    return SopTitle.#truncate(collapsed);
  }

  static #truncate(text: string): string {
    if (text.length <= MAX_LENGTH) return text;
    const limit = MAX_LENGTH - ELLIPSIS.length;
    const truncated = text.slice(0, limit);
    const lastSpace = truncated.lastIndexOf(' ');
    const atWordBoundary = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
    return `${atWordBoundary}${ELLIPSIS}`;
  }
}
