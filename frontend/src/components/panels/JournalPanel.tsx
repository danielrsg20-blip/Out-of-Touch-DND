import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { callBackendApi } from "../../lib/backendApi";
import "./panels.css";

const AUTOSAVE_DELAY_MS = 1200;

export default function JournalPanel() {
  const roomCode = useSessionStore((s) => s.roomCode);
  const campaignId = useSessionStore((s) => s.campaignId);

  const storageKey = `otdnd_journal_${campaignId ?? roomCode ?? "default"}`;

  const [notes, setNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If campaign changes (resume), reload — prefer API when campaignId is set
  useEffect(() => {
    if (campaignId) {
      callBackendApi(`/api/campaign/${campaignId}/journal`)
        .then((res) => {
          const text =
            typeof (res as { journal_text?: unknown }).journal_text === "string"
              ? (res as { journal_text: string }).journal_text
              : null;
          if (text !== null) {
            setNotes(text);
          } else {
            try {
              setNotes(localStorage.getItem(storageKey) ?? "");
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {
          try {
            setNotes(localStorage.getItem(storageKey) ?? "");
          } catch {
            /* ignore */
          }
        });
    } else {
      try {
        setNotes(localStorage.getItem(storageKey) ?? "");
      } catch {
        /* ignore */
      }
    }
  }, [storageKey, campaignId]);

  const persist = useCallback(
    (text: string) => {
      // Always write localStorage as fast local fallback
      try {
        localStorage.setItem(storageKey, text);
      } catch {
        /* storage full */
      }
      // When a campaignId exists, also persist to the backend
      if (campaignId) {
        callBackendApi(`/api/campaign/${campaignId}/journal`, {
          method: "PATCH",
          body: { journal_text: text },
        }).catch(() => {
          /* non-critical */
        });
      }
      setSavedAt(new Date());
    },
    [storageKey, campaignId],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(value), AUTOSAVE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const savedHint = savedAt
    ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Auto-saves as you type";

  return (
    <div className="journal-panel">
      <h3 className="panel-title">Journal</h3>
      <textarea
        className="journal-textarea"
        value={notes}
        onChange={handleChange}
        placeholder="Keep notes about your adventure — NPCs, clues, quests, secrets…"
        spellCheck={false}
        aria-label="Campaign journal notes"
      />
      <div className="journal-saved-hint">{savedHint}</div>
    </div>
  );
}
