"use client";

import { useEffect, useRef, useState } from "react";
import type { NearbyServiceCandidate, LogisticsRecommendation } from "@/features/logistics/recommendations";

type Origin = { latitude: number; longitude: number };

export function LogisticsMap({
  origin,
  recommendations,
}: {
  origin: Origin;
  recommendations: LogisticsRecommendation[];
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let active = true;
    let createdMap: import("leaflet").Map | null = null;

    void import("leaflet")
      .then((L) => {
        if (!active || !elementRef.current) return;

        createdMap = L.map(elementRef.current, {
          scrollWheelZoom: false,
          preferCanvas: true,
        });

        const tileUrl =
          process.env.NEXT_PUBLIC_MAP_TILE_URL ||
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

        L.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(createdMap);

        mapRef.current = createdMap;
        layerRef.current = L.layerGroup().addTo(createdMap);
        createdMap.setView([origin.latitude, origin.longitude], 11);
        setReady(true);
      })
      .catch(() => {
        if (active) setMapError("The map could not be loaded. The provider list is still available below.");
      });

    return () => {
      active = false;
      createdMap?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;

    void import("leaflet").then((L) => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();

      const originIcon = L.divIcon({
        className: "farmess-map-marker farmess-map-marker-origin",
        html: '<span aria-hidden="true">Y</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const originMarker = L.marker([origin.latitude, origin.longitude], {
        icon: originIcon,
        title: "Your search origin",
      }).addTo(layer);

      const originPopup = document.createElement("div");
      originPopup.textContent = "Your search origin · used for this search only";
      originMarker.bindPopup(originPopup);

      const bounds = L.latLngBounds([[origin.latitude, origin.longitude]]);
      for (const recommendation of recommendations) {
        const listing = recommendation.listing;
        if (
          !Number.isFinite(listing.latitude) ||
          !Number.isFinite(listing.longitude)
        ) {
          continue;
        }

        const icon = L.divIcon({
          className: "farmess-map-marker",
          html: '<span aria-hidden="true">L</span>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const marker = L.marker([listing.latitude, listing.longitude], {
          icon,
          title: listing.title,
        }).addTo(layer);

        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = listing.title;
        const area = document.createElement("p");
        area.textContent = listing.service_area;
        const distance = document.createElement("p");
        distance.textContent = `${(listing.distance_meters / 1000).toFixed(1)} km straight-line distance`;
        popup.append(title, area, distance);
        marker.bindPopup(popup);

        bounds.extend([listing.latitude, listing.longitude]);
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.18), { maxZoom: 13 });
      } else {
        map.setView([origin.latitude, origin.longitude], 11);
      }
    });
  }, [ready, origin.latitude, origin.longitude, recommendations]);

  return (
    <section className="logistics-map-section" aria-labelledby="logistics-map-heading">
      <div className="logistics-map-heading">
        <div>
          <p className="eyebrow">Locality view</p>
          <h2 id="logistics-map-heading">Nearby provider locations</h2>
          <p>Green pin: your search origin. Dark pin: a provider's published service location.</p>
        </div>
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Report a map issue
        </a>
      </div>
      {mapError ? <p className="form-alert" role="alert">{mapError}</p> : null}
      <div ref={elementRef} className="logistics-map-canvas" role="application" aria-label="Map of nearby provider locations" />
      <p className="logistics-map-attribution">
        Map tiles © OpenStreetMap contributors. Tile service is best-effort and may be unavailable; provider records are sourced from Farmess listings.
      </p>
    </section>
  );
}
