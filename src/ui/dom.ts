export const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function icon(name: string, size = 18): string {
  const paths: Record<string,string> = {
    play:'<path d="m8 5 11 7-11 7z"/>', pause:'<path d="M8 5v14M16 5v14"/>', step:'<path d="m5 5 10 7-10 7zM19 5v14"/>',
    reset:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>', chip:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4M9 9h6v6H9z"/>',
    robot:'<path d="M8 5h8l3 4v10H5V9zM12 2v3M2 10v7m20-7v7M8 22v-3m8 3v-3M8 10h2m4 0h2M8 15h8"/>',
    battle:'<path d="m4 3 7 7-3 3-5-8zM20 3l-7 7 3 3 5-8zM6 14l4 4m4-4 4 4M5 19l4-4m6 0 4 4M4 20l1-1m14 0 1 1"/>',
    sound:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>', mute:'<path d="M4 9h4l5-4v14l-5-4H4zM17 9l6 6m0-6-6 6"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01"/>', plus:'<path d="M12 5v14M5 12h14"/>', copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>', trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>', undo:'<path d="m4 4 0 7 7 0M4 11c4-9 16-7 16 2a7 7 0 0 1-7 7"/>', arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chip}</svg>`;
}
export function robotMark(frame: string, color = 'currentColor'): string {
  const body = frame === 'scout' ? 'M17 4 35 8 41 20 35 32 17 36 10 20Z' : frame === 'fortress' ? 'M12 5 35 5 41 11 41 29 35 35 12 35 7 28 7 12Z' : 'M14 7 35 7 40 14 40 26 35 33 14 33 8 26 8 14Z';
  return `<svg class="robot-mark" viewBox="0 0 50 40" fill="none" aria-hidden="true"><path d="M10 1h26v5H10zM10 34h26v5H10z" fill="#2d414f" stroke="${color}"/><path d="${body}" fill="#273b49" stroke="${color}"/><path d="M20 14h12v12H20z" fill="${color}" opacity=".8"/><path d="m44 17 5 3-5 3" stroke="${color}"/></svg>`;
}
