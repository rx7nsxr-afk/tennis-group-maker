import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Shuffle, Printer, BookOpen, Plus, Trash2, Trophy, Smartphone, Users, Table2, Link2 } from "lucide-react";
import { motion } from "framer-motion";

const STORAGE_KEY = "tennis-practice-app-v2";
const ROSTER_STORAGE_KEY = "tennis-practice-roster-v5";
const FIXED_PAIR_STORAGE_KEY = "tennis-practice-fixed-pairs-v2";

const FACULTY_ORDER = [
  "PP", "PL", "Z", "G", "MB", "N", "SP", "SC", "SB", "HS", "ML", "ET", "CE", "RT", "RE", "PT", "OT", "ST", "OV", "FU",
];
const YEAR_OPTIONS = ["OB", "3年", "2年", "1年"];
const ROLE_OPTIONS = ["なし", "主将", "男子副将", "女子副将", "主務", "副務", "会計"];
const ROLE_PRIORITY = { 主将: 0, 男子副将: 1, 女子副将: 2, 主務: 3, 副務: 4, 会計: 5, なし: 99 };
const YEAR_PRIORITY = { OB: 0, "3年": 1, "2年": 2, "1年": 3 };
const FACULTY_PRIORITY = Object.fromEntries(FACULTY_ORDER.map((code, idx) => [code, idx]));
const COURT_LEVEL_OPTIONS = ["1~2", "2~3", "3~4"];
const PRACTICE_GROUP_OPTIONS = [2, 3, 4];
const PRACTICE_MATCH_MODE_OPTIONS = [
  { value: "strict", label: "通常（レベル差1まで）" },
  { value: "edge-relaxed", label: "端レベル拡張（1は1〜3、4は2〜4）" },
  { value: "free", label: "完全ランダム（誰とでも組める）" },
];
const COURT_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const LEVEL_OPTIONS = [1, 2, 3, 4];
const TWO_PAIR_OPTIONS = [0, 1, 2, 3];
const THREE_PAIR_OPTIONS = [0, 1, 2];
const PAIRING_OPTIMIZATION_TRIALS = 24;

function fisherYatesShuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffle(arr) {
  return fisherYatesShuffle(arr);
}

function displayName(player) {
  return player.yearCategory === "OB" ? `${player.name}さん` : player.name;
}

function roleRank(role) {
  return ROLE_PRIORITY[role] ?? 999;
}

function yearRank(yearCategory) {
  return YEAR_PRIORITY[yearCategory] ?? 999;
}

function facultyRank(faculty) {
  return FACULTY_PRIORITY[faculty] ?? 999;
}

function comparePlayers(a, b) {
  if (a.yearCategory === "OB" && b.yearCategory !== "OB") return -1;
  if (a.yearCategory !== "OB" && b.yearCategory === "OB") return 1;

  if (a.yearCategory === "OB" && b.yearCategory === "OB") {
    const gen = Number(a.obGeneration ?? 999) - Number(b.obGeneration ?? 999);
    if (gen !== 0) return gen;

    const role = roleRank(a.role) - roleRank(b.role);
    if (role !== 0) return role;

    const fac = facultyRank(a.faculty) - facultyRank(b.faculty);
    if (fac !== 0) return fac;

    return a.name.localeCompare(b.name, "ja");
  }

  const role = roleRank(a.role) - roleRank(b.role);
  if (role !== 0) return role;

  const year = yearRank(a.yearCategory) - yearRank(b.yearCategory);
  if (year !== 0) return year;

  const fac = facultyRank(a.faculty) - facultyRank(b.faculty);
  if (fac !== 0) return fac;

  return a.name.localeCompare(b.name, "ja");
}

function sortByPriority(players) {
  return [...players].sort(comparePlayers);
}

function parseCourtBand(label) {
  const [min, max] = label.split("~").map(Number);
  return { min, max };
}

function inCourtBand(level, bandLabel) {
  const { min, max } = parseCourtBand(bandLabel);
  return level >= min && level <= max;
}

function pairNameKey(a, b) {
  return [a, b].sort().join("__");
}

function buildPastPairMap(practiceHistory) {
  const map = new Map();

  practiceHistory.forEach((practice) => {
    if (practice.mode === "doubles") {
      (practice.rows || []).forEach((row) => {
        ([...(row.pairs || []), ...(row.triples || [])]).forEach((pair) => {
          if (pair.length < 2) return;

          for (let i = 0; i < pair.length; i += 1) {
            for (let j = i + 1; j < pair.length; j += 1) {
              const key = pairNameKey(pair[i], pair[j]);
              map.set(key, (map.get(key) || 0) + 1);
            }
          }
        });
      });
      return;
    }

    if (practice.mode === "practice") {
      (practice.groups || []).forEach((group) => {
        const members = group.members || [];
        if (members.length < 2) return;

        for (let i = 0; i < members.length; i += 1) {
          for (let j = i + 1; j < members.length; j += 1) {
            const key = pairNameKey(members[i], members[j]);
            map.set(key, (map.get(key) || 0) + 1);
          }
        }
      });
    }
  });

  return map;
}

function repeatedPairCountByNames(names, pastPairMap) {
  let total = 0;
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      total += pastPairMap.get(pairNameKey(names[i], names[j])) || 0;
    }
  }
  return total;
}

function scoreMemberGroup(members, pastPairMap) {
  return repeatedPairCountByNames(members.map((member) => member.name), pastPairMap);
}

function scoreNameGroup(names, pastPairMap) {
  return repeatedPairCountByNames(names, pastPairMap);
}

function scorePracticeGroups(groups, pastPairMap) {
  return groups.reduce((sum, group) => sum + scoreNameGroup(group.members, pastPairMap), 0);
}

function scoreDoublesRows(rows, pastPairMap) {
  return rows.reduce((sum, row) => {
    const pairScore = (row.pairs || []).reduce((pairSum, pair) => pairSum + scoreNameGroup(pair, pastPairMap), 0);
    const tripleScore = (row.triples || []).reduce((tripleSum, triple) => tripleSum + scoreNameGroup(triple, pastPairMap), 0);
    return sum + pairScore + tripleScore;
  }, 0);
}

