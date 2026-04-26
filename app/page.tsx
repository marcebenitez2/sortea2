"use client";

import dynamic from "next/dynamic";

const TournamentOrganizer = dynamic(
  () =>
    import("@/components/tournament-organizer").then((m) => ({
      default: m.TournamentOrganizer,
    })),
  { ssr: false }
);

export default function Home() {
  return <TournamentOrganizer />;
}
