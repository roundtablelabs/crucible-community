import Image from "next/image";
import { memo } from "react";
import { FaClock, FaMicrophoneAlt, FaUser } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { ParticipantPresence } from "../types";

type PeopleRailProps = {
  participants: ParticipantPresence[];
  className?: string;
  showDominantHint?: boolean;
};

const ROLE_BG: Record<ParticipantPresence["role"], string> = {
  host: "bg-info-100 text-info-800",
  scribe: "bg-success-100 text-success-800",
  decider: "bg-warning-100 text-warning-800",
  contributor: "bg-base-bg text-base-text",
  observer: "bg-base-panel text-base-subtext",
  bot: "bg-base-panel text-base-subtext",
};

export const PeopleRail = memo(function PeopleRail({
  participants,
  className,
  showDominantHint = true,
}: PeopleRailProps) {
  return (
    <section
      aria-label="Participants"
      className={cn(
        "flex flex-col gap-3 rounded-3xl border border-base-divider bg-base-panel/95 p-4 shadow-soft",
        className,
      )}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-base-subtext">People</h2>
        {showDominantHint ? (
          <span className="flex items-center gap-1 text-xs text-base-subtext">
            <FaClock className="h-3.5 w-3.5" aria-hidden="true" />
            Airtime balance
          </span>
        ) : null}
      </header>
      <ul className="space-y-2 text-sm">
        {participants.map((participant) => (
          <li
            key={participant.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-base-divider/60 bg-base-bg/90 px-3 py-2",
              participant.isSpeaking ? "border-info-500 shadow-[0_0_0_2px_rgba(46,164,248,0.20)]" : "",
            )}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-panel text-base-subtext">
              {participant.avatarUrl ? (
                <Image
                  src={participant.avatarUrl}
                  alt={participant.name}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <FaUser className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-base-text">{participant.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em]",
                    ROLE_BG[participant.role],
                  )}
                >
                  {participant.role}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-base-subtext">
                {participant.presence === "online" ? (
                  <span className="flex items-center gap-1 text-success-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                    Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-base-subtext">
                    <span className="h-1.5 w-1.5 rounded-full bg-base-subtext/40" />
                    Offline
                  </span>
                )}
                {typeof participant.speakingMs === "number" ? (
                  <span className="flex items-center gap-1">
                    <FaClock className="h-3 w-3" aria-hidden="true" />
                    {(participant.speakingMs / 1000).toFixed(0)}s
                  </span>
                ) : null}
                {participant.isDominant ? (
                  <span className="flex items-center gap-1 text-warning-700">
                    <FaMicrophoneAlt className="h-3 w-3" aria-hidden="true" />
                    Dominant
                  </span>
                ) : null}
              </div>
            </div>
            {participant.isSpeaking ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info-100 text-info-700">
                <FaMicrophoneAlt className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
});

PeopleRail.displayName = "PeopleRail";