function chooseAdditionalMembers(anchor, pool, needCount, pastPairMap) {
  const eligible = pool.filter((p) => Math.abs(Number(p.level) - Number(anchor.level)) <= 1);
  if (eligible.length === 0) return [];

  const chosen = [];
  let remaining = shuffle(eligible);

  while (chosen.length < needCount && remaining.length > 0) {
    remaining.sort((a, b) => {
      const aNames = [anchor.name, ...chosen.map((x) => x.name), a.name];
      const bNames = [anchor.name, ...chosen.map((x) => x.name), b.name];
      const aPenalty = repeatedPairCountByNames(aNames, pastPairMap);
      const bPenalty = repeatedPairCountByNames(bNames, pastPairMap);
      if (aPenalty !== bPenalty) return aPenalty - bPenalty;

      const aDiff = Math.abs(Number(a.level) - Number(anchor.level));
      const bDiff = Math.abs(Number(b.level) - Number(anchor.level));
      if (aDiff !== bDiff) return aDiff - bDiff;

      const priorityDiff = comparePlayers(a, b);
      if (priorityDiff !== 0) return priorityDiff;
      return Math.random() - 0.5;
    });

    const picked = remaining.shift();
    chosen.push(picked);
    remaining = remaining.filter((p) => p.id !== picked.id);
  }

  return chosen;
}

function canJoinPractice(anchorLevel, candidateLevel, mode) {
  const a = Number(anchorLevel);
  const b = Number(candidateLevel);

  if (mode === "free") return true;
  if (mode === "strict") return Math.abs(a - b) <= 1;

  if (mode === "edge-relaxed") {
    if (a === 1) return [1, 2, 3].includes(b);
    if (a === 4) return [2, 3, 4].includes(b);
    return Math.abs(a - b) <= 1;
  }

  return Math.abs(a - b) <= 1;
}

function canAddToPracticeGroup(anchor, chosen, candidate, mode) {
  if (!canJoinPractice(anchor.level, candidate.level, mode)) return false;

  const currentMembers = [anchor, ...chosen];
  const hasObAlready = currentMembers.some((member) => member.yearCategory === "OB");

  if (candidate.yearCategory === "OB" && hasObAlready) return false;
  return true;
}

function choosePracticeMembers(anchor, pool, needCount, pastPairMap, mode) {
  const chosen = [];
  let remainingPool = shuffle(pool);

  while (chosen.length < needCount && remainingPool.length > 0) {
    const eligible = remainingPool.filter((p) => canAddToPracticeGroup(anchor, chosen, p, mode));
    if (eligible.length === 0) break;

    let remaining = shuffle(eligible);
    remaining.sort((a, b) => {
      const aNames = [anchor.name, ...chosen.map((x) => x.name), a.name];
      const bNames = [anchor.name, ...chosen.map((x) => x.name), b.name];
      const aPenalty = repeatedPairCountByNames(aNames, pastPairMap);
      const bPenalty = repeatedPairCountByNames(bNames, pastPairMap);
      if (aPenalty !== bPenalty) return aPenalty - bPenalty;

      const aDiff = Math.abs(Number(a.level) - Number(anchor.level));
      const bDiff = Math.abs(Number(b.level) - Number(anchor.level));
      if (mode !== "free" && aDiff !== bDiff) return aDiff - bDiff;

      return Math.random() - 0.5;
    });

    const picked = remaining.shift();
    chosen.push(picked);
    remainingPool = remainingPool.filter((p) => p.id !== picked.id);
  }

  return chosen;
}

function makePairsForCourt(players, twoPlayerPairCount, threePlayerPairCount, fixedPairs, pastPairMap) {
  const tryBuild = () => {
    const pairs = [];
    const triples = [];
    const usedIds = new Set();

    fixedPairs.forEach((fixedPair) => {
      const found = fixedPair.memberIds
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean);

      if (found.length === 2 && !usedIds.has(found[0].id) && !usedIds.has(found[1].id)) {
        pairs.push(found.map((p) => displayName(p)));
        usedIds.add(found[0].id);
        usedIds.add(found[1].id);
      }
    });

    let available = fisherYatesShuffle(players.filter((p) => !usedIds.has(p.id)));

    while (available.length > 0 && pairs.length < twoPlayerPairCount) {
      const first = available.shift();
      if (!first) break;

      if (available.length === 0) {
        triples.push([displayName(first)]);
        break;
      }

      available.sort((a, b) => {
        const aPenalty = scoreMemberGroup([first, a], pastPairMap);
        const bPenalty = scoreMemberGroup([first, b], pastPairMap);
        if (aPenalty !== bPenalty) return aPenalty - bPenalty;

        const aDiff = Math.abs(Number(a.level) - Number(first.level));
        const bDiff = Math.abs(Number(b.level) - Number(first.level));
        if (aDiff !== bDiff) return aDiff - bDiff;

        return Math.random() - 0.5;
      });

      const second = available.shift();
      pairs.push([displayName(first), displayName(second)]);
    }

    while (available.length > 0 && triples.length < threePlayerPairCount) {
      const first = available.shift();
      if (!first) break;

      const triple = [first];
      available.sort((a, b) => {
        const aPenalty = scoreMemberGroup([...triple, a], pastPairMap);
        const bPenalty = scoreMemberGroup([...triple, b], pastPairMap);
        if (aPenalty !== bPenalty) return aPenalty - bPenalty;

        const aDiff = Math.abs(Number(a.level) - Number(first.level));
        const bDiff = Math.abs(Number(b.level) - Number(first.level));
        if (aDiff !== bDiff) return aDiff - bDiff;
        return Math.random() - 0.5;
      });

      while (triple.length < 3 && available.length > 0) {
        triple.push(available.shift());
      }

      triples.push(triple.map((p) => displayName(p)));
    }

    return {
      pairs,
      triples,
      leftovers: available.map((p) => displayName(p)),
    };
  };

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < PAIRING_OPTIMIZATION_TRIALS; i += 1) {
    const candidate = tryBuild();
    const candidateScore = scoreDoublesRows([{ pairs: candidate.pairs, triples: candidate.triples }], pastPairMap);
    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return best || { pairs: [], triples: [], leftovers: [] };
}

