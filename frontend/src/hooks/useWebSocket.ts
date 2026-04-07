import { useEffect, useRef, useCallback, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useGameStore } from "../stores/gameStore";
import { useOverlayStore } from "../stores/overlayStore";
import {
  getSupabaseClient,
  invokeEdgeFunction,
  invokeEdgeFunctionWithAnon,
} from "../lib/supabaseClient";
import {
  applyBattlemapResponseToMap,
  extractTraversalGridFromPayload,
  mergeBattlemapAssetIntoMap,
} from "../lib/battlemapState";
import { callBackendApi } from "../lib/backendApi";
import { playTTSAudio } from "../components/VoiceControl";
import { narrationOrchestrator } from "../lib/narrationOrchestrator";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CharacterData, Overlay, SkillChallengeData } from "../types";

function normalizeVoiceErrorMessage(rawError: unknown): string {
  const raw =
    rawError instanceof Error
      ? rawError.message
      : String(rawError ?? "Unknown voice error");
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("429")
  ) {
    return "Voice provider quota reached. You can keep playing with text, or enable mock mode for local voice testing.";
  }
  if (
    lower.includes("api key") ||
    lower.includes("not configured") ||
    lower.includes("authentication")
  ) {
    return "Voice provider is not configured. You can keep playing with text, or enable mock mode for local voice testing.";
  }
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return "Voice services are temporarily unavailable (network issue). Please try again shortly.";
  }

  return `Voice services are currently unavailable: ${message}`;
}

