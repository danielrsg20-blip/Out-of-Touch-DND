import { useMemo, useRef, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useOverlayStore } from "../../stores/overlayStore";
import { callBackendApi } from "../../lib/backendApi";
import {
  applyBattlemapResponseToMap,
  extractTraversalGridFromPayload,
  resolveBattlemapId,
} from "../../lib/battlemapState";
import "./panels.css";

type BusyMode =
  | "generate"
  | "same_settings"
  | "new_seed"
  | "traversal_only"
  | null;

type BattlemapRegenerationMode =
  | "same_settings"
  | "new_seed"
  | "traversal_only";

const SCENE_LOCATIONS = new Set([
  "forest",
  "swamp",
  "dungeon",
  "city_alley",
  "tavern",
  "ruins",
  "mountain",
  "coastal",
]);

const SCENE_BIOMES = new Set([
  "temperate",
  "tropical",
  "arctic",
  "underground",
  "urban",
  "magical",
]);
const ENCOUNTER_TYPES = new Set([
  "ambush",
  "siege",
  "chase",
  "investigation",
  "diplomacy",
  "exploration",
]);

function sanitizeLocation(value: unknown): string {
  const location = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SCENE_LOCATIONS.has(location) ? location : "forest";
}

function inferBiome(location: string): string {
  if (location === "dungeon" || location === "ruins") return "underground";
  if (location === "city_alley" || location === "tavern") return "urban";
  if (location === "coastal") return "temperate";
  if (location === "mountain") return "arctic";
  return "temperate";
}

function sanitizeEncounterType(value: unknown): string {
  const encounterType =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return ENCOUNTER_TYPES.has(encounterType) ? encounterType : "exploration";
}