function generateDoublesPlan(players, settings, practiceHistory, fixedPairs) {
  const active = sortByPriority(players.filter((p) => p.present));
  const activeById = new Map(active.map((p) => [p.id, p]));
  const pastPairMap = buildPastPairMap(practiceHistory);

  const usableFixedPairs = fixedPairs
    .map((pair) => ({ ...pair, members: pair.memberIds.map((id) => activeById.get(id)).filter(Boolean) }))
    .filter((pair) => pair.members.length === 2);

  const fixedMemberIds = new Set(usableFixedPairs.flatMap((pair) => pair.memberIds));
  const remaining = fisherYatesShuffle(active.filter((p) => !fixedMemberIds.has(p.id)));

  const rows = settings.courts.map((court) => ({
    courtNumber: court.courtNumber,
    courtLevel: court.levelBand,
    fixedPairs: [],
    pairs: [],
    triples: [],
    players: [],
    leftovers: [],
  }));

  usableFixedPairs.forEach((pair) => {
    const manualCourt = Number(pair.preferredCourt ?? 0);
    const targetByManual = manualCourt > 0 ? rows.find((row) => row.courtNumber === manualCourt) : null;
    const avgLevel = (Number(pair.members[0].level) + Number(pair.members[1].level)) / 2;
    const preferredRow = rows.find((row) => inCourtBand(avgLevel, row.courtLevel) && row.fixedPairs.length < Number(settings.twoPlayerPairCount));
    const fallbackRow = rows.find((row) => row.fixedPairs.length < Number(settings.twoPlayerPairCount));
    const targetRow = (targetByManual && targetByManual.fixedPairs.length < Number(settings.twoPlayerPairCount))
      ? targetByManual
      : preferredRow || fallbackRow;
    if (targetRow) targetRow.fixedPairs.push(pair);
  });

  rows.forEach((row) => {
    const fixedPlayers = sortByPriority(row.fixedPairs.flatMap((pair) => pair.members));
    const remainingTwoPairCount = Math.max(Number(settings.twoPlayerPairCount) - row.fixedPairs.length, 0);
    const selectionCount = remainingTwoPairCount * 2 + Number(settings.threePlayerPairCount) * 3;

    const eligibleForAnchor = fisherYatesShuffle(remaining.filter((p) => inCourtBand(Number(p.level), row.courtLevel)));
    const anchor = selectionCount > 0 ? eligibleForAnchor[0] ?? null : null;

    if (anchor) {
      const anchorIndex = remaining.findIndex((p) => p.id === anchor.id);
      if (anchorIndex >= 0) remaining.splice(anchorIndex, 1);
    }

    const others = anchor ? chooseAdditionalMembers(anchor, remaining, Math.max(selectionCount - 1, 0), pastPairMap) : [];
    others.forEach((picked) => {
      const idx = remaining.findIndex((p) => p.id === picked.id);
      if (idx >= 0) remaining.splice(idx, 1);
    });

    const courtPlayers = sortByPriority([...fixedPlayers, ...(anchor ? [anchor] : []), ...others]);
    const pairResult = makePairsForCourt(
      courtPlayers,
      Number(settings.twoPlayerPairCount),
      Number(settings.threePlayerPairCount),
      row.fixedPairs,
      pastPairMap,
    );

    row.players = courtPlayers.map((p) => displayName(p));
    row.pairs = pairResult.pairs;
    row.triples = pairResult.triples;
    row.leftovers = pairResult.leftovers;
  });

  return {
    rows,
    leftovers: [...remaining.map((p) => displayName(p)), ...rows.flatMap((row) => row.leftovers)],
  };
}

