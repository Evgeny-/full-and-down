import './logo.css';
import { wordmarkSvg } from './logoArtwork';

export { discSvg, emblemSvg, iconFile, wordmarkSvg } from './logoArtwork';

/** The outlined Full & Down name; the F/D monogram is reserved for standalone icons. */
export function wordmark(): string {
  return `<span class="wordmark brand-lockup" role="img" aria-label="Full &amp; Down">${wordmarkSvg()}</span>`;
}
