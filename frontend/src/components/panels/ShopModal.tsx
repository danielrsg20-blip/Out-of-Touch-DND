import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGameStore } from "../../stores/gameStore";
import { useSessionStore } from "../../stores/sessionStore";
import { invokeEdgeFunction } from "../../lib/supabaseClient";
import { getItemSpriteKey, resolveSpriteUrl } from "../../data/spriteManifest";
import type { ShopItem } from "../../stores/gameStore";

function ShopItemIcon({ item }: { readonly item: ShopItem }) {
  const fakeItem = {
    name: item.name,
    category: (item.type?.toLowerCase() ?? "gear") as "weapon" | "armor" | "shield" | "ammunition" | "tool" | "gear",
  };
  const url = resolveSpriteUrl(getItemSpriteKey(fakeItem as any));
  if (!url) return <span className="shop-item-icon-fallback">📦</span>;
  return <img className="shop-item-icon" src={url} alt={item.name} />;
}

export default function ShopModal() {
  const shopData = useGameStore((s) => s.shopData);
  const setShopData = useGameStore((s) => s.setShopData);
  const addNarrative = useGameStore((s) => s.addNarrative);
  const { roomCode, playerId, mockMode } = useSessionStore();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !shopData) return;
    dialog.showModal();
    const handleClose = () => setShopData(null);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (dialog.open) dialog.close();
    };
  }, [shopData, setShopData]);

  if (!shopData) return null;

  const handleBuy = async (item: ShopItem) => {
    const quantityNote = item.quantity && item.quantity > 1 ? ` (${item.quantity} available)` : "";
    const msg = `I want to buy ${item.name}${quantityNote} from ${shopData.shop_name} for ${item.price_gp} gold.`;
    try {
      if (mockMode) {
        addNarrative("system", `[Mock] Purchase: ${item.name}`);
        return;
      }
      await invokeEdgeFunction("dm-action", {
        action: "player_action",
        content: msg,
        room_code: roomCode,
        player_id: playerId,
      });
    } catch (err) {
      addNarrative("system", `Could not purchase ${item.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="shop-overlay"
      aria-label={shopData.shop_name}
    >
      <div className="shop-modal">
        <div className="shop-modal-header">
          <h2 className="shop-modal-title">{shopData.shop_name}</h2>
          {shopData.shopkeeper && (
            <p className="shop-modal-keeper">{shopData.shopkeeper}</p>
          )}
          <button
            type="button"
            className="shop-close-btn"
            onClick={() => setShopData(null)}
            aria-label="Close shop"
          >
            ✕
          </button>
        </div>

        <div className="shop-items-list">
          {shopData.items.length === 0 ? (
            <p className="shop-empty">The shelves are bare.</p>
          ) : (
            shopData.items.map((item) => (
              <motion.div
                key={item.name}
                className="shop-item-row"
                whileHover={{ x: 2, backgroundColor: "rgba(228, 168, 83, 0.06)" }}
                transition={{ duration: 0.15 }}
              >
                <ShopItemIcon item={item} />
                <div className="shop-item-info">
                  <span className="shop-item-name">{item.name}</span>
                  {item.description && (
                    <span className="shop-item-desc">{item.description}</span>
                  )}
                  {item.type && (
                    <span className="shop-item-type">{item.type}</span>
                  )}
                </div>
                <div className="shop-item-right">
                  <span className="shop-item-price">
                    <span className="shop-gold-icon">◈</span> {item.price_gp} gp
                  </span>
                  <button
                    type="button"
                    className="shop-buy-btn"
                    onClick={() => handleBuy(item)}
                  >
                    Buy
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}
