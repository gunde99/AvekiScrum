import { PersonAvatar } from "../../components/PersonAvatar";
import type { MeetingInfluencerDto } from "../../api/teamCheckIn";
import { INFLUENCER_CATEGORIES, INFLUENCER_GROUND_RULE, formatMeetingDate } from "./influencers";
import "./InfluencerLotteryPanel.css";

/**
 * Agenda point 2 - only present on a date someone was drawn for in an earlier meeting's
 * "Nästa veckas influencer" lottery (see TeamCheckInBoard's buildAgenda). Puts the presenters'
 * faces on screen and a reminder of the four categories they chose between.
 */
export function TodaysInfluencersPanel({ influencers }: { influencers: MeetingInfluencerDto[] }) {
  return (
    <div className="tci">
      <header className="tci-header">
        <div className="tci-header__text">
          <div className="tci-eyebrow">Ordet är ert</div>
          <h2 className="tci-title">🎤 Veckans influencer{influencers.length === 1 ? "" : "s"}</h2>
          {influencers[0] && (
            <div className="tci-date">
              <span className="tci-date__text">{formatMeetingDate(influencers[0].meetingDate)}</span>
            </div>
          )}
        </div>
      </header>

      <section className="tci-chosen tci-chosen--today" aria-label="Veckans influencers">
        {influencers.map((p) => (
          <div key={p.id} className="tci-person tci-person--today">
            <PersonAvatar name={p.displayName} size={140} />
            <div className="tci-person__name">{p.displayName}</div>
          </div>
        ))}
      </section>

      <section className="tci-categories">
        <div className="tci-section-title">Valfritt bidrag – ett av följande</div>
        <div className="tci-categories__grid">
          {INFLUENCER_CATEGORIES.map((c) => (
            <div key={c.title} className="tci-category">
              <div className="tci-category__icon" aria-hidden="true">{c.icon}</div>
              <div>
                <div className="tci-category__title">{c.title}</div>
                <div className="tci-category__desc">{c.description}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="tci-rule">{INFLUENCER_GROUND_RULE}</p>
      </section>
    </div>
  );
}
