import { useSessionStore } from '../stores/sessionStore'
import './CampaignBriefOverlay.css'

interface CampaignBriefOverlayProps {
  onBegin: () => void
}

export default function CampaignBriefOverlay({ onBegin }: CampaignBriefOverlayProps) {
  const { campaignTitle, campaignPremise, campaignTone, players } = useSessionStore()

  const title = campaignTitle || 'New Adventure'
  const premise = campaignPremise || 'Your adventure awaits. The world is wide, the road is open, and your fate is unwritten.'
  const tone = campaignTone || 'High Fantasy'

  return (
    <div className="campaign-brief-overlay">
      <div className="campaign-brief-card">
        <div className="campaign-brief-eyebrow">Campaign Brief</div>
        <h2 className="campaign-brief-title">{title}</h2>
        <div className="campaign-brief-tone">{tone}</div>
        <p className="campaign-brief-premise">{premise}</p>

        {players.length > 0 && (
          <div className="campaign-brief-party">
            <div className="campaign-brief-party-label">Adventuring Party</div>
            <div className="campaign-brief-party-list">
              {players.map(p => (
                <span key={p.id} className="campaign-brief-player">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="campaign-brief-begin-btn"
          onClick={onBegin}
        >
          Begin Adventure
        </button>
      </div>
    </div>
  )
}
