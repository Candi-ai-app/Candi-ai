/* Minimal ambient types for `leaflet` — the project intentionally does NOT add
   `@types/leaflet` (leaflet is the only new runtime dep allowed for /welcome).
   This declares just the slice of the API the landing page's map backdrop uses,
   so `pnpm build`'s type-check passes without pulling in the full @types package. */
declare module "leaflet" {
  export interface LeafletMap {
    setView(center: [number, number], zoom: number): LeafletMap;
    invalidateSize(animate?: boolean): LeafletMap;
    remove(): void;
  }
  export interface TileLayer {
    addTo(map: LeafletMap): TileLayer;
  }
  export interface MapOptions {
    zoomControl?: boolean;
    attributionControl?: boolean;
    dragging?: boolean;
    scrollWheelZoom?: boolean;
    doubleClickZoom?: boolean;
    boxZoom?: boolean;
    keyboard?: boolean;
    touchZoom?: boolean;
  }
  export interface TileLayerOptions {
    subdomains?: string;
    maxZoom?: number;
    attribution?: string;
  }
  export function map(el: HTMLElement, options?: MapOptions): LeafletMap;
  export function tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;

  const L: {
    map: typeof map;
    tileLayer: typeof tileLayer;
  };
  export default L;
}