function canUseBrowserSpeechSynthesis(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function useWebSocket() {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const coldOpenFiredRef = useRef(false);
  const narrativeLockRef = useRef(false);
  const lastVoiceNoticeRef = useRef<{
    stt: string;
    tts: string;
    browserTtsShown: boolean;
  }>({ stt: "", tts: "", browserTtsShown: false });
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [rateLimitRetryIn, setRateLimitRetryIn] = useState<number | null>(null);
  const rateLimitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const {
    roomCode,
    sessionId,
    playerId,
    setConnected,
    addPlayer,
    setPlayers,
    getSession,
    mockMode,
  } = useSessionStore();
  const {
    setMap,
    updateEntity,
    addEntity,
    removeEntity,
    setCombat,
    addNarrative,
    syncState,
    setLoading,
    setPendingRoll,
    setDmGenerationStatus,
    setTtsPlaybackStatus,
    voiceSpeed,
    setShopData,
    setLootData,
    setSkillChallenge,
    setCharacters,
  } = useGameStore();
  const setOverlay = useOverlayStore((s) => s.setOverlay);
  const setTraversalGrid = useOverlayStore((s) => s.setTraversalGrid);

  const reportVoiceIssue = useCallback(
    (kind: "stt" | "tts", error: unknown) => {
      const message = normalizeVoiceErrorMessage(error);
      if (lastVoiceNoticeRef.current[kind] === message) {
        return;
      }
      lastVoiceNoticeRef.current[kind] = message;
      addNarrative("system", message);
    },
    [addNarrative],
  );

  const tryBrowserSpeechFallback = useCallback(
    async (text: string): Promise<boolean> => {
      if (
        !(mockMode || import.meta.env.DEV) ||
        !canUseBrowserSpeechSynthesis()
      ) {
        return false;
      }

      return new Promise<boolean>((resolve) => {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = voiceSpeed;
          utterance.pitch = 0.95;
          utterance.onend = () => resolve(true);
          utterance.onerror = () => resolve(false);
          window.speechSynthesis.speak(utterance);
        } catch {
          resolve(false);
        }
      });
    },
    [mockMode, voiceSpeed],
  );

  const speakNarration = useCallback((text: string) => {
    narrationOrchestrator.enqueue(text);
  }, []);

  const renderSessionStartProtocol = useCallback(
    (payload: Record<string, unknown> | undefined) => {
      if (!payload || typeof payload !== "object") {
        return;
      }

      const protocol = payload.protocol as Record<string, unknown> | undefined;
      if (!protocol) {
        return;
      }

      const recap =
        typeof protocol.SESSION_RECAP === "string"
          ? protocol.SESSION_RECAP.trim()
          : "";
      const scene =
        typeof protocol.CURRENT_SCENE === "string"
          ? protocol.CURRENT_SCENE.trim()
          : "";
      const trigger =
        typeof protocol.EVENT_TRIGGER === "string"
          ? protocol.EVENT_TRIGGER.trim()
          : "";
      const prompt =
        typeof protocol.ACTION_PROMPT === "string"
          ? protocol.ACTION_PROMPT.trim()
          : "";

      const stateReady = protocol.SESSION_STATE_READY as
        | Record<string, unknown>
        | undefined;
      const ready = stateReady?.ready === true;
      const issues = Array.isArray(stateReady?.issues)
        ? stateReady?.issues.filter(
            (i): i is string => typeof i === "string" && i.trim().length > 0,
          )
        : [];

      addNarrative(
        "system",
        ready ? "SESSION_STATE_READY" : "SESSION_STATE_BLOCKED",
      );
      for (const issue of issues) {
        addNarrative("system", `Validation: ${issue}`);
      }

      if (recap) {
        addNarrative("dm", recap, "DM");
        void speakNarration(recap);
      }

      const partyStatus = Array.isArray(protocol.PARTY_STATUS)
        ? protocol.PARTY_STATUS
        : [];
      for (const row of partyStatus) {
        const typed = row as Record<string, unknown>;
        const name =
          typeof typed.character_name === "string" &&
          typed.character_name.trim()
            ? typed.character_name
            : typeof typed.player_name === "string"
              ? typed.player_name
              : "Unknown";
        const role =
          typeof typed.role === "string" && typed.role.trim()
            ? typed.role
            : "Unassigned";
        const hp = typed.hp as Record<string, unknown> | undefined;
        const hpCurrent = typeof hp?.current === "number" ? hp.current : null;
        const hpMax = typeof hp?.max === "number" ? hp.max : null;
        const conditionList = Array.isArray(typed.conditions)
          ? typed.conditions.filter(
              (c): c is string => typeof c === "string" && c.trim().length > 0,
            )
          : [];
        const hpText =
          hpCurrent !== null && hpMax !== null
            ? `${hpCurrent}/${hpMax}`
            : "n/a";
        const conditionsText =
          conditionList.length > 0 ? conditionList.join(", ") : "none";
        addNarrative(
          "system",
          `${name} (${role}) HP ${hpText} | Conditions: ${conditionsText}`,
        );
      }

      if (scene) {
        addNarrative("dm", scene, "DM");
        void speakNarration(scene);
      }

      const npcPresent = protocol.NPC_PRESENT;
      if (npcPresent === "NONE") {
        addNarrative("system", "NPC_PRESENT: NONE");
      } else if (Array.isArray(npcPresent)) {
        for (const npcRow of npcPresent) {
          const npc = npcRow as Record<string, unknown>;
          const name = typeof npc.name === "string" ? npc.name : "Unknown NPC";
          const role = typeof npc.role === "string" ? npc.role : "unknown role";
          const behavior =
            typeof npc.behavior === "string" ? npc.behavior : "is present";
          addNarrative("system", `${name} (${role}) - ${behavior}`);
        }
      }

      if (trigger) {
        addNarrative("dm", trigger, "DM");
        void speakNarration(trigger);
      }
      if (prompt) {
        addNarrative("system", prompt);
      }
    },
    [addNarrative, speakNarration],
  );

  useEffect(() => {
    if (!roomCode || !playerId) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      setConnected(false);
      addNarrative("system", "Supabase is not configured. Realtime disabled.");
      return;
    }

    let cancelled = false;

    const connect = async () => {
      // Clean up any existing channel before creating a new one
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      let effectiveSessionId = sessionId;
      if (!effectiveSessionId) {
        try {
          await getSession(roomCode);
          effectiveSessionId = useSessionStore.getState().sessionId;
        } catch {
          setConnected(false);
          addNarrative(
            "system",
            "Unable to initialize realtime session state.",
          );
          return;
        }
      }

      if (!effectiveSessionId || cancelled) {
        return;
      }

      const channel = supabase
        .channel(`game-events:${effectiveSessionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "game_events",
            filter: `session_id=eq.${effectiveSessionId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            handleMessage({
              type: row.event_type as string,
              ...(row.payload as Record<string, unknown>),
            });
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            reconnectAttemptsRef.current = 0;
            setReconnecting(false);
            setConnected(true);
            getSession(roomCode)
              .then((payload) => {
                syncState(payload as Parameters<typeof syncState>[0]);
                if (payload.battlemap_asset) {
                  const currentMap = useGameStore.getState().map;
                  const mergedMap = mergeBattlemapAssetIntoMap(
                    currentMap,
                    payload.battlemap_asset,
                  );
                  if (mergedMap) {
                    setMap(mergedMap);
                  }
                }
                if (payload.overlay && typeof payload.overlay === "object") {
                  setOverlay(payload.overlay as Overlay);
                }
                const traversalGrid = extractTraversalGridFromPayload(payload);
                if (traversalGrid) {
                  setTraversalGrid(traversalGrid);
                }
              })
              .catch(() => {});
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setConnected(false);
            setLoading(false);
            if (!cancelled && reconnectAttemptsRef.current < 5) {
              const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
              reconnectAttemptsRef.current += 1;
              setReconnecting(true);
              reconnectTimerRef.current = setTimeout(() => {
                if (!cancelled) {
                  void connect();
                }
              }, delay);
            } else if (!cancelled) {
              setReconnecting(false);
            }
          }
        });

      channelRef.current = channel;
    };

    reconnectAttemptsRef.current = 0;
    void connect();

    return () => {
      cancelled = true;
      setConnected(false);
      setReconnecting(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      channelRef.current = null;
    };
  }, [
    roomCode,
    sessionId,
    playerId,
    setConnected,
    addNarrative,
    setLoading,
    getSession,
    setOverlay,
    setTraversalGrid,
  ]);

  // Cleanup rate-limit countdown interval on unmount
  useEffect(() => {
    return () => {
      if (rateLimitIntervalRef.current)
        clearInterval(rateLimitIntervalRef.current);
    };
  }, []);

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      const type = msg.type as string;

      switch (type) {
        case "connected":
          if (msg.session) {
            const session = msg.session as {
              players: Array<{
                id: string;
                name: string;
                character_id: string | null;
              }>;
            };
            setPlayers(session.players);
          }
          if (msg.game_state) {
            syncState(msg.game_state as Parameters<typeof syncState>[0]);
          }
          if (msg.overlay && typeof msg.overlay === "object") {
            setOverlay(msg.overlay as Overlay);
          }
          if (!coldOpenFiredRef.current) {
            coldOpenFiredRef.current = true;
            setTimeout(
              () =>
                renderSessionStartProtocol(
                  msg.session_start as Record<string, unknown> | undefined,
                ),
              Number(import.meta.env.VITE_COLD_OPEN_DELAY_MS) || 2000,
            );
          }
          break;

        case "session_start":
          if (!coldOpenFiredRef.current) {
            coldOpenFiredRef.current = true;
            setTimeout(
              () => renderSessionStartProtocol(msg),
              Number(import.meta.env.VITE_COLD_OPEN_DELAY_MS) || 2000,
            );
          }
          break;

        case "player_connected":
          addPlayer(
            msg.player as {
              id: string;
              name: string;
              character_id: string | null;
            },
          );
          addNarrative(
            "system",
            `${(msg.player as { name: string }).name} connected.`,
          );
          break;

        case "player_joined":
          if (msg.player_id && msg.player_name) {
            addPlayer({
              id: msg.player_id as string,
              name: msg.player_name as string,
              character_id: null,
            });
            addNarrative("system", `${msg.player_name} joined the session.`);
          }
          break;

        case "player_disconnected":
          addNarrative("system", `${msg.player_name} disconnected.`);
          break;

        case "player_message":
          addNarrative(
            "player",
            msg.content as string,
            msg.player_name as string,
          );
          break;

        case "dm_narrative":
          addNarrative("dm", msg.content as string, "DM");
          narrativeLockRef.current = false;
          setLoading(false);
          if (typeof msg.content === "string") {
            void speakNarration(msg.content);
          }
          break;

        case "tts_audio":
          if (typeof msg.audio === "string" && msg.audio.trim()) {
            playTTSAudio(msg.audio);
          }
          break;

        case "map_update": {
          const incomingMap = msg.map as Parameters<typeof setMap>[0];
          setMap(incomingMap);

          // Phase 2: Auto-trigger battlemap when the DM signals it
          const meta = incomingMap?.metadata as Record<string, unknown> | undefined;
          if (meta?.auto_battlemap_requested && roomCode) {
            // Clear the flag to prevent re-triggering on future state syncs
            delete meta.auto_battlemap_requested;
            void (async () => {
              try {
                const widthFeet = Math.max(20, ((incomingMap as any)?.width ?? 30) * 5);
                const heightFeet = Math.max(20, ((incomingMap as any)?.height ?? 21) * 5);
                const resp = await callBackendApi("/api/tools/generate_battlemap", {
                  method: "POST",
                  body: {
                    campaign_id: roomCode,
                    quality_mode: "fast",
                    scene_spec: {
                      location: String(meta.location ?? meta.environment ?? "dungeon"),
                      biome: String(meta.biome ?? "temperate"),
                      encounter_type: String(meta.encounter_type ?? "exploration"),
                      mood_style: String(meta.mood_style ?? "hand-drawn"),
                      map_width_feet: widthFeet,
                      map_height_feet: heightFeet,
                      notable_features: Array.isArray(meta.notable_features) ? (meta.notable_features as string[]).slice(0, 6) : [],
                      description: String(meta.description ?? ""),
                    },
                    seed: meta.seed,
                  },
                });
                if (resp.ok && resp.data) {
                  const currentMap = useGameStore.getState().map;
                  const merged = applyBattlemapResponseToMap(currentMap, resp.data as Record<string, unknown>);
                  if (merged) {
                    setMap(merged);
                    const tg = extractTraversalGridFromPayload(resp.data as Record<string, unknown>);
                    if (tg) useOverlayStore.getState().setTraversalGrid(tg);
                    addNarrative("system", "Battlemap image auto-generated.");
                  }
                }
              } catch {
                // Non-critical — map still works without battlemap image
              }
            })();
          }
          break;
        }

        case "overlay_update":
          if (msg.overlay && typeof msg.overlay === "object") {
            setOverlay(msg.overlay as Overlay);
          }
          break;

        case "map_change": {
          const action = msg.action as string;
          const data = (msg.data as Record<string, unknown>) || {};
          if (action === "move_entity") {
            const to = data.to as { x: number; y: number } | undefined;
            const moved = data.moved as string | undefined;
            if (to && moved) {
              updateEntity(moved, to.x, to.y);
            }
          } else if (action === "place_entity") {
            const placed = data.placed as
              | Parameters<typeof addEntity>[0]
              | undefined;
            if (placed) {
              addEntity(placed);
            }
          } else if (action === "remove_entity") {
            const entityId = data.entity_id as string | undefined;
            if (entityId) {
              removeEntity(entityId);
            }
          } else if (action === "update_tile") {
            addNarrative("system", "The environment shifts on the map.");
          }
          break;
        }

        case "combat_start":
          setCombat(msg.combat as Parameters<typeof setCombat>[0]);
          addNarrative("system", "Combat has begun! Roll for initiative!");
          break;

        case "combat_update": {
          const action = typeof msg.action === "string" ? msg.action : "";
          const previousCombat = useGameStore.getState().combat;
          const nextCombat = msg.combat as
            | Parameters<typeof setCombat>[0]
            | undefined;

          if (msg.combat) {
            setCombat(nextCombat ?? null);
          }

          const data = (msg.data as Record<string, unknown> | undefined) ?? {};
          const message = typeof data.message === "string" ? data.message : "";

          if (action === "next_turn") {
            const prevRound = Number(previousCombat?.round ?? 0);
            const nextRound = Number(nextCombat?.round ?? prevRound);
            if (nextRound > prevRound) {
              addNarrative("system", `Round ${nextRound} begins.`);
            }

            if (message) {
              addNarrative("system", message);
            } else {
              const turnName =
                nextCombat?.initiative_order?.[nextCombat.turn_index]?.name;
              if (turnName) {
                addNarrative("system", `${turnName}'s turn.`);
              }
            }
          } else if (action === "end_combat") {
            setCombat(null);
            addNarrative("system", message || "Combat ends.");
          } else if (message) {
            addNarrative("system", message);
          }
          break;
        }

        case "dice_result": {
          const data = msg.data as Record<string, unknown>;
          const tool = msg.tool as string;
          let text = "";
          if (tool === "roll_dice") {
            text = `Rolled ${data.notation}: [${(data.rolls as number[]).join(", ")}] ${data.modifier ? ((data.modifier as number) > 0 ? "+" : "") + data.modifier : ""} = ${data.total}`;
          } else if (tool === "check_ability") {
            text = data.message as string;
          } else if (tool === "attack") {
            const hits = data.hits ? "Hit!" : "Miss!";
            text = `${data.attacker} attacks ${data.target}: ${data.attack_roll} vs AC ${data.target_ac} - ${hits}`;
            if (data.hits && data.damage) text += ` (${data.damage} damage)`;
            if (data.critical) text += " CRITICAL HIT!";
          } else if (tool === "apply_damage") {
            text = `${data.target} takes ${data.damage_taken} ${data.damage_type || ""} damage. HP: ${data.current_hp}`;
          } else if (tool === "heal_character") {
            text = `${data.target} heals for ${data.healed}. HP: ${data.current_hp}`;
          } else if (tool === "cast_spell") {
            const slotLevel = Number(data.slot_level || 0);
            const slotText =
              slotLevel > 0 ? `using level ${slotLevel} slot` : "as a cantrip";
            text = `${data.character} casts ${data.spell} ${slotText}.`;
            if (data.concentration)
              addNarrative(
                "system",
                `${data.character} is now concentrating on ${data.concentration_spell}.`,
              );
            if (data.concentration_dropped)
              addNarrative(
                "system",
                `${data.character} dropped concentration on ${data.concentration_dropped}.`,
              );
          }
          const concCheck = data.concentration_check as
            | Record<string, unknown>
            | undefined;
          if (concCheck) addNarrative("system", concCheck.message as string);
          if (text) addNarrative("dice", text);
          break;
        }

        case "roll_request": {
          setPendingRoll({
            characterId: msg.character_id as string,
            characterName: (msg.character_name as string) || "",
            label: (msg.label as string) || "Roll",
            dice: (msg.dice as string) || "d20",
            modifier: typeof msg.modifier === "number" ? msg.modifier : 0,
            context: (msg.context as string) || "",
          });
          break;
        }

        case "state_sync":
          if (msg.state) {
            syncState(msg.state as Parameters<typeof syncState>[0]);
            const state = msg.state as Record<string, unknown>;
            if (state.battlemap_asset) {
              const currentMap = useGameStore.getState().map;
              const mergedMap = mergeBattlemapAssetIntoMap(
                currentMap,
                state.battlemap_asset,
              );
              if (mergedMap) {
                setMap(mergedMap);
              }
            }
            if (state.overlay && typeof state.overlay === "object") {
              setOverlay(state.overlay as Overlay);
            }
            const traversalGrid = extractTraversalGridFromPayload(state);
            if (traversalGrid) {
              setTraversalGrid(traversalGrid);
            }
          }
          break;

        case "shop_open": {
          const d = msg.data as Record<string, unknown>;
          if (d && typeof d.shop_name === "string") {
            setShopData({
              shop_name: d.shop_name,
              shopkeeper:
                typeof d.shopkeeper === "string" ? d.shopkeeper : undefined,
              items: Array.isArray(d.items)
                ? (d.items as import("../stores/gameStore").ShopItem[])
                : [],
            });
          }
          break;
        }

        case "loot_result": {
          const d = msg.data as Record<string, unknown>;
          if (d) {
            setLootData({
              items: Array.isArray(d.items)
                ? (d.items as Array<{
                    name: string;
                    quantity?: number;
                    value_gp?: number;
                  }>)
                : [],
              gold: typeof d.gold === "number" ? d.gold : undefined,
              description:
                typeof d.description === "string" ? d.description : undefined,
            });
          }
          break;
        }

        case "character_update": {
          const char = msg.character as CharacterData;
          if (char?.id) {
            const current = useGameStore.getState().characters;
            setCharacters({ ...current, [char.id]: char });
          }
          break;
        }

        case "skill_challenge_update": {
          const sc = msg.data as SkillChallengeData;
          setSkillChallenge(sc);
          if (!sc.is_resolved)
            addNarrative("system", `Skill Challenge started: ${sc.title}`);
          break;
        }

        case "character_created":
          addNarrative(
            "system",
            `Character created: ${(msg.character as { name: string }).name}`,
          );
          break;

        case "error":
          addNarrative("system", `Error: ${msg.content}`);
          setLoading(false);
          break;

        case "rate_limit_retry": {
          const retryIn =
            typeof msg.retry_in_seconds === "number"
              ? msg.retry_in_seconds
              : 60;
          setRateLimitRetryIn(retryIn);
          narrativeLockRef.current = false;
          setLoading(false);
          if (rateLimitIntervalRef.current)
            clearInterval(rateLimitIntervalRef.current);
          rateLimitIntervalRef.current = setInterval(() => {
            setRateLimitRetryIn((prev) => {
              if (prev === null || prev <= 1) {
                if (rateLimitIntervalRef.current)
                  clearInterval(rateLimitIntervalRef.current);
                rateLimitIntervalRef.current = null;
                return null;
              }
              return prev - 1;
            });
          }, 1000);
          break;
        }
      }
    },
    [
      addNarrative,
      addEntity,
      addPlayer,
      removeEntity,
      renderSessionStartProtocol,
      setCombat,
      setCharacters,
      setLoading,
      setLootData,
      setMap,
      setOverlay,
      setPlayers,
      setPendingRoll,
      setShopData,
      setSkillChallenge,
      setTraversalGrid,
      speakNarration,
      syncState,
      updateEntity,
    ],
  );

  const sendAction = useCallback(
    (content: string) => {
      if (!roomCode || !playerId) {
        addNarrative(
          "system",
          "Missing room or player identity. Unable to send action.",
        );
        setLoading(false);
        return;
      }

      if (narrativeLockRef.current) {
        addNarrative(
          "system",
          "Please wait for the DM to respond before acting again.",
        );
        return;
      }

      narrativeLockRef.current = true;
      setLoading(true);

      const normalizedContent = content
        .replace(/^\[player_interrupted_narration_at:[^\]]+\]\s*/i, "")
        .trim();
      const outgoingContent = normalizedContent || content;

      const sendViaEdge = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }

        const payload = await invokeEdgeFunction<Record<string, unknown>>(
          "dm-action",
          {
            action: "player_action",
            room_code: roomCode,
            player_id: playerId,
            content: outgoingContent,
            mock_mode: mockMode,
          },
          { authMode: "anon" },
        );

        const dmGeneration = payload.dm_generation as
          | Record<string, unknown>
          | undefined;
        if (dmGeneration && typeof dmGeneration === "object") {
          const provider =
            typeof dmGeneration.provider === "string"
              ? dmGeneration.provider
              : "unknown";
          const model =
            typeof dmGeneration.model === "string"
              ? dmGeneration.model
              : "unknown";
          const fallback = dmGeneration.fallback === true;
          const reason =
            typeof dmGeneration.reason === "string"
              ? dmGeneration.reason
              : null;
          setDmGenerationStatus({
            provider,
            model,
            fallback,
            reason,
            updatedAt: Date.now(),
          });
        }

        // Include narrative directly from the HTTP response in case the Realtime
        // subscription hasn't been established yet (e.g. SESSION_START fires on mount).
        if (typeof payload.narrative === "string" && payload.narrative.trim()) {
          addNarrative("dm", payload.narrative.trim(), "DM");
          narrativeLockRef.current = false;
          setLoading(false);
        }
      };

      sendViaEdge()
        .catch((finalErr: unknown) => {
          const finalMessage =
            finalErr instanceof Error ? finalErr.message : "Unknown error";
          if (finalMessage.includes("Supabase is not configured")) {
            addNarrative(
              "system",
              "Unable to send action: Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
            );
            return;
          }
          addNarrative("system", `Unable to send action: ${finalMessage}`);
        })
        .finally(() => {
          narrativeLockRef.current = false;
          setLoading(false);
        });
    },
    [
      addNarrative,
      mockMode,
      playerId,
      roomCode,
      setDmGenerationStatus,
      setLoading,
    ],
  );

  const sendMoveToken = useCallback(
    (characterId: string, x: number, y: number) => {
      const supabase = getSupabaseClient();
      if (!roomCode || !playerId) {
        return;
      }

      if (!supabase) {
        addNarrative(
          "system",
          "Unable to move token: Supabase is not configured.",
        );
        return;
      }

      invokeEdgeFunction<Record<string, unknown>>(
        "dm-action",
        {
          action: "move_token",
          room_code: roomCode,
          player_id: playerId,
          character_id: characterId,
          x,
          y,
          mock_mode: mockMode,
        },
        { authMode: "anon" },
      ).catch((err: unknown) => {
        addNarrative(
          "system",
          `Unable to move token: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      });
    },
    [addNarrative, mockMode, playerId, roomCode],
  );

  const sendSpellCast = useCallback(
    (spellName: string, slotLevel: number, targetId?: string) => {
      const supabase = getSupabaseClient();
      if (!supabase || !roomCode || !playerId) {
        addNarrative(
          "system",
          "Not connected to Supabase session. Unable to cast spell.",
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      invokeEdgeFunction<Record<string, unknown>>(
        "dm-action",
        {
          action: "cast_spell",
          room_code: roomCode,
          player_id: playerId,
          spell_name: spellName,
          slot_level: slotLevel,
          target_id: targetId,
          mock_mode: mockMode,
        },
        { authMode: "anon" },
      ).catch((err: unknown) => {
        addNarrative(
          "system",
          `Unable to cast spell: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
        setLoading(false);
      });
    },
    [addNarrative, mockMode, playerId, roomCode, setLoading],
  );

  const transcribeVoiceInput = useCallback(
    async (audioBase64: string): Promise<string | null> => {
      const trimmed = audioBase64.trim();
      if (!trimmed) {
        return null;
      }

      const supabase = getSupabaseClient();

      try {
        if (supabase) {
          try {
            const payload = await invokeEdgeFunction<Record<string, unknown>>(
              "voice-stt",
              {
                audio: trimmed,
                filename: "voice-input.webm",
                room_code: roomCode,
                player_id: playerId,
                mock_mode: mockMode,
              },
              { authMode: "anon" },
            );
            const transcript =
              typeof payload.transcript === "string"
                ? payload.transcript.trim()
                : "";
            if (transcript) {
              return transcript;
            }
          } catch {
            // Fall through to graceful null return when edge STT is unavailable.
          }
        }

        return null;
      } catch (error) {
        reportVoiceIssue("stt", error);
        return null;
      }
    },
    [mockMode, playerId, reportVoiceIssue, roomCode],
  );

  const runVoiceTest = useCallback(async () => {
    const testLine =
      "Voice test check. If you can hear this, your speaker output is working.";

    try {
      const payloadBody = {
        text: testLine,
        voiceId: "dm_default",
        speed: voiceSpeed,
        room_code: roomCode,
        player_id: playerId,
        mock_mode: mockMode,
      };

      let payload: Record<string, unknown> | null = null;
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          payload = await invokeEdgeFunction<Record<string, unknown>>(
            "voice-tts",
            payloadBody,
            { authMode: "anon" },
          );
        } catch {
          payload = await invokeEdgeFunctionWithAnon<Record<string, unknown>>(
            "voice-tts",
            payloadBody,
          );
        }
      } else {
        payload = await invokeEdgeFunctionWithAnon<Record<string, unknown>>(
          "voice-tts",
          payloadBody,
        );
      }

      if (
        payload &&
        typeof payload.audio === "string" &&
        payload.audio.trim()
      ) {
        playTTSAudio(payload.audio);
        setTtsPlaybackStatus({
          source: "edge-tts",
          reason: mockMode ? "voice_test_mock_mode" : null,
          updatedAt: Date.now(),
        });
        addNarrative("system", "Voice test: success chirp played.");
        return;
      }

      throw new Error("Voice test did not return playable audio");
    } catch (error) {
      reportVoiceIssue("tts", error);
      const usedBrowserFallback = await tryBrowserSpeechFallback(testLine);
      if (usedBrowserFallback) {
        setTtsPlaybackStatus({
          source: "browser-fallback",
          reason: "voice_test_edge_unavailable",
          updatedAt: Date.now(),
        });
      } else {
        setTtsPlaybackStatus({
          source: "none",
          reason: "voice_test_failed",
          updatedAt: Date.now(),
        });
      }
      if (!usedBrowserFallback) {
        addNarrative(
          "system",
          "Voice test could not play audio. Check speaker output and browser audio permissions.",
        );
      }
    }
  }, [
    addNarrative,
    mockMode,
    playerId,
    reportVoiceIssue,
    roomCode,
    setTtsPlaybackStatus,
    tryBrowserSpeechFallback,
    voiceSpeed,
  ]);

  return {
    sendAction,
    sendMoveToken,
    sendSpellCast,
    transcribeVoiceInput,
    runVoiceTest,
    reconnecting,
    rateLimitRetryIn,
  };
}
