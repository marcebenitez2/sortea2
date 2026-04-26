"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  X,
  Plus,
  Shuffle,
  RotateCcw,
  Trophy,
  ChevronRight,
  ChevronLeft,
  Users,
  Lock,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_PLAYERS: string[] = [];

// ── Types ──────────────────────────────────────────────────────────────────────

type Team = [string, string];

type GroupMatch = {
  team1Idx: number;
  team2Idx: number;
  score1: string;
  score2: string;
};

type Group = {
  id: string;
  name: string;
  teams: Team[];
  matches: GroupMatch[];
  byePlayer: string | null;
};

type StandingRow = {
  team: Team;
  idx: number;
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
};

type BracketMatch = {
  team1: Team | null;
  team2: Team | null;
  score1: string;
  score2: string;
};

type BracketRound = {
  label: string;
  matches: BracketMatch[];
  bye: Team | null;
};

type Phase = "sorting" | "groups" | "bracket";

// ── Storage ────────────────────────────────────────────────────────────────────

const SK = "sorteaditos-v2";
const readStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(SK) ?? "null") ?? {};
  } catch {
    return {};
  }
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const teamLabel = (t: Team | null) =>
  t ? `${t[0]} & ${t[1]}` : "Por determinar";

function roundRobin(n: number): GroupMatch[] {
  const out: GroupMatch[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      out.push({ team1Idx: i, team2Idx: j, score1: "", score2: "" });
  return out;
}

function createGroups(pairs: Team[], byePlayer: string | null): Group[] {
  const shuffled = shuffle([...pairs]);
  const n = shuffled.length;
  const numGroups = Math.min(4, Math.max(1, n));
  const baseSize = Math.floor(n / numGroups);
  const extras = n % numGroups;
  // extras go to the FIRST groups → last group is the smallest → bye goes there
  const sizes = Array.from({ length: numGroups }, (_, i) =>
    baseSize + (i < extras ? 1 : 0)
  );
  let cursor = 0;
  return sizes.map((sz, i) => {
    const ts = shuffled.slice(cursor, cursor + sz) as Team[];
    cursor += sz;
    return {
      id: `g${i}`,
      name: `Grupo ${String.fromCharCode(65 + i)}`,
      teams: ts,
      matches: roundRobin(ts.length),
      byePlayer: i === numGroups - 1 ? byePlayer : null,
    };
  });
}

function getStandings(g: Group): StandingRow[] {
  const rows: StandingRow[] = g.teams.map((team, idx) => ({
    team, idx, played: 0, wins: 0, losses: 0, gf: 0, ga: 0,
  }));
  for (const m of g.matches) {
    const s1 = parseInt(m.score1);
    const s2 = parseInt(m.score2);
    if (!m.score1 || !m.score2 || isNaN(s1) || isNaN(s2)) continue;
    rows[m.team1Idx].played++;
    rows[m.team2Idx].played++;
    rows[m.team1Idx].gf += s1;
    rows[m.team1Idx].ga += s2;
    rows[m.team2Idx].gf += s2;
    rows[m.team2Idx].ga += s1;
    if (s1 > s2) { rows[m.team1Idx].wins++; rows[m.team2Idx].losses++; }
    else if (s2 > s1) { rows[m.team2Idx].wins++; rows[m.team1Idx].losses++; }
  }
  return rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const da = a.gf - a.ga, db = b.gf - b.ga;
    if (db !== da) return db - da;
    return b.gf - a.gf;
  });
}

function matchWinner(m: BracketMatch): Team | null {
  const s1 = parseInt(m.score1), s2 = parseInt(m.score2);
  if (!m.score1 || !m.score2 || isNaN(s1) || isNaN(s2) || s1 === s2) return null;
  return s1 > s2 ? m.team1 : m.team2;
}

function roundComplete(r: BracketRound) {
  return r.matches.every((m) => matchWinner(m) !== null);
}

function nextRound(cur: BracketRound): BracketRound | null {
  if (!roundComplete(cur)) return null;
  const adv: Team[] = [
    ...cur.matches.map((m) => matchWinner(m)!),
    ...(cur.bye ? [cur.bye] : []),
  ];
  if (adv.length <= 1) return null;
  const matches: BracketMatch[] = [];
  for (let i = 0; i + 1 < adv.length; i += 2)
    matches.push({ team1: adv[i], team2: adv[i + 1], score1: "", score2: "" });
  const bye = adv.length % 2 === 1 ? adv[adv.length - 1] : null;
  const label =
    adv.length === 2 ? "Final"
    : adv.length === 4 ? "Semifinales"
    : adv.length === 8 ? "Cuartos de final"
    : `Ronda de ${adv.length}`;
  return { label, matches, bye };
}

