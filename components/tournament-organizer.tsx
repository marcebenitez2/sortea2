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

// Jugadores del Bombo 1 que NO pueden emparejarse con los del Bombo 2 listados abajo,
// ni pueden quedar en el mismo grupo que sus parejas.
const RESTRICTED_BOMBO1 = new Set(["teo", "juani"]);
const RESTRICTED_BOMBO2 = new Set(["mariana", "ceci", "bibi", "luchi", "luciana"]);

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

function groupSizesLabel(n: number, g: number): string {
  const g2 = Math.min(g, n);
  const base = Math.floor(n / g2);
  const extras = n % g2;
  if (extras === 0) return `${g2} grupos de ${base}`;
  return `${extras} de ${base + 1} y ${g2 - extras} de ${base}`;
}

function createGroups(pairs: Team[], byePlayer: string | null, numGroups: number): Group[] {
  const n = pairs.length;
  const g = Math.min(Math.max(1, numGroups), n);
  const baseSize = Math.floor(n / g);
  const extras = n % g;
  const sizes = Array.from({ length: g }, (_, i) => baseSize + (i < extras ? 1 : 0));

  // Split pairs into three categories for constraint-aware placement
  const isRestB1 = (p: Team) => RESTRICTED_BOMBO1.has(p[0].toLowerCase()) || RESTRICTED_BOMBO1.has(p[1].toLowerCase());
  const isRestB2 = (p: Team) => RESTRICTED_BOMBO2.has(p[0].toLowerCase()) || RESTRICTED_BOMBO2.has(p[1].toLowerCase());
  const teoPairs     = shuffle(pairs.filter(p => isRestB1(p)));
  const restPairs    = shuffle(pairs.filter(p => !isRestB1(p) && isRestB2(p)));
  const freePairs    = shuffle(pairs.filter(p => !isRestB1(p) && !isRestB2(p)));

  const buckets: Team[][] = Array.from({ length: g }, () => []);

  // 1. Place teo/juani pairs — one per group when possible
  const groupOrder = shuffle(Array.from({ length: g }, (_, i) => i));
  let ti = 0;
  for (const gi of groupOrder) {
    if (ti >= teoPairs.length) break;
    buckets[gi].push(teoPairs[ti++]);
  }
  const teoGroups = new Set(groupOrder.slice(0, teoPairs.length));

  // 2. Place restricted B2 pairs — only in groups WITHOUT teo/juani pairs
  const safeForRest = shuffle(groupOrder.filter(gi => !teoGroups.has(gi)));
  let ri = 0;
  for (const gi of safeForRest) {
    while (ri < restPairs.length && buckets[gi].length < sizes[gi])
      buckets[gi].push(restPairs[ri++]);
  }
  // Overflow: if safe groups are full, distribute to remaining capacity (best effort)
  for (let gi = 0; gi < g && ri < restPairs.length; gi++) {
    while (ri < restPairs.length && buckets[gi].length < sizes[gi])
      buckets[gi].push(restPairs[ri++]);
  }

  // 3. Fill remaining slots with free pairs
  let fi = 0;
  for (let gi = 0; gi < g; gi++) {
    while (fi < freePairs.length && buckets[gi].length < sizes[gi])
      buckets[gi].push(freePairs[fi++]);
  }

  return buckets.map((teams, i) => ({
    id: `g${i}`,
    name: `Grupo ${String.fromCharCode(65 + i)}`,
    teams,
    matches: roundRobin(teams.length),
    byePlayer: i === g - 1 ? byePlayer : null,
  }));
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
  const [players2, setPlayers2] = useState<string[]>(saved.players2 ?? []);
  const [playerInput2, setPlayerInput2] = useState("");
  const [twoListMode, setTwoListMode] = useState<boolean>(saved.twoListMode ?? false);
  const [pairs, setPairs] = useState<Team[]>(saved.pairs ?? []);
  const [byePlayer, setByePlayer] = useState<string | null>(saved.byePlayer ?? null);
  const [doublePlayer, setDoublePlayer] = useState<string | null>(saved.doublePlayer ?? null);
  const [phase, setPhase] = useState<Phase>(saved.phase ?? "sorting");
  const [groups, setGroups] = useState<Group[]>(saved.groups ?? []);
  const [numGroups, setNumGroups] = useState<number>(saved.numGroups ?? 4);
  const [advancing, setAdvancing] = useState<1 | 2>(saved.advancing ?? 2);
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>(saved.bracketRounds ?? []);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(SK, JSON.stringify(
        { players, players2, twoListMode, pairs, byePlayer, doublePlayer, phase, groups, numGroups, advancing, bracketRounds }
      ));
    } catch {}
  }, [players, players2, twoListMode, pairs, byePlayer, doublePlayer, phase, groups, numGroups, advancing, bracketRounds]);

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  function withTransition(msg: string, action: () => void, delay = 900) {
    setIsTransitioning(true);
    setTransitionMsg(msg);
    setTimeout(() => {
      action();
      setIsTransitioning(false);
    }, delay);
  }

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

  function addPlayer2() {
    const name = playerInput2.trim();
    if (!name || players2.includes(name)) return;
    setPlayers2((p) => [...p, name]);
    setPlayerInput2("");
  }

  function removePlayer2(name: string) {
    setPlayers2((p) => p.filter((pl) => pl !== name));
  }

  function doSortear() {
    let resultPairs: Team[] = [];
    let resultBye: string | null = null;
    let resultDouble: string | null = null;

    if (twoListMode) {
      if (players.length < 1 || players2.length < 1 || Math.abs(players.length - players2.length) > 1) return;
      const rb1 = shuffle(players.filter(p => RESTRICTED_BOMBO1.has(p.toLowerCase())));
      const fb1 = shuffle(players.filter(p => !RESTRICTED_BOMBO1.has(p.toLowerCase())));
      const rb2 = shuffle(players2.filter(p => RESTRICTED_BOMBO2.has(p.toLowerCase())));
      const fb2 = shuffle(players2.filter(p => !RESTRICTED_BOMBO2.has(p.toLowerCase())));
      if (fb2.length >= rb1.length && fb1.length >= rb2.length) {
        for (let i = 0; i < rb1.length; i++) resultPairs.push([rb1[i], fb2[i]]);
        for (let i = 0; i < rb2.length; i++) resultPairs.push([fb1[i], rb2[i]]);
        const remFb1 = fb1.slice(rb2.length);
        const remFb2 = fb2.slice(rb1.length);
        const minLen = Math.min(remFb1.length, remFb2.length);
        for (let i = 0; i < minLen; i++) resultPairs.push([remFb1[i], remFb2[i]]);
        if (remFb2.length > remFb1.length) {
          const idx = Math.floor(Math.random() * remFb1.length);
          resultDouble = remFb1[idx];
          resultPairs.push([resultDouble, remFb2[minLen]]);
        } else if (remFb1.length > remFb2.length) {
          const idx = Math.floor(Math.random() * remFb2.length);
          resultDouble = remFb2[idx];
          resultPairs.push([remFb1[minLen], resultDouble]);
        }
      } else {
        const s1 = shuffle([...players]);
        const s2 = shuffle([...players2]);
        const minLen = Math.min(s1.length, s2.length);
        for (let i = 0; i < minLen; i++) resultPairs.push([s1[i], s2[i]]);
        if (s2.length > s1.length) {
          const idx = Math.floor(Math.random() * s1.length);
          resultDouble = s1[idx];
          resultPairs.push([resultDouble, s2[minLen]]);
        } else if (s1.length > s2.length) {
          const idx = Math.floor(Math.random() * s2.length);
          resultDouble = s2[idx];
          resultPairs.push([s1[minLen], resultDouble]);
        }
      }
    } else {
      if (players.length < 2) return;
      const shuffled = shuffle(players);
      for (let i = 0; i + 1 < shuffled.length; i += 2)
        resultPairs.push([shuffled[i], shuffled[i + 1]]);
      resultBye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;
    }

    withTransition("Sorteando parejas...", () => {
      setPairs(resultPairs);
      setByePlayer(resultBye);
      setDoublePlayer(resultDouble);
    }, 1200);
  }

  function resetSort() {
    setPairs([]);
    setByePlayer(null);
    setDoublePlayer(null);
  }

  function armarGrupos() {
    const newGroups = createGroups(pairs, byePlayer, numGroups);
    withTransition("Armando grupos...", () => {
      setGroups(newGroups);
      setPhase("groups");
    });
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
    const bracket = buildInitialBracket(groups, advancing);
    withTransition("Armando llaves...", () => {
      setBracketRounds([bracket]);
      setPhase("bracket");
    });
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
    if (!nr) return;
    withTransition("Avanzando ronda...", () => {
      setBracketRounds((p) => [...p, nr]);
    }, 700);
  }

  function reiniciar() {
    try { localStorage.removeItem(SK); } catch {}
    setPlayers(DEFAULT_PLAYERS);
    setPlayers2([]);
    setPlayerInput("");
    setPlayerInput2("");
    setTwoListMode(false);
    setPairs([]);
    setByePlayer(null);
    setDoublePlayer(null);
    setGroups([]);
    setNumGroups(4);
    setBracketRounds([]);
    setAdvancing(2);
    setPhase("sorting");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-md">
        <div className="px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Torneito</h1>
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

      <main className="px-6 py-6 space-y-6">

        {/* ══ LOADING OVERLAY ════════════════════════════════════════════════ */}
        {isTransitioning && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="relative size-20">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100 dark:border-emerald-900/40" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
              <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-teal-400 animate-spin [animation-duration:0.7s] [animation-direction:reverse]" />
            </div>
            <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 animate-pulse tracking-wide">
              {transitionMsg}
            </p>
          </div>
        )}

        {/* ══ SORTING PHASE ══════════════════════════════════════════════════ */}
        {!isTransitioning && phase === "sorting" && (
          <>
            {/* Mode toggle — only shown before draw */}
            {pairs.length === 0 && (
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs text-muted-foreground mr-2">Modo:</span>
                {(["single", "double"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTwoListMode(mode === "double")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      (mode === "double") === twoListMode
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-800 border text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    }`}
                  >
                    {mode === "single" ? "Una lista" : "Dos listas"}
                  </button>
                ))}
              </div>
            )}

            {/* Single list */}
            {pairs.length === 0 && !twoListMode && (
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
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre del jugador…"
                      value={playerInput}
                      autoComplete="off"
                      onChange={(e) => setPlayerInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                    />
                    <Button variant="outline" onClick={addPlayer} className="shrink-0">
                      <Plus />
                      Agregar
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

            {/* Two lists */}
            {pairs.length === 0 && twoListMode && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="bg-white dark:bg-zinc-900">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Lista 1</CardTitle>
                    <CardAction>
                      <Badge className="bg-emerald-100 text-emerald-700 border-0">{players.length}</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nombre del jugador…"
                        value={playerInput}
                        autoComplete="off"
                        onChange={(e) => setPlayerInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                      />
                      <Button variant="outline" onClick={addPlayer} className="shrink-0">
                        <Plus />
                        Agregar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {players.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-medium">
                          {p}
                          <button onClick={() => removePlayer(p)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Lista 2</CardTitle>
                    <CardAction>
                      <Badge className="bg-teal-100 text-teal-700 border-0">{players2.length}</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nombre del jugador…"
                        value={playerInput2}
                        autoComplete="off"
                        onChange={(e) => setPlayerInput2(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addPlayer2()}
                      />
                      <Button variant="outline" onClick={addPlayer2} className="shrink-0">
                        <Plus />
                        Agregar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {players2.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-medium">
                          {p}
                          <button onClick={() => removePlayer2(p)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Error: diff > 1 */}
            {pairs.length === 0 && twoListMode && players.length > 0 && players2.length > 0 && Math.abs(players.length - players2.length) > 1 && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  La diferencia entre bombos no puede ser mayor a 1 jugador.
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  Bombo 1: {players.length} · Bombo 2: {players2.length} (diferencia: {Math.abs(players.length - players2.length)})
                </p>
              </div>
            )}

            {/* Info: diff === 1 → habrá doble participación */}
            {pairs.length === 0 && twoListMode && players.length > 0 && players2.length > 0 && Math.abs(players.length - players2.length) === 1 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Un jugador del bombo más chico tendrá doble participación.
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Bombo 1: {players.length} · Bombo 2: {players2.length} — se sortearán {Math.max(players.length, players2.length)} parejas en total.
                </p>
              </div>
            )}

            {pairs.length === 0 && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={doSortear}
                  disabled={
                    twoListMode
                      ? players.length < 1 || players2.length < 1 || Math.abs(players.length - players2.length) > 1
                      : players.length < 2
                  }
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

                {doublePlayer && (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3">
                    <Badge className="bg-amber-400 text-white border-0 shrink-0 mt-0.5">×2</Badge>
                    <div>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                        Doble participación: {doublePlayer}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        Este jugador aparece en dos parejas distintas y puede jugar ambas normalmente.
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
                    {pairs.map((pair, i) => {
                      const d1 = doublePlayer === pair[0];
                      const d2 = doublePlayer === pair[1];
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-sm ${d1 || d2 ? "border-amber-300 bg-amber-50 dark:bg-amber-900/10" : "bg-white dark:bg-zinc-900"}`}
                        >
                          <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold tabular-nums">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium min-w-0 flex items-center gap-1 flex-wrap">
                            <span className={d1 ? "text-amber-700 dark:text-amber-300 font-bold" : ""}>{pair[0]}</span>
                            {d1 && <span className="text-[10px] bg-amber-200 text-amber-800 px-1 rounded-full font-semibold">×2</span>}
                            <span className="text-emerald-500 font-bold">&amp;</span>
                            <span className={d2 ? "text-amber-700 dark:text-amber-300 font-bold" : ""}>{pair[1]}</span>
                            {d2 && <span className="text-[10px] bg-amber-200 text-amber-800 px-1 rounded-full font-semibold">×2</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Group count selector */}
                <div className="rounded-xl border bg-white dark:bg-zinc-900 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground">Cantidad de grupos:</span>
                    <div className="flex gap-1">
                      {[2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNumGroups(n)}
                          disabled={n > pairs.length}
                          className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            numGroups === n
                              ? "bg-teal-600 text-white shadow-sm"
                              : "bg-zinc-100 dark:bg-zinc-800 border text-muted-foreground hover:bg-teal-50 dark:hover:bg-teal-900/20"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pairs.length} parejas → {groupSizesLabel(pairs.length, numGroups)}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button variant="outline" onClick={resetSort} className="min-w-36">
                    <Shuffle />
                    Re-sortear
                  </Button>
                  <Button
                    onClick={armarGrupos}
                    disabled={pairs.length < 2}
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
        {!isTransitioning && phase === "groups" && (
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
                                  <span className={`${pos < advancing ? "font-semibold" : ""} inline-flex items-center gap-1`}>
                                    {teamLabel(row.team)}
                                    {doublePlayer && (row.team[0] === doublePlayer || row.team[1] === doublePlayer) && (
                                      <span className="text-[10px] bg-amber-200 text-amber-800 px-1 rounded-full font-semibold">×2</span>
                                    )}
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
        {!isTransitioning && phase === "bracket" && (
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