export default function BattlemapActions() {
  const map = useGameStore((s) => s.map);
  const setMap = useGameStore((s) => s.setMap);
  const addNarrative = useGameStore((s) => s.addNarrative);
  const setTraversalGrid = useOverlayStore((s) => s.setTraversalGrid);
  const roomCode = useSessionStore((s) => s.roomCode);
  const campaignTone = useSessionStore((s) => s.campaignTone);
  const qualityMode = useSessionStore((s) => s.battlemapQualityMode);
  const setQualityMode = useSessionStore((s) => s.setBattlemapQualityMode);

  const [busyMode, setBusyMode] = useState<BusyMode>(null);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "downloading" | "done" | "failed"
  >("idle");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const battlemapId = useMemo(() => resolveBattlemapId(map), [map]);
  const mapImageUrl =
    typeof map?.metadata?.image_url === "string"
      ? map.metadata.image_url.trim()
      : "";

  const sceneSpec = useMemo(() => {
    // Prefer new location field; fall back to sanitized environment for backward compat.
    const location = sanitizeLocation(
      map?.metadata?.location ?? map?.metadata?.environment,
    );
    const inferredBiome = inferBiome(location);
    const rawBiome =
      typeof map?.metadata?.biome === "string"
        ? map.metadata.biome.trim().toLowerCase()
        : "";
    const biome = SCENE_BIOMES.has(rawBiome) ? rawBiome : inferredBiome;

    const rawMood =
      typeof map?.metadata?.mood_style === "string"
        ? map.metadata.mood_style.trim().toLowerCase()
        : "";
    const MOOD_STYLES = new Set([
      "hand-drawn",
      "painterly",
      "parchment",
      "gritty",
      "high-fantasy",
      "realistic",
    ]);
    const mood_style = MOOD_STYLES.has(rawMood) ? rawMood : "high-fantasy";

    const widthFeet = Math.max(20, (map?.width ?? 30) * 5);
    const heightFeet = Math.max(20, (map?.height ?? 21) * 5);

    // Prefer notable_features from metadata; fall back to tactical_tags for old sessions.
    const notableFeatures = Array.isArray(map?.metadata?.notable_features)
      ? map.metadata.notable_features
      : undefined;
    const tacticalTags = Array.isArray(map?.metadata?.tactical_tags)
      ? map.metadata.tactical_tags
      : undefined;
    const features = (notableFeatures ?? tacticalTags ?? []).slice(0, 6);

    const rawDescription =
      typeof map?.metadata?.description === "string"
        ? map.metadata.description.trim()
        : "";

    return {
      location,
      biome,
      encounter_type: sanitizeEncounterType(map?.metadata?.encounter_type),
      mood_style,
      map_width_feet: widthFeet,
      map_height_feet: heightFeet,
      notable_features: features,
      campaign_tone: campaignTone ?? undefined,
      ...(rawDescription ? { description: rawDescription } : {}),
    };
  }, [campaignTone, map]);

  async function applyPayload(
    payload: Record<string, unknown>,
    verb: string,
  ): Promise<void> {
    const nextMap = applyBattlemapResponseToMap(map, payload);
    if (nextMap) {
      setMap(nextMap);
    }

    const traversal = extractTraversalGridFromPayload(payload);
    if (traversal) {
      setTraversalGrid(traversal);
    }

    const timing = payload.generation_timing as
      | Record<string, unknown>
      | undefined;
    const audit =
      payload.battlemap_asset && typeof payload.battlemap_asset === "object"
        ? (payload.battlemap_asset as Record<string, unknown>).generation_audit
        : undefined;
    const resolvedQualityMode =
      audit &&
      typeof audit === "object" &&
      typeof (audit as Record<string, unknown>).quality_mode === "string"
        ? (audit as Record<string, unknown>).quality_mode
        : qualityMode;
    const totalMs =
      typeof timing?.total_ms === "number" ? timing.total_ms : null;
    const stageBreakdown = timing?.stage_breakdown_ms as
      | Record<string, unknown>
      | undefined;
    const requestPrepMs =
      typeof stageBreakdown?.request_prep_ms === "number"
        ? Math.round(stageBreakdown.request_prep_ms)
        : null;
    const imageUploadMs =
      typeof stageBreakdown?.image_upload_ms === "number"
        ? Math.round(stageBreakdown.image_upload_ms)
        : null;
    const assetPersistMs =
      typeof stageBreakdown?.asset_persist_ms === "number"
        ? Math.round(stageBreakdown.asset_persist_ms)
        : null;
    const timingText = totalMs !== null ? ` (${Math.round(totalMs)}ms)` : "";
    const stageParts = [
      requestPrepMs !== null ? `prep ${requestPrepMs}ms` : null,
      imageUploadMs !== null ? `upload ${imageUploadMs}ms` : null,
      assetPersistMs !== null ? `persist ${assetPersistMs}ms` : null,
    ].filter((value): value is string => typeof value === "string");
    const stageText =
      stageParts.length > 0 ? ` [${stageParts.join(", ")}]` : "";
    addNarrative(
      "system",
      `${verb} [${resolvedQualityMode}] and applied immediately.${timingText}${stageText}`,
    );
  }

  async function handleGenerate(): Promise<void> {
    if (!roomCode || busyMode) return;

    setBusyMode("generate");
    try {
      const response = await callBackendApi("/api/tools/generate_battlemap", {
        method: "POST",
        body: {
          campaign_id: roomCode,
          quality_mode: qualityMode,
          scene_spec: sceneSpec,
        },
      });

      if (!response.ok) {
        const message =
          typeof response.data?.error === "string"
            ? response.data.error
            : `Generate battlemap failed (${response.status})`;
        throw new Error(message);
      }

      await applyPayload(response.data, "Generated battlemap");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to generate battlemap.";
      addNarrative("system", `Battlemap generation failed: ${message}`);
    } finally {
      setBusyMode(null);
    }
  }

  async function handleRegenerate(
    mode: BattlemapRegenerationMode,
  ): Promise<void> {
    if (!battlemapId || busyMode) return;

    setBusyMode(mode);
    try {
      const response = await callBackendApi("/api/tools/regenerate_battlemap", {
        method: "POST",
        body: {
          battlemap_id: battlemapId,
          mode,
          quality_mode: qualityMode,
        },
      });

      if (!response.ok) {
        const message =
          typeof response.data?.error === "string"
            ? response.data.error
            : `Regenerate battlemap failed (${response.status})`;
        throw new Error(message);
      }

      const label =
        mode === "traversal_only"
          ? "Regenerated traversal grid"
          : "Regenerated battlemap";
      await applyPayload(response.data, label);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to regenerate battlemap.";
      addNarrative("system", `Battlemap regeneration failed: ${message}`);
    } finally {
      setBusyMode(null);
    }
  }

  async function handleImageUpload(file: File): Promise<void> {
    if (!roomCode || uploading) return;
    setUploading(true);
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });
      const MAX_PX = 800;
      const scale = Math.min(
        1,
        MAX_PX / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(img.naturalWidth * scale);
      canvas.height = Math.floor(img.naturalHeight * scale);
      canvas
        .getContext("2d")!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      await callBackendApi("/api/upload-map-image", {
        method: "POST",
        body: { room_code: roomCode, image_data_url: dataUrl },
      });
    } catch {
      addNarrative("system", "Map image upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownloadMap(): Promise<void> {
    if (!mapImageUrl || downloadStatus === "downloading") {
      return;
    }

    const slugify = (value: string): string =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const roomPart = roomCode ? slugify(roomCode) : "session";
    const envPart =
      slugify(
        typeof map?.metadata?.environment === "string"
          ? map.metadata.environment
          : "map",
      ) || "map";
    const filename = `battlemap-${roomPart}-${envPart}.png`;

    const triggerDownload = (href: string) => {
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    };

    setDownloadStatus("downloading");

    try {
      const response = await fetch(mapImageUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      setDownloadStatus("done");
    } catch {
      // Fallback for storage endpoints that do not allow cross-origin blob reads.
      window.open(mapImageUrl, "_blank", "noopener,noreferrer");
      setDownloadStatus("failed");
    }

    window.setTimeout(() => {
      setDownloadStatus("idle");
    }, 1600);
  }

  return (
    <div className="battlemap-actions-panel">
      <div className="battlemap-actions-header">
        <span>Battlemap Tools</span>
        <small>{battlemapId ? "linked" : "not generated"}</small>
      </div>
      <div className="battlemap-actions-row">
        <div
          className="battlemap-quality-group"
          role="group"
          aria-label="Battlemap quality mode"
        >
          <button
            type="button"
            className={`battlemap-quality-btn ${qualityMode === "fast" ? "is-active" : ""}`}
            onClick={() => setQualityMode("fast")}
            disabled={!!busyMode}
            title="Faster generation with lower detail"
          >
            Fast
          </button>
          <button
            type="button"
            className={`battlemap-quality-btn ${qualityMode === "final" ? "is-active" : ""}`}
            onClick={() => setQualityMode("final")}
            disabled={!!busyMode}
            title="Higher detail and larger map output"
          >
            Final
          </button>
        </div>
      </div>
      <div className="battlemap-actions-row">
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleGenerate()}
          disabled={!roomCode || !!busyMode}
          title="Generate a new image battlemap and apply map_patch immediately"
        >
          {busyMode === "generate" ? "Generating..." : "Generate Battlemap"}
        </button>
      </div>
      <div className="battlemap-actions-row">
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleDownloadMap()}
          disabled={!mapImageUrl || downloadStatus === "downloading"}
          title="Download current generated battlemap image"
        >
          {downloadStatus === "downloading"
            ? "Downloading..."
            : downloadStatus === "done"
              ? "Downloaded"
              : downloadStatus === "failed"
                ? "Opened in new tab"
                : "Download Map"}
        </button>
      </div>
      <div className="battlemap-actions-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImageUpload(f);
          }}
        />
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!busyMode || uploading}
          title="Upload a custom map image to use as the battlemap background"
        >
          {uploading ? "Uploading..." : "Upload Map Image"}
        </button>
      </div>
      <div className="battlemap-actions-row battlemap-actions-row--split">
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleRegenerate("same_settings")}
          disabled={!battlemapId || !!busyMode}
          title="Regenerate image + traversal with same settings"
        >
          {busyMode === "same_settings" ? "Working..." : "Regenerate"}
        </button>
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleRegenerate("new_seed")}
          disabled={!battlemapId || !!busyMode}
          title="Regenerate image + traversal with a new seed"
        >
          {busyMode === "new_seed" ? "Working..." : "New Seed"}
        </button>
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleRegenerate("traversal_only")}
          disabled={!battlemapId || !!busyMode}
          title="Recompute only traversal grid from existing image"
        >
          {busyMode === "traversal_only" ? "Working..." : "Traversal Only"}
        </button>
      </div>
    </div>
  );
}