function tournamentWinner(rounds: BracketRound[]): Team | null {
  if (!rounds.length) return null;
  const last = rounds[rounds.length - 1];
  if (!roundComplete(last) || nextRound(last) !== null) return null;
  if (!last.matches.length) return last.bye;
  return matchWinner(last.matches[0]);
}

function buildInitialBracket(groups: Group[], adv: number): BracketRound {
  const st = groups.map(getStandings);
  let teams: Team[] = [];

  if (groups.length === 4 && adv === 2) {
    // Cross-seeding: A1vB2, B1vA2, C1vD2, D1vC2
    const pick = (gi: number, rank: number) => st[gi]?.[rank]?.team;
    const ordered = [
      pick(0, 0), pick(1, 1),
      pick(1, 0), pick(0, 1),
      pick(2, 0), pick(3, 1),
      pick(3, 0), pick(2, 1),
    ].filter(Boolean) as Team[];
    teams = ordered;
  } else {
    for (let rank = 0; rank < adv; rank++)
      for (const s of st)
        if (s[rank]) teams.push(s[rank].team);
  }

  const matches: BracketMatch[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2)
    matches.push({ team1: teams[i], team2: teams[i + 1], score1: "", score2: "" });
  const bye = teams.length % 2 === 1 ? teams[teams.length - 1] : null;
  const label =
    teams.length <= 2 ? "Final"
    : teams.length <= 4 ? "Semifinales"
    : "Cuartos de final";
  return { label, matches, bye };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TournamentOrganizer() {
  const saved = useState(() => readStorage())[0];

  const [players, setPlayers] = useState<string[]>(saved.players ?? DEFAULT_PLAYERS);
  const [playerInput, setPlayerInput] = useState("");
  const [pairs, setPairs] = useState<Team[]>(saved.pairs ?? []);
  const [byePlayer, setByePlayer] = useState<string | null>(saved.byePlayer ?? null);
  const [phase, setPhase] = useState<Phase>(saved.phase ?? "sorting");
  const [groups, setGroups] = useState<Group[]>(saved.groups ?? []);
  const [advancing, setAdvancing] = useState<1 | 2>(saved.advancing ?? 2);
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>(saved.bracketRounds ?? []);

  useEffect(() => {
    try {
      localStorage.setItem(SK, JSON.stringify(
        { players, pairs, byePlayer, phase, groups, advancing, bracketRounds }
      ));
    } catch {}
  }, [players, pairs, byePlayer, phase, groups, advancing, bracketRounds]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const tournamentStarted = groups.some((g) =>
    g.matches.some((m) => m.score1 !== "" || m.score2 !== "")
  );
  const allGroupsDone =
    groups.length > 0 &&
    groups.every((g) => g.matches.every((m) => m.score1 !== "" && m.score2 !== ""));
  const curRound = bracketRounds[bracketRounds.length - 1];
  const winner = tournamentWinner(bracketRounds);
  const canAdvance =
    curRound && roundComplete(curRound) && !winner
      ? nextRound(curRound) !== null
      : false;

  const phaseSteps: { key: Phase; label: string }[] = [
    { key: "sorting", label: "Sorteo" },
    { key: "groups", label: "Grupos" },
    { key: "bracket", label: "Llaves" },
  ];
  const phaseIdx = phaseSteps.findIndex((s) => s.key === phase);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function addPlayer() {
    const name = playerInput.trim();
    if (!name || players.includes(name)) return;
    setPlayers((p) => [...p, name]);
    setPlayerInput("");
  }

  function removePlayer(name: string) {
    setPlayers((p) => p.filter((pl) => pl !== name));
  }

  function doSortear() {
    if (players.length < 2) return;
    const shuffled = shuffle(players);
    const newPairs: Team[] = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2)
      newPairs.push([shuffled[i], shuffled[i + 1]]);
    const bye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;
    setPairs(newPairs);
    setByePlayer(bye);
  }

  function resetSort() {
    setPairs([]);
    setByePlayer(null);
  }

  function armarGrupos() {
    setGroups(createGroups(pairs, byePlayer));
    setPhase("groups");
  }

  function volverSorteo() {
    if (tournamentStarted) return;
    setGroups([]);
    setPhase("sorting");
  }

  function updateGroupScore(gi: number, mi: number, field: "score1" | "score2", val: string) {
    if (val !== "" && !/^\d{1,2}$/.test(val)) return;
    setGroups((prev) =>
      prev.map((g, gIdx) =>
        gIdx !== gi ? g : {
          ...g,
          matches: g.matches.map((m, mIdx) =>
            mIdx !== mi ? m : { ...m, [field]: val }
          ),
        }
      )
    );
  }

  function armarLlaves() {
    setBracketRounds([buildInitialBracket(groups, advancing)]);
    setPhase("bracket");
  }

  function updateBracketScore(ri: number, mi: number, field: "score1" | "score2", val: string) {
    if (val !== "" && !/^\d{1,2}$/.test(val)) return;
    setBracketRounds((prev) =>
      prev.map((r, rIdx) =>
        rIdx !== ri ? r : {
          ...r,
          matches: r.matches.map((m, mIdx) =>
            mIdx !== mi ? m : { ...m, [field]: val }
          ),
        }
      )
    );
  }

  function avanzarRonda() {
    const cur = bracketRounds[bracketRounds.length - 1];
    const nr = nextRound(cur);
    if (nr) setBracketRounds((p) => [...p, nr]);
  }

  function reiniciar() {
    try { localStorage.removeItem(SK); } catch {}
    setPlayers(DEFAULT_PLAYERS);
    setPlayerInput("");
    setPairs([]);
    setByePlayer(null);
    setGroups([]);
    setBracketRounds([]);
    setAdvancing(2);
    setPhase("sorting");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sorteaditos</h1>
            <p className="text-emerald-100 text-sm mt-0.5">Torneo de padel</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1">
              {phaseSteps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                      i === phaseIdx
                        ? "bg-white text-emerald-700"
                        : i < phaseIdx
                          ? "bg-emerald-400/60 text-white"
                          : "bg-white/15 text-white/60"
                    }`}
                  >
                    {step.label}
                  </span>
                  {i < phaseSteps.length - 1 && (
                    <ChevronRight className="size-3 text-white/40" />
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={reiniciar}
              className="border-white/40 bg-white/10 text-white hover:bg-white/25 hover:text-white"
            >
              <RotateCcw />
              Reiniciar
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ══ SORTING PHASE ══════════════════════════════════════════════════ */}
        {phase === "sorting" && (
          <>
            {/* Player list — only editable before draw */}
            {pairs.length === 0 && (
              <Card className="bg-white dark:bg-zinc-900">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Jugadores inscriptos</CardTitle>
                  <CardAction>
                    <Badge className="bg-emerald-100 text-emerald-700 border-0">
                      {players.length}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="Agregar jugador…"
                      value={playerInput}
                      onChange={(e) => setPlayerInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                    />
                    <Button size="icon" variant="ghost" onClick={addPlayer}>
                      <Plus />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {players.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-medium"
                      >
                        {p}
                        <button
                          onClick={() => removePlayer(p)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {players.length % 2 === 1 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Numero impar de jugadores — uno recibira el bye.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {pairs.length === 0 && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={doSortear}
                  disabled={players.length < 2}
                  className="min-w-52 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200 disabled:opacity-50"
                >
                  <Shuffle />
                  Sortear todo
                </Button>
              </div>
            )}

            {/* Result of draw */}
            {pairs.length > 0 && (
              <>
                {byePlayer && (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-center gap-3">
                    <div>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                        Jugador libre (bye): {byePlayer}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Jugara con el primer eliminado del torneo.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="size-4 text-emerald-600" />
                    <h2 className="font-semibold text-sm">{pairs.length} parejas formadas</h2>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {pairs.map((pair, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-xl border bg-white dark:bg-zinc-900 px-4 py-2.5 shadow-sm"
                      >
                        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold tabular-nums">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {pair[0]}
                          <span className="text-emerald-500 mx-1.5 font-bold">&amp;</span>
                          {pair[1]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button variant="outline" onClick={resetSort} className="min-w-36">
                    <Shuffle />
                    Re-sortear
                  </Button>
                  <Button
                    onClick={armarGrupos}
                    disabled={pairs.length < 3}
                    className="min-w-36 bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200 disabled:opacity-50"
                  >
                    Armar grupos
                    <ChevronRight />
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* ══ GROUPS PHASE ═══════════════════════════════════════════════════ */}
        {phase === "groups" && (
          <section className="space-y-5">
            {/* Controls bar */}
            <div className="flex items-center gap-3 flex-wrap">
              {!tournamentStarted ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={volverSorteo}
                  className="text-muted-foreground"
                >
                  <ChevronLeft />
                  Volver al sorteo
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3" />
                  Torneo en curso — sorteo bloqueado
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Avanzan por grupo:</span>
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setAdvancing(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                      advancing === n
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-800 border text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Global bye banner */}
            {byePlayer && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 flex items-center gap-2 text-sm">
                <Badge className="bg-amber-200 text-amber-800 border-0 shrink-0">Bye</Badge>
                <span className="font-semibold text-amber-800 dark:text-amber-200">{byePlayer}</span>
                <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
                  jugara con el primer eliminado
                </span>
              </div>
            )}

            {groups.map((group, gi) => {
              const standings = getStandings(group);
              const completed = group.matches.filter(
                (m) => m.score1 !== "" && m.score2 !== ""
              ).length;
              const total = group.matches.length;
              const groupDone = completed === total;

              return (
                <Card key={group.id} className="bg-white dark:bg-zinc-900">
                  <CardHeader>
                    <CardTitle className="font-bold">{group.name}</CardTitle>
                    <CardAction>
                      <Badge
                        className={
                          groupDone
                            ? "bg-emerald-100 text-emerald-700 border-0"
                            : "bg-amber-100 text-amber-700 border-0"
                        }
                      >
                        {groupDone ? "Completo" : `${completed}/${total} partidos`}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {group.byePlayer && (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <span className="font-semibold">{group.byePlayer}</span>
                        <span>— jugador libre en este grupo</span>
                      </div>
                    )}

                    {/* Matches */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                        Partidos
                      </p>
                      <div className="space-y-3">
                        {group.matches.map((m, mi) => {
                          const s1 = parseInt(m.score1), s2 = parseInt(m.score2);
                          const done = m.score1 !== "" && m.score2 !== "" && !isNaN(s1) && !isNaN(s2) && s1 !== s2;
                          const w = done ? (s1 > s2 ? m.team1Idx : m.team2Idx) : null;

                          return (
                            <div
                              key={mi}
                              className={`rounded-xl border px-4 py-3 space-y-2 ${
                                done
                                  ? "bg-emerald-50/70 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800"
                                  : "bg-white dark:bg-zinc-800/50"
                              }`}
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Partido {mi + 1} de {total}
                              </p>

                              <div className="flex items-center gap-3">
                                <span className={`flex-1 text-sm min-w-0 truncate ${w === m.team1Idx ? "font-bold text-emerald-700 dark:text-emerald-400" : "font-medium"}`}>
                                  {teamLabel(group.teams[m.team1Idx])}
                                  {w === m.team1Idx && <span className="ml-1 text-xs"> Gano</span>}
                                </span>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={m.score1}
                                  onChange={(e) => updateGroupScore(gi, mi, "score1", e.target.value)}
                                  className="w-14 text-center h-8 text-base shrink-0"
                                  placeholder="—"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">vs</span>
                                <div className="flex-1 h-px bg-border" />
                              </div>

                              <div className="flex items-center gap-3">
                                <span className={`flex-1 text-sm min-w-0 truncate ${w === m.team2Idx ? "font-bold text-emerald-700 dark:text-emerald-400" : "font-medium"}`}>
                                  {teamLabel(group.teams[m.team2Idx])}
                                  {w === m.team2Idx && <span className="ml-1 text-xs"> Gano</span>}
                                </span>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={m.score2}
                                  onChange={(e) => updateGroupScore(gi, mi, "score2", e.target.value)}
                                  className="w-14 text-center h-8 text-base shrink-0"
                                  placeholder="—"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Separator />

                    {/* Standings */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                        Tabla de posiciones
                      </p>
                      <div className="rounded-xl overflow-hidden border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/40 text-xs text-muted-foreground">
                              <th className="text-left px-3 py-2 w-6">#</th>
                              <th className="text-left px-3 py-2">Equipo</th>
                              <th className="text-center px-2 py-2 w-8">V</th>
                              <th className="text-center px-2 py-2 w-8">D</th>
                              <th className="text-center px-2 py-2 w-8">GF</th>
                              <th className="text-center px-2 py-2 w-8">GC</th>
                              <th className="text-center px-2 py-2 w-10">Dif</th>
                              <th className="px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((row, pos) => (
                              <tr
                                key={row.idx}
                                className={`border-t ${pos < advancing ? "bg-emerald-50 dark:bg-emerald-900/10" : ""}`}
                              >
                                <td className="px-3 py-2">
                                  <span className={`text-xs font-bold ${pos === 0 ? "text-emerald-600" : pos === 1 && advancing === 2 ? "text-teal-600" : "text-muted-foreground"}`}>
                                    {pos + 1}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={pos < advancing ? "font-semibold" : ""}>
                                    {teamLabel(row.team)}
                                  </span>
                                </td>
                                <td className="text-center px-2 py-2 tabular-nums text-emerald-600 font-semibold">{row.wins}</td>
                                <td className="text-center px-2 py-2 tabular-nums text-red-500">{row.losses}</td>
                                <td className="text-center px-2 py-2 tabular-nums">{row.gf}</td>
                                <td className="text-center px-2 py-2 tabular-nums">{row.ga}</td>
                                <td className="text-center px-2 py-2 tabular-nums text-muted-foreground">
                                  {row.gf - row.ga > 0 ? "+" : ""}{row.gf - row.ga}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {pos < advancing && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full whitespace-nowrap">
                                      Clasifica
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Orden: Victorias → Diferencia de games → Games a favor
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {allGroupsDone && (
              <>
                <Separator />
                <div className="flex flex-col items-center gap-2">
                  <Button
                    size="lg"
                    onClick={armarLlaves}
                    className="min-w-48 bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200"
                  >
                    Armar llaves
                    <ChevronRight />
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {advancing === 1 ? "El primero" : "Los dos primeros"} de cada grupo pasan a las llaves
                  </p>
                </div>
              </>
            )}
          </section>
        )}

        {/* ══ BRACKET PHASE ══════════════════════════════════════════════════ */}
        {phase === "bracket" && (
          <section className="space-y-10">
            {winner && (
              <div className="flex justify-center">
                <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-2 border-amber-300 dark:border-amber-600 rounded-2xl px-10 py-7 text-center">
                  <Trophy className="size-10 text-amber-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">
                      Campeones!
                    </p>
                    <p className="text-2xl font-bold">{teamLabel(winner)}</p>
                  </div>
                </div>
              </div>
            )}

            {bracketRounds.map((round, ri) => {
              const isCurrent = ri === bracketRounds.length - 1;
              return (
                <div key={ri} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className={`text-xs font-bold uppercase tracking-widest px-3 ${isCurrent ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"}`}>
                      {round.label}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {round.matches.map((m, mi) => {
                      const w = matchWinner(m);
                      const done = w !== null;
                      return (
                        <Card key={mi} className={`bg-white dark:bg-zinc-900 overflow-hidden ${!isCurrent ? "opacity-75" : ""}`}>
                          <div className={`h-1 ${done ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />
                          <CardContent className="pt-4 pb-4 space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Partido {mi + 1}
                            </p>

                            <div className="flex items-center gap-2">
                              <span className={`flex-1 text-sm truncate ${done && w === m.team1 ? "font-bold text-emerald-700 dark:text-emerald-400" : "font-medium"}`}>
                                {teamLabel(m.team1)}
                              </span>
                              {isCurrent ? (
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={m.score1}
                                  onChange={(e) => updateBracketScore(ri, mi, "score1", e.target.value)}
                                  className="w-12 text-center h-8 text-sm shrink-0"
                                  placeholder="0"
                                />
                              ) : (
                                <span className={`w-12 text-center text-sm font-bold shrink-0 ${done && w === m.team1 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                  {m.score1}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">vs</span>
                              <div className="flex-1 h-px bg-border" />
                              <div className="w-12" />
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`flex-1 text-sm truncate ${done && w === m.team2 ? "font-bold text-emerald-700 dark:text-emerald-400" : "font-medium"}`}>
                                {teamLabel(m.team2)}
                              </span>
                              {isCurrent ? (
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={m.score2}
                                  onChange={(e) => updateBracketScore(ri, mi, "score2", e.target.value)}
                                  className="w-12 text-center h-8 text-sm shrink-0"
                                  placeholder="0"
                                />
                              ) : (
                                <span className={`w-12 text-center text-sm font-bold shrink-0 ${done && w === m.team2 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                  {m.score2}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {round.bye && (
                    <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/20 px-4 py-3 bg-muted/20">
                      <Badge variant="outline">Libre</Badge>
                      <span className="text-sm font-medium">{teamLabel(round.bye)}</span>
                      <span className="text-xs text-muted-foreground">— avanza automaticamente</span>
                    </div>
                  )}

                  {isCurrent && canAdvance && (
                    <div className="flex justify-center">
                      <Button
                        size="lg"
                        onClick={avanzarRonda}
                        className="min-w-48 bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200"
                      >
                        Siguiente ronda
                        <ChevronRight />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-center pt-4">
              <Button size="lg" variant="outline" onClick={reiniciar} className="min-w-48">
                <RotateCcw />
                Nuevo torneo
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
