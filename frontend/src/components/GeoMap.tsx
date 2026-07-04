import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "./leafletIconFix";

import L from "leaflet";
import "leaflet-draw";
import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, Rectangle, TileLayer, useMap } from "react-leaflet";
import * as wellknown from "wellknown";
import type { BBox, GeoFeature } from "../types";

function DrawControl({ onBBoxDrawn }: { onBBoxDrawn: (bbox: BBox) => void }) {
  const map = useMap();

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        rectangle: {
          shapeOptions: { color: "#2563eb" },
        },
        polygon: false,
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    const handleCreated = (e: L.LeafletEvent) => {
      const layer = (e as L.DrawEvents.Created).layer as L.Rectangle;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);
      const bounds = layer.getBounds();
      onBBoxDrawn({
        min_lon: bounds.getWest(),
        max_lon: bounds.getEast(),
        min_lat: bounds.getSouth(),
        max_lat: bounds.getNorth(),
      });
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onBBoxDrawn]);

  return null;
}

function FitToData({ geojson, bbox }: { geojson: GeoJSON.FeatureCollection; bbox?: BBox | null }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.geoJSON(geojson).getBounds();
    if (bbox) {
      bounds.extend([
        [bbox.min_lat, bbox.min_lon],
        [bbox.max_lat, bbox.max_lon],
      ]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, bbox]);
  return null;
}

export default function GeoMap({
  features: geoFeatures,
  bbox,
  onBBoxDrawn,
}: {
  features: GeoFeature[];
  bbox?: BBox | null;
  onBBoxDrawn?: (bbox: BBox) => void;
}) {
  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const f of geoFeatures) {
      try {
        const geometry = wellknown.parse(f.wkt);
        if (!geometry) continue;
        features.push({
          type: "Feature",
          geometry: geometry as GeoJSON.Geometry,
          properties: { rowIndex: f.rowIndex },
        });
      } catch {
        // skip unparsable geometry
      }
    }
    return { type: "FeatureCollection", features };
  }, [geoFeatures]);

  return (
    <MapContainer
      className="leaflet-map"
      center={[20, 0]}
      zoom={2}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {featureCollection.features.length > 0 && (
        <GeoJSON
          key={featureCollection.features.length}
          data={featureCollection}
          pointToLayer={(_feature, latlng) => L.marker(latlng)}
          onEachFeature={(feature, layer) => {
            const rowIndex = feature.properties?.rowIndex;
            if (rowIndex !== undefined) layer.bindPopup(`Row #${rowIndex}`);
          }}
        />
      )}
      {bbox && (
        <Rectangle
          bounds={[
            [bbox.min_lat, bbox.min_lon],
            [bbox.max_lat, bbox.max_lon],
          ]}
          pathOptions={{ color: "#e11d48", weight: 2, fill: false }}
        />
      )}
      <FitToData geojson={featureCollection} bbox={bbox} />
      {onBBoxDrawn && <DrawControl onBBoxDrawn={onBBoxDrawn} />}
    </MapContainer>
  );
}
