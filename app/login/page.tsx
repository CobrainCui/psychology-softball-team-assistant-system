"use client";

import { useEffect, useState } from "react";
import {
  Gender,
  loadPlayers,
  Player,
  savePlayers,
} from "@/lib/players";
import { CurrentUser, setStoredCurrentUser } from "@/lib/currentUser";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "女" },
  { value: "male", label: "男" },
];

type LoginMode = "select" | "create";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("select");
  const [players, setPlayers] = useState<Player[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectGender, setSelectGender] = useState<Gender>("female");

  const [name, setName] = useState("");
  const [createGender, setCreateGender] = useState<Gender>("female");

  useEffect(() => {
    const loaded = loadPlayers();
    setPlayers(loaded);
    setSelectedPlayerId(loaded[0]?.id ?? "");
    const firstGender = loaded[0]?.gender;
    if (firstGender) setSelectGender(firstGender);
    setIsMounted(true);
  }, []);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId);
  const selectedNeedsGender = Boolean(selectedPlayer && !selectedPlayer.gender);

  // 选择已有队员：复用名册 id，缺 gender 时补全后再写入身份
  const handleSelectExisting = () => {
    if (!selectedPlayer) return;

    const gender = selectedPlayer.gender ?? selectGender;
    if (!selectedPlayer.gender) {
      const nextPlayers = players.map((player) =>
        player.id === selectedPlayer.id ? { ...player, gender } : player
      );
      savePlayers(nextPlayers);
      setPlayers(nextPlayers);
    }

    const currentUser: CurrentUser = {
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      gender,
    };
    setStoredCurrentUser(currentUser);
    window.location.href = "/";
  };

  // 新建队员：生成唯一 playerId，同步写入名册与当前身份
  const handleCreate = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const playerId = crypto.randomUUID();
    const newPlayer: Player = {
      id: playerId,
      name: trimmedName,
      gender: createGender,
    };
    const nextPlayers = [...loadPlayers(), newPlayer];
    savePlayers(nextPlayers);

    const currentUser: CurrentUser = {
      playerId,
      playerName: trimmedName,
      gender: createGender,
    };
    setStoredCurrentUser(currentUser);
    window.location.href = "/";
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm border border-zinc-200 bg-white p-6">
        <h1 className="mb-6 text-center text-sm font-medium tracking-wide text-zinc-500">
          建立个人运动档案
        </h1>

        <div className="mb-4 flex border border-zinc-900">
          <button
            type="button"
            onClick={() => setMode("select")}
            className={`flex-1 py-2 text-xs font-bold transition-colors ${
              mode === "select"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            选择已有队员
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 py-2 text-xs font-bold transition-colors ${
              mode === "create"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            新建队员
          </button>
        </div>

        {mode === "select" ? (
          <div className="flex flex-col gap-4">
            {players.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-400">
                暂无名册，请切换到「新建队员」
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase text-gray-500">队员</label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedPlayerId(nextId);
                      const next = players.find((player) => player.id === nextId);
                      if (next?.gender) setSelectGender(next.gender);
                    }}
                    className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  >
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                        {player.gender
                          ? ` (${player.gender === "male" ? "男" : "女"})`
                          : " (未填性别)"}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedNeedsGender && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-gray-500">
                      补全性别
                    </span>
                    <div className="flex gap-1">
                      {GENDER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectGender(option.value)}
                          className={`flex-1 border py-1.5 text-sm transition-colors ${
                            selectGender === option.value
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSelectExisting}
                  disabled={!selectedPlayer}
                  className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-30"
                >
                  以该身份进入
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-gray-500">姓名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入姓名"
                className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase text-gray-500">性别</span>
              <div className="flex gap-1">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCreateGender(option.value)}
                    className={`flex-1 border py-1.5 text-sm transition-colors ${
                      createGender === option.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-30"
            >
              建立个人运动档案
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