function generatePracticePlan(players, groupSize, practiceHistory, matchMode) {
  const active = sortByPriority(players.filter((p) => p.present));
  const pastPairMap = buildPastPairMap(practiceHistory);

  const tryBuild = () => {
    const remaining = [...active];
    const groups = [];
    let groupNumber = 1;

    while (remaining.length > 0) {
      const anchor = remaining[0] ?? null;
      if (!anchor) break;
      remaining.shift();

      const others = choosePracticeMembers(anchor, remaining, groupSize - 1, pastPairMap, matchMode);
      others.forEach((picked) => {
        const idx = remaining.findIndex((p) => p.id === picked.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });

      const members = [displayName(anchor), ...others.map((p) => displayName(p))];
      groups.push({ groupNumber, groupSize: members.length, members });
      groupNumber += 1;
    }

    return { groups, leftovers: remaining.map((p) => displayName(p)) };
  };

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < PAIRING_OPTIMIZATION_TRIALS; i += 1) {
    const candidate = tryBuild();
    const candidateScore = scorePracticeGroups(candidate.groups, pastPairMap) + candidate.leftovers.length * 1000;
    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return best || { groups: [], leftovers: [] };
}

function rehydratePlayers(players = []) {
  return players.map((p) => ({
    ...p,
    id: p.id || crypto.randomUUID(),
    level: Number(p.level ?? 2),
    yearCategory: p.yearCategory || "1年",
    faculty: p.faculty || "PP",
    role: p.role || "なし",
    obGeneration:
      p.obGeneration === "" || p.obGeneration === null || p.obGeneration === undefined
        ? null
        : Number(p.obGeneration),
    present: Boolean(p.present),
  }));
}

function createDefaultCourts(count) {
  return Array.from({ length: count }, (_, idx) => ({
    courtNumber: idx + 1,
    levelBand: idx < 2 ? "1~2" : idx < 4 ? "2~3" : "3~4",
  }));
}

function buildPrintableRowsFromHistory(practiceHistory) {
  return practiceHistory.flatMap((practice) => {
    if (practice.mode === "doubles") {
      return (practice.rows || []).map((row) => ({
        menu: practice.title,
        type: "ダブルス",
        label: `${row.courtNumber}面`,
        level: row.courtLevel,
        slot1: row.pairs[0]?.join(" / ") ?? row.triples[0]?.join(" / ") ?? "-",
        slot2: row.pairs[1]?.join(" / ") ?? row.triples[1]?.join(" / ") ?? "-",
        slot3: row.pairs[2]?.join(" / ") ?? row.triples[2]?.join(" / ") ?? "-",
      }));
    }

    return (practice.groups || []).map((group) => ({
      menu: practice.title,
      type: "対人練",
      label: `${group.groupNumber}組`,
      level: "-",
      slot1: group.members[0] ?? "-",
      slot2: group.members[1] ?? "-",
      slot3: group.members.slice(2).join(" / ") || "-",
    }));
  });
}

const defaultPlayers = [
  {
    id: crypto.randomUUID(),
    name: "榎本",
    level: 4,
    yearCategory: "OB",
    faculty: "FU",
    role: "会計",
    obGeneration: 62,
    present: true,
  },
];

function LabeledSelect({ label, value, onChange, options, className = "h-11", renderValue }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const optionValue = String(option.value ?? option);
            const optionLabel = option.label ?? renderValue?.(option) ?? String(option);
            return (
              <SelectItem key={optionValue} value={optionValue}>
                {optionLabel}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function SectionCard({ title, description, icon: Icon, children, className = "" }) {
  return (
    <Card className={`rounded-2xl shadow-sm print:shadow-none print:border ${className}`.trim()}>
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          {Icon ? <Icon className="h-5 w-5" /> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PlayerRegistration(props) {
  const {
    sortedPlayers,
    newName,
    setNewName,
    newLevel,
    setNewLevel,
    newYearCategory,
    setNewYearCategory,
    newFaculty,
    setNewFaculty,
    newRole,
    setNewRole,
    newObGeneration,
    setNewObGeneration,
    addPlayer,
    updatePlayer,
    removePlayer,
    saveCurrentRoster,
    loadSavedRoster,
    resetTodayPresence,
    selectedPairIds,
    togglePairSelection,
  } = props;

  return (
    <SectionCard
      title="参加者登録"
      description="最初にここで参加者を登録してから、ダブルス・対人練へ移動します。"
      icon={Users}
      className="print:hidden"
    >
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label>名前</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例：榎本"
              className="h-11"
            />
          </div>

          <LabeledSelect
            label="レベル"
            value={newLevel}
            onChange={setNewLevel}
            options={LEVEL_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          />

          <LabeledSelect
            label="学年 / OB"
            value={newYearCategory}
            onChange={setNewYearCategory}
            options={YEAR_OPTIONS}
          />

          <LabeledSelect label="役職" value={newRole} onChange={setNewRole} options={ROLE_OPTIONS} />

          {newYearCategory === "OB" ? (
            <div className="space-y-2">
              <Label>OB期</Label>
              <Input
                type="number"
                min="1"
                value={newObGeneration}
                onChange={(e) => setNewObGeneration(e.target.value)}
                placeholder="例：40"
                className="h-11"
              />
            </div>
          ) : null}

          <LabeledSelect label="学部" value={newFaculty} onChange={setNewFaculty} options={FACULTY_ORDER} />

          <div className="flex items-end">
            <Button className="w-full h-11 rounded-2xl" onClick={addPlayer}>
              <Plus className="mr-2 h-4 w-4" />追加
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-2xl h-11" onClick={saveCurrentRoster}>
            <Save className="mr-2 h-4 w-4" />参加者を保存
          </Button>
          <Button variant="outline" className="rounded-2xl h-11" onClick={loadSavedRoster}>
            <BookOpen className="mr-2 h-4 w-4" />保存済み参加者を読込
          </Button>
          <Button variant="outline" className="rounded-2xl h-11" onClick={resetTodayPresence}>
            全員参加に戻す
          </Button>
        </div>

        <div className="grid gap-3">
          {sortedPlayers.map((player) => (
            <div key={player.id} className="rounded-2xl border bg-white p-3 sm:p-4">
              <div className="grid gap-3 md:grid-cols-[48px_1fr_90px_110px_120px_120px_120px_90px_44px] items-center">
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={selectedPairIds.includes(player.id)}
                    onChange={() => togglePairSelection(player.id)}
                  />
                </div>

                <Input
                  value={player.name}
                  onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
                  className="h-11"
                />

                <Select
                  value={String(player.level)}
                  onValueChange={(v) => updatePlayer(player.id, { level: Number(v) })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{`Lv${n}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={player.yearCategory}
                  onValueChange={(v) => updatePlayer(player.id, { yearCategory: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_OPTIONS.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={player.role} onValueChange={(v) => updatePlayer(player.id, { role: v })}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={player.faculty} onValueChange={(v) => updatePlayer(player.id, { faculty: v })}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACULTY_ORDER.map((code) => (
                      <SelectItem key={code} value={code}>{code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {player.yearCategory === "OB" ? (
                  <Input
                    type="number"
                    min="1"
                    value={player.obGeneration ?? ""}
                    onChange={(e) =>
                      updatePlayer(player.id, {
                        obGeneration: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="OB期"
                    className="h-11"
                  />
                ) : (
                  <div className="h-11 rounded-2xl border bg-slate-50 px-3 flex items-center text-sm text-slate-400">
                    OB以外は期なし
                  </div>
                )}

                <Button
                  variant={player.present ? "default" : "outline"}
                  className="h-11 rounded-2xl"
                  onClick={() => updatePlayer(player.id, { present: !player.present })}
                >
                  {player.present ? "参加" : "欠席"}
                </Button>

                <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => removePlayer(player.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

export default function TennisPracticeGroupMaker() {
  const [players, setPlayers] = useState(defaultPlayers);
  const [savedRoster, setSavedRoster] = useState(defaultPlayers);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState("2");
  const [newYearCategory, setNewYearCategory] = useState("1年");
  const [newFaculty, setNewFaculty] = useState("PP");
  const [newRole, setNewRole] = useState("なし");
  const [newObGeneration, setNewObGeneration] = useState("");
  const [courtCount, setCourtCount] = useState("3");
  const [twoPlayerPairCount, setTwoPlayerPairCount] = useState("2");
  const [threePlayerPairCount, setThreePlayerPairCount] = useState("0");
  const [courts, setCourts] = useState(createDefaultCourts(3));
  const [practiceGroupSize, setPracticeGroupSize] = useState("2");
  const [practiceMatchMode, setPracticeMatchMode] = useState("strict");
  const [practiceName, setPracticeName] = useState("");
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [doublesResult, setDoublesResult] = useState(null);
  const [practiceResult, setPracticeResult] = useState(null);
  const [selectedPairIds, setSelectedPairIds] = useState([]);
  const [pairTemplateName, setPairTemplateName] = useState("");
  const [pairPreferredCourt, setPairPreferredCourt] = useState("auto");
  const [fixedPairs, setFixedPairs] = useState([]);
  const [saveStatus, setSaveStatus] = useState("未保存");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const rosterRaw = localStorage.getItem(ROSTER_STORAGE_KEY);
      const fixedPairRaw = localStorage.getItem(FIXED_PAIR_STORAGE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.players) setPlayers(rehydratePlayers(parsed.players));
        if (parsed.courtCount) setCourtCount(String(parsed.courtCount));
        if (parsed.twoPlayerPairCount) setTwoPlayerPairCount(String(parsed.twoPlayerPairCount));
        if (parsed.threePlayerPairCount !== undefined) setThreePlayerPairCount(String(parsed.threePlayerPairCount));
        if (parsed.courts) setCourts(parsed.courts);
        if (parsed.practiceGroupSize) setPracticeGroupSize(String(parsed.practiceGroupSize));
        if (parsed.practiceMatchMode) setPracticeMatchMode(String(parsed.practiceMatchMode));
        if (parsed.practiceHistory) setPracticeHistory(parsed.practiceHistory);
      }

      if (rosterRaw) {
        const parsedRoster = JSON.parse(rosterRaw);
        if (parsedRoster.players) setSavedRoster(rehydratePlayers(parsedRoster.players));
      }

      if (fixedPairRaw) {
        const parsedPairs = JSON.parse(fixedPairRaw);
        if (parsedPairs.fixedPairs) setFixedPairs(parsedPairs.fixedPairs.map((pair) => ({ ...pair, preferredCourt: pair.preferredCourt ?? null })));
      }

      setSaveStatus("保存データを読み込み済み");
    } catch {
      setSaveStatus("保存データの読込に失敗");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        players,
        courtCount,
        twoPlayerPairCount,
        threePlayerPairCount,
        courts,
        practiceGroupSize,
        practiceMatchMode,
        practiceHistory,
      }),
    );
    localStorage.setItem(FIXED_PAIR_STORAGE_KEY, JSON.stringify({ fixedPairs }));
    setSaveStatus("自動保存済み");
  }, [
    players,
    courtCount,
    twoPlayerPairCount,
    threePlayerPairCount,
    courts,
    practiceGroupSize,
    practiceMatchMode,
    practiceHistory,
    fixedPairs,
    loaded,
  ]);

  const sortedPlayers = useMemo(() => sortByPriority(players), [players]);
  const presentPlayers = useMemo(() => sortByPriority(players.filter((p) => p.present)), [players]);
  const printRows = useMemo(() => buildPrintableRowsFromHistory(practiceHistory), [practiceHistory]);

  const doublesSummary = useMemo(() => {
    const neededPlayers = Number(courtCount) * (Number(twoPlayerPairCount) * 2 + Number(threePlayerPairCount) * 3);
    return {
      present: presentPlayers.length,
      neededPlayers,
      shortage: Math.max(neededPlayers - presentPlayers.length, 0),
      overflow: Math.max(presentPlayers.length - neededPlayers, 0),
    };
  }, [courtCount, twoPlayerPairCount, threePlayerPairCount, presentPlayers]);

  const practiceSummary = useMemo(() => {
    const groupSize = Number(practiceGroupSize);
    return {
      present: presentPlayers.length,
      expectedGroups: Math.ceil(presentPlayers.length / Math.max(groupSize, 1)),
    };
  }, [practiceGroupSize, presentPlayers]);

  const syncCourtCount = useCallback((nextCount) => {
    const n = Math.max(1, Math.min(7, Number(nextCount) || 1));
    setCourtCount(String(n));
    setCourts((prev) => {
      const next = createDefaultCourts(n);
      return next.map((court, idx) => (prev[idx] ? { ...court, levelBand: prev[idx].levelBand } : court));
    });
  }, []);

  const updateCourtLevel = useCallback((courtNumber, levelBand) => {
    setCourts((prev) => prev.map((court) => (court.courtNumber === courtNumber ? { ...court, levelBand } : court)));
  }, []);

  const addPlayer = useCallback(() => {
    const name = newName.trim();
    if (!name) return;

    const isOb = newYearCategory === "OB";
    setPlayers((prev) =>
      sortByPriority([
        ...prev,
        {
          id: crypto.randomUUID(),
          name,
          level: Number(newLevel),
          yearCategory: newYearCategory,
          faculty: newFaculty,
          role: newRole,
          obGeneration: isOb && newObGeneration !== "" ? Number(newObGeneration) : null,
          present: true,
        },
      ]),
    );
    setNewName("");
    setNewLevel("2");
    setNewYearCategory("1年");
    setNewFaculty("PP");
    setNewRole("なし");
    setNewObGeneration("");
  }, [newFaculty, newLevel, newName, newObGeneration, newRole, newYearCategory]);

  const updatePlayer = useCallback((id, patch) => {
    setPlayers((prev) =>
      sortByPriority(
        prev.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, ...patch };
          if (next.yearCategory !== "OB") next.obGeneration = null;
          return next;
        }),
      ),
    );
  }, []);

  const removePlayer = useCallback((id) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setSelectedPairIds((prev) => prev.filter((x) => x !== id));
    setFixedPairs((prev) => prev.filter((pair) => !pair.memberIds.includes(id)));
  }, []);

  const saveCurrentRoster = useCallback(() => {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ players }));
    setSavedRoster(players);
    setSaveStatus("参加者名簿を保存済み");
  }, [players]);

  const loadSavedRoster = useCallback(() => {
    setPlayers(rehydratePlayers(savedRoster).map((p) => ({ ...p, present: true })));
    setDoublesResult(null);
    setPracticeResult(null);
  }, [savedRoster]);

  const resetTodayPresence = useCallback(() => {
    setPlayers((prev) => prev.map((p) => ({ ...p, present: true })));
    setDoublesResult(null);
    setPracticeResult(null);
  }, []);

  const togglePairSelection = useCallback((id) => {
    setSelectedPairIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const createFixedPair = useCallback(() => {
    const unique = Array.from(new Set(selectedPairIds));
    if (unique.length !== 2) return;

    const pairPlayers = unique.map((id) => players.find((p) => p.id === id)).filter(Boolean);
    if (pairPlayers.length !== 2) return;

    setFixedPairs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: pairTemplateName.trim() || `${pairPlayers[0].name}・${pairPlayers[1].name}`,
        memberIds: unique,
        memberNames: pairPlayers.map((p) => displayName(p)),
        preferredCourt: pairPreferredCourt === "auto" ? null : Number(pairPreferredCourt),
      },
    ]);
    setSelectedPairIds([]);
    setPairTemplateName("");
    setPairPreferredCourt("auto");
  }, [pairPreferredCourt, pairTemplateName, players, selectedPairIds]);

  const removeFixedPair = useCallback((id) => {
    setFixedPairs((prev) => prev.filter((pair) => pair.id !== id));
  }, []);

  const runDoubles = useCallback(() => {
    const plan = generateDoublesPlan(
      players,
      {
        twoPlayerPairCount: Number(twoPlayerPairCount),
        threePlayerPairCount: Number(threePlayerPairCount),
        courts,
      },
      practiceHistory,
      fixedPairs,
    );
    setDoublesResult(plan);
  }, [courts, fixedPairs, players, practiceHistory, threePlayerPairCount, twoPlayerPairCount]);

  const runPractice = useCallback(() => {
    const plan = generatePracticePlan(players, Number(practiceGroupSize), practiceHistory, practiceMatchMode);
    setPracticeResult(plan);
  }, [players, practiceGroupSize, practiceHistory, practiceMatchMode]);

  const saveCurrentPractice = useCallback(
    (mode) => {
      const title = practiceName.trim() || `練習 ${practiceHistory.length + 1}`;

      if (mode === "doubles") {
        if (!doublesResult) return;
        setPracticeHistory((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            title,
            mode: "doubles",
            createdAt: new Date().toLocaleString("ja-JP"),
            rows: doublesResult.rows.map((row) => ({
              courtNumber: row.courtNumber,
              courtLevel: row.courtLevel,
              pairs: row.pairs,
              triples: row.triples,
            })),
            leftovers: doublesResult.leftovers,
          },
        ]);
        setPracticeName("");
        return;
      }

      if (!practiceResult) return;
      setPracticeHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          title,
          mode: "practice",
          createdAt: new Date().toLocaleString("ja-JP"),
          groups: practiceResult.groups.map((group) => ({
            groupNumber: group.groupNumber,
            members: group.members,
          })),
          leftovers: practiceResult.leftovers,
        },
      ]);
      setPracticeName("");
    },
    [doublesResult, practiceHistory.length, practiceName, practiceResult],
  );

  const removePractice = useCallback((id) => {
    setPracticeHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const printPlan = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 md:p-6 lg:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6 print:max-w-none">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 print:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">テニス練習 組み分けアプリ</h1>
              <p className="text-sm text-slate-600 sm:text-base">
                参加者登録、ダブルス、対人練、練習メニューをタブで行き来できます。ダブルスでは固定ペアと3人ペアも使えます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-xl px-3 py-1 text-xs sm:text-sm">
                <Save className="mr-1 h-3.5 w-3.5" />
                {saveStatus}
              </Badge>
              <Badge variant="secondary" className="rounded-xl px-3 py-1 text-xs sm:text-sm">
                <Smartphone className="mr-1 h-3.5 w-3.5" />スマホ対応
              </Badge>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="register" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-auto rounded-2xl bg-white p-1">
            <TabsTrigger value="register" className="rounded-xl py-2">参加者登録</TabsTrigger>
            <TabsTrigger value="doubles" className="rounded-xl py-2">ダブルス</TabsTrigger>
            <TabsTrigger value="practice" className="rounded-xl py-2">対人練</TabsTrigger>
            <TabsTrigger value="menu" className="rounded-xl py-2">練習メニュー</TabsTrigger>
          </TabsList>

          <TabsContent value="register">
            <PlayerRegistration
              sortedPlayers={sortedPlayers}
              newName={newName}
              setNewName={setNewName}
              newLevel={newLevel}
              setNewLevel={setNewLevel}
              newYearCategory={newYearCategory}
              setNewYearCategory={setNewYearCategory}
              newFaculty={newFaculty}
              setNewFaculty={setNewFaculty}
              newRole={newRole}
              setNewRole={setNewRole}
              newObGeneration={newObGeneration}
              setNewObGeneration={setNewObGeneration}
              addPlayer={addPlayer}
              updatePlayer={updatePlayer}
              removePlayer={removePlayer}
              saveCurrentRoster={saveCurrentRoster}
              loadSavedRoster={loadSavedRoster}
              resetTodayPresence={resetTodayPresence}
              selectedPairIds={selectedPairIds}
              togglePairSelection={togglePairSelection}
            />

            <SectionCard
              title="固定ペア管理"
              description="ダブルス用の固定ペアを作成して保存できます。選択は2人で行ってください。"
              icon={Link2}
              className="print:hidden mt-4"
            >
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_160px_140px]">
                  <Input
                    value={pairTemplateName}
                    onChange={(e) => setPairTemplateName(e.target.value)}
                    placeholder="ペア名（任意）"
                    className="h-11"
                  />
                  <Select value={pairPreferredCourt} onValueChange={setPairPreferredCourt}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">コート自動</SelectItem>
                      {COURT_COUNT_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{`${n}面`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button className="rounded-2xl h-11" onClick={createFixedPair}>
                    <Save className="mr-2 h-4 w-4" />固定ペア保存
                  </Button>
                </div>

                {fixedPairs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                    固定ペアはまだありません。
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {fixedPairs.map((pair) => (
                      <div key={pair.id} className="rounded-2xl border p-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold">{pair.name}</div>
                          <div className="text-sm text-slate-500">{pair.memberNames.join(" / ")} / {pair.preferredCourt ? `${pair.preferredCourt}面優先` : "コート自動"}</div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeFixedPair(pair.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="doubles" className="space-y-4">
            <div className="grid gap-4 lg:gap-6 xl:grid-cols-3 print:grid-cols-1">
              <div className="xl:col-span-2">
                <SectionCard title="ダブルス結果" description="ダブルスではコートレベルと固定ペアを使います。">
                  {!doublesResult ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">
                      まだダブルスを組んでいません。
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
                      {doublesResult.rows.map((row) => (
                        <div key={row.courtNumber} className="rounded-2xl border p-4 bg-white">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="font-semibold flex items-center gap-2">
                              <Trophy className="h-4 w-4" />
                              {row.courtNumber}面
                            </div>
                            <Badge variant="secondary" className="rounded-xl">{row.courtLevel}</Badge>
                          </div>

                          {row.players.length === 0 ? (
                            <div className="text-sm text-slate-500">該当者なし</div>
                          ) : (
                            <div className="space-y-2">
                              {row.pairs.map((pair, idx) => (
                                <div key={`${row.courtNumber}-pair-${idx}`} className="rounded-xl bg-slate-50 p-3">
                                  <div className="text-xs text-slate-500 mb-1">2人ペア{idx + 1}</div>
                                  <div className="font-medium">{pair.join(" / ")}</div>
                                </div>
                              ))}
                              {row.triples.map((pair, idx) => (
                                <div key={`${row.courtNumber}-triple-${idx}`} className="rounded-xl bg-amber-50 p-3">
                                  <div className="text-xs text-slate-500 mb-1">3人ペア{idx + 1}</div>
                                  <div className="font-medium">{pair.join(" / ")}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {doublesResult && doublesResult.leftovers.length > 0 ? (
                    <div className="mt-4 rounded-2xl border p-4">
                      <div className="font-semibold mb-2">余り</div>
                      <div className="flex flex-wrap gap-2">
                        {doublesResult.leftovers.map((name, idx) => (
                          <Badge key={`${name}-${idx}`} variant="outline" className="rounded-xl">{name}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </SectionCard>
              </div>

              <div className="space-y-4 lg:space-y-6 xl:sticky xl:top-6 self-start">
                <SectionCard title="ダブルス設定" description="2人ペアと3人ペアの数を別々に設定できます。">
                  <div className="space-y-4">
                    <LabeledSelect
                      label="使える面数"
                      value={courtCount}
                      onChange={syncCourtCount}
                      options={COURT_COUNT_OPTIONS.map((n) => ({ value: n, label: `${n}面` }))}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <LabeledSelect
                        label="2人ペア数"
                        value={twoPlayerPairCount}
                        onChange={setTwoPlayerPairCount}
                        options={TWO_PAIR_OPTIONS}
                      />
                      <LabeledSelect
                        label="3人ペア数"
                        value={threePlayerPairCount}
                        onChange={setThreePlayerPairCount}
                        options={THREE_PAIR_OPTIONS}
                      />
                    </div>

                    <div className="space-y-3">
                      <Label>コートレベル</Label>
                      {courts.map((court) => (
                        <div key={court.courtNumber} className="flex items-center gap-2 rounded-2xl border p-3">
                          <div className="w-16 text-sm font-medium">{court.courtNumber}面</div>
                          <Select
                            value={court.levelBand}
                            onValueChange={(value) => updateCourtLevel(court.courtNumber, value)}
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COURT_LEVEL_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4 text-sm space-y-2">
                      <div className="flex items-center justify-between"><span>参加者数</span><span className="font-semibold">{doublesSummary.present}</span></div>
                      <div className="flex items-center justify-between"><span>必要人数</span><span className="font-semibold">{doublesSummary.neededPlayers}</span></div>
                      <div className="flex items-center justify-between"><span>余り予定</span><span className="font-semibold">{doublesSummary.overflow}</span></div>
                      <div className="flex items-center justify-between"><span>不足予定</span><span className="font-semibold">{doublesSummary.shortage}</span></div>
                    </div>

                    <div className="rounded-2xl border p-3 text-sm space-y-2">
                      <div className="font-semibold">固定ペア</div>
                      <div>保存した固定ペアは必ず選ばれ、指定コートがある場合はそのコートへ優先配置します。</div>
                      <div>固定ペアのメンバーは通常の優先順位抽選には参加しません。人数都合で不足が出たときは、3人ペアを作れます。</div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button className="w-full rounded-2xl h-12 text-base" onClick={runDoubles}>
                        <Shuffle className="mr-2 h-4 w-4" />ダブルスを組む
                      </Button>
                      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                        <Input
                          value={practiceName}
                          onChange={(e) => setPracticeName(e.target.value)}
                          placeholder="練習名"
                          className="h-11"
                        />
                        <Button
                          variant="secondary"
                          className="rounded-2xl h-11"
                          onClick={() => saveCurrentPractice("doubles")}
                        >
                          <Save className="mr-2 h-4 w-4" />保存
                        </Button>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="practice" className="space-y-4">
            <div className="grid gap-4 lg:gap-6 xl:grid-cols-3 print:grid-cols-1">
              <div className="xl:col-span-2">
                <SectionCard title="対人練結果" description="対人練ではコートレベルは使いません。">
                  {!practiceResult ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">
                      まだ対人練を組んでいません。
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
                      {practiceResult.groups.map((group) => (
                        <div key={group.groupNumber} className="rounded-2xl border p-4 bg-white">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="font-semibold">{group.groupNumber}組</div>
                            <Badge variant="secondary" className="rounded-xl">{group.groupSize}人</Badge>
                          </div>
                          <div className="space-y-2">
                            {group.members.map((member, idx) => (
                              <div key={`${group.groupNumber}-${idx}`} className="rounded-xl bg-slate-50 p-3 font-medium">
                                {member}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-4 lg:space-y-6 xl:sticky xl:top-6 self-start">
                <SectionCard title="対人練設定" description="対人練は2人・3人・4人組で作れます。人数都合で混在しても対応できます。レベル条件も選べます。">
                  <div className="space-y-4">
                    <LabeledSelect
                      label="1組の人数"
                      value={practiceGroupSize}
                      onChange={setPracticeGroupSize}
                      options={PRACTICE_GROUP_OPTIONS.map((n) => ({ value: n, label: `${n}人` }))}
                    />

                    <LabeledSelect
                      label="レベル条件"
                      value={practiceMatchMode}
                      onChange={setPracticeMatchMode}
                      options={PRACTICE_MATCH_MODE_OPTIONS}
                    />

                    <div className="rounded-2xl border p-3 text-sm space-y-2">
                      <div className="font-semibold">レベル条件の意味</div>
                      <div>通常: レベル差1まで</div>
                      <div>端レベル拡張: Lv1は1〜3、Lv2は1〜3、Lv3は2〜4、Lv4は2〜4</div>
                      <div>完全ランダム: レベルに関係なく誰とでも組める</div>
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4 text-sm space-y-2">
                      <div className="flex items-center justify-between"><span>参加者数</span><span className="font-semibold">{practiceSummary.present}</span></div>
                      <div className="flex items-center justify-between"><span>想定組数</span><span className="font-semibold">{practiceSummary.expectedGroups}</span></div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button className="w-full rounded-2xl h-12 text-base" onClick={runPractice}>
                        <Shuffle className="mr-2 h-4 w-4" />対人練を組む
                      </Button>
                      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                        <Input
                          value={practiceName}
                          onChange={(e) => setPracticeName(e.target.value)}
                          placeholder="練習名"
                          className="h-11"
                        />
                        <Button
                          variant="secondary"
                          className="rounded-2xl h-11"
                          onClick={() => saveCurrentPractice("practice")}
                        >
                          <Save className="mr-2 h-4 w-4" />保存
                        </Button>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="menu" className="space-y-4">
            <SectionCard
              title="練習メニュー"
              description="保存した練習と保存された人・固定ペアを表形式で管理します。印刷もここから行います。"
              icon={Table2}
            >
              <div className="space-y-6">
                <div>
                  <div className="font-semibold mb-3">保存済み参加者</div>
                  <div className="overflow-x-auto rounded-2xl border">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border p-2 text-left">選択</th>
                          <th className="border p-2 text-left">名前</th>
                          <th className="border p-2 text-left">レベル</th>
                          <th className="border p-2 text-left">学年/OB</th>
                          <th className="border p-2 text-left">役職</th>
                          <th className="border p-2 text-left">学部</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPlayers.map((player) => (
                          <tr key={player.id}>
                            <td className="border p-2">
                              <input
                                type="checkbox"
                                checked={selectedPairIds.includes(player.id)}
                                onChange={() => togglePairSelection(player.id)}
                              />
                            </td>
                            <td className="border p-2">{displayName(player)}</td>
                            <td className="border p-2">{player.level}</td>
                            <td className="border p-2">
                              {player.yearCategory === "OB" ? `${player.obGeneration ?? "-"}期OB` : player.yearCategory}
                            </td>
                            <td className="border p-2">{player.role}</td>
                            <td className="border p-2">{player.faculty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-3">保存済み固定ペア</div>
                  {fixedPairs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-slate-500">
                      保存した固定ペアはまだありません。
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="border p-2 text-left">ペア名</th>
                            <th className="border p-2 text-left">メンバー1</th>
                            <th className="border p-2 text-left">メンバー2</th><th className="border p-2 text-left">優先コート</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fixedPairs.map((pair) => (
                            <tr key={pair.id}>
                              <td className="border p-2">{pair.name}</td>
                              <td className="border p-2">{pair.memberNames[0] ?? "-"}</td>
                              <td className="border p-2">{pair.memberNames[1] ?? "-"}</td><td className="border p-2">{pair.preferredCourt ? `${pair.preferredCourt}面` : "自動"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-semibold mb-3">保存した練習</div>
                  {practiceHistory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-slate-500">
                      保存した練習はまだありません。
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="overflow-x-auto rounded-2xl border">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="border p-2 text-left">練習名</th>
                              <th className="border p-2 text-left">種別</th>
                              <th className="border p-2 text-left">コート/組</th>
                              <th className="border p-2 text-left">レベル帯</th>
                              <th className="border p-2 text-left">枠1</th>
                              <th className="border p-2 text-left">枠2</th>
                              <th className="border p-2 text-left">枠3</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printRows.map((row, idx) => (
                              <tr key={`${row.menu}-${row.label}-${idx}`}>
                                <td className="border p-2">{row.menu}</td>
                                <td className="border p-2">{row.type}</td>
                                <td className="border p-2">{row.label}</td>
                                <td className="border p-2">{row.level}</td>
                                <td className="border p-2">{row.slot1}</td>
                                <td className="border p-2">{row.slot2}</td>
                                <td className="border p-2">{row.slot3}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-3">
                        {practiceHistory.map((practice, idx) => (
                          <div key={practice.id} className="rounded-2xl border p-4 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold">{idx + 1}. {practice.title}</div>
                              <div className="text-sm text-slate-500">
                                {practice.mode === "doubles" ? "ダブルス" : "対人練"} / 保存日時: {practice.createdAt}
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removePractice(practice.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end print:hidden">
                  <Button variant="outline" className="rounded-2xl h-11" onClick={printPlan}>
                    <Printer className="mr-2 h-4 w-4" />表を印刷する
                  </Button>
                </div>
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
