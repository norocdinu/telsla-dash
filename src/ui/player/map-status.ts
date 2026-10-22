/**
 * The map's tiles come from OpenStreetMap, so the map is the one part that needs internet. It counts as offline
 * when the browser says so, or when its tiles fail and none has loaded.
 */
export function mapOffline(s: { online: boolean; tilesLoaded: number; tileErrors: number }): boolean {
  return !s.online || (s.tileErrors > 0 && s.tilesLoaded === 0);
}
