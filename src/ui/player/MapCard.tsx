import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { MAP_TOOLTIP } from '../../app/messages';
import { appStore, playStore } from '../../app/state';
import { useStore } from '../../app/store';
import type { Timeline } from '../../library/types';
import { joinRoute, routeBounds, type LatLon } from '../../sei/route';
import { MapIcon } from '../icons';

const NO_ROUTE: (LatLon[] | undefined)[] = [];

/** The map button in the controls; hidden until the timeline has a GPS point. */
export function MapToggle({ tl }: { tl: Timeline }) {
  const route = useRoute(tl);
  const open = useStore(appStore, (s) => s.mapOpen);
  if (!route.length) return null;
  return (
    <button
      type="button"
      className={`icon-btn${open ? ' is-on' : ''}`}
      aria-pressed={open}
      aria-label="Map"
      title={MAP_TOOLTIP}
      onClick={() => appStore.set((s) => ({ mapOpen: !s.mapOpen }))}
    >
      <MapIcon />
    </button>
  );
}

export function useRoute(tl: Timeline): LatLon[] {
  const parts = useStore(appStore, (s) => s.route[tl.id] ?? NO_ROUTE);
  return useMemo(() => joinRoute(parts), [parts]);
}

const carIcon = L.divIcon({
  className: 'map-car',
  html: '<div class="map-car-arrow"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3 19 20l-7-4-7 4z" fill="#2563eb" stroke-linejoin="round"/></svg></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export function MapCard({ tl }: { tl: Timeline }) {
  const large = useStore(appStore, (s) => s.mapLarge);
  const route = useRoute(tl);
  const lat = useStore(playStore, (s) => s.frame?.lat ?? null);
  const lon = useStore(playStore, (s) => s.frame?.lon ?? null);
  const heading = useStore(playStore, (s) => s.frame?.heading ?? null);

  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const car = useRef<L.Marker | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: false, attributionControl: false });
    L.control.attribution({ prefix: false }).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    line.current = L.polyline([], { color: '#3b82f6', weight: 4, opacity: 0.9 }).addTo(m);
    car.current = L.marker([0, 0], { icon: carIcon, interactive: false, keyboard: false });
    m.on('click', () => appStore.set((s) => ({ mapLarge: !s.mapLarge })));
    m.setView([0, 0], 2);
    map.current = m;
    fitted.current = false;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [tl.id]);

  useEffect(() => {
    const m = map.current;
    if (!m || !line.current) return;
    line.current.setLatLngs(route);
    const b = routeBounds(route);
    if (b && !fitted.current) {
      m.fitBounds(b, { padding: [16, 16], maxZoom: 17 });
      fitted.current = true;
    }
  }, [route]);

  useEffect(() => {
    const m = map.current;
    const c = car.current;
    if (!m || !c || lat === null || lon === null || (lat === 0 && lon === 0)) return;
    c.setLatLng([lat, lon]);
    if (!m.hasLayer(c)) c.addTo(m);
    const arrow = c.getElement()?.querySelector<HTMLElement>('.map-car-arrow');
    if (arrow && heading !== null) arrow.style.transform = `rotate(${heading}deg)`;
    if (!m.getBounds().pad(-0.1).contains([lat, lon])) m.panTo([lat, lon], { animate: true });
  }, [lat, lon, heading]);

  useEffect(() => {
    const t = setTimeout(() => map.current?.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [large]);

  return (
    <div className={`card map-card${large ? ' is-large' : ''}`} aria-label="Route map" role="region" title={large ? 'Click to shrink' : 'Click to enlarge'}>
      <div ref={box} className="map-box" />
    </div>
  );
}
