"use client";

import { useEffect, useState } from "react";
import {
  Gender,
  normalizePlayerRole,
  PlayerRole,
} from "@/lib/players";
import { getPlayers, loginOrRegister, type CloudPlayer } from "@/lib/actions";
import { CurrentUser, setStoredCurrentUser } from "@/lib/currentUser";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "女" },
  { value: "male", label: "男" },
];

const ROLE_OPTIONS: { value: PlayerRole; label: string }[] = [
  { value: "player", label: "队员" },
  { value: "coach", label: "教练" },
];

type LoginMode = "select" | "create";

// 推导步骤：云端 Player → 前端 Session（softball_currentUser）
function persistSession(player: {
  id: string;
  name: string;
  gender?: Gender | null;
  role?: PlayerRole;
}, fallbackGender: Gender, fallbackRole: PlayerRole) {
  const gender = player.gender ?? fallbackGender;
  const role = normalizePlayerRole(player.role ?? fallbackRole);
  const currentUser: CurrentUser = {
    playerId: player.id,
    playerName: player.name,
    gender,
    role,
  };
  setStoredCurrentUser(currentUser);
}

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("select");
  const [players, setPlayers] = useState<CloudPlayer[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectGender, setSelectGender] = useState<Gender>("female");
  const [selectRole, setSelectRole] = useState<PlayerRole>("player");

  const [name, setName] = useState("");
  const [createGender, setCreateGender] = useState<Gender>("female");
  const [createRole, setCreateRole] = useState<PlayerRole>("player");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getPlayers();
      if (cancelled) return;
      if (!res.success) {
        console.error("云端被拒:", res.error);
        setError(`无法读取云端名册：${res.error}`);
        setIsMounted(true);
        return;
      }
      setPlayers(res.players);
      setSelectedPlayerId(res.players[0]?.id ?? "");
      const first = res.players[0];
      if (first?.gender) setSelectGender(first.gender);
      if (first) setSelectRole(normalizePlayerRole(first.role));
      setIsMounted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId);
  const selectedNeedsGender = Boolean(selectedPlayer && !selectedPlayer.gender);

  const handleSelectExisting = async () => {
    if (!selectedPlayer || isBusy) return;

    const gender = selectedPlayer.gender ?? selectGender;
    const role = selectRole;

    setIsBusy(true);
    setError("");
    const res = await loginOrRegister(selectedPlayer.name, gender, role);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(`登录失败：${res.error}`);
      setIsBusy(false);
      return;
    }
    persistSession(res.player, gender, role);
    window.location.href = "/";
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isBusy) return;

    setIsBusy(true);
    setError("");
    const res = await loginOrRegister(trimmedName, createGender, createRole);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(`注册失败：${res.error}`);
      setIsBusy(false);
      return;
    }
    persistSession(res.player, createGender, createRole);
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

        {error ? (
          <p className="mb-3 text-center text-xs text-red-600">{error}</p>
        ) : null}

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
                      setSelectRole(normalizePlayerRole(next?.role));
                    }}
                    className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  >
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                        {player.gender
                          ? ` · ${player.gender === "male" ? "男" : "女"}`
                          : " · 未填性别"}
                        {` · ${normalizePlayerRole(player.role) === "coach" ? "教练" : "队员"}`}
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

                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase text-gray-500">角色</span>
                  <div className="flex gap-1">
                    {ROLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectRole(option.value)}
                        className={`flex-1 border py-1.5 text-sm transition-colors ${
                          selectRole === option.value
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
                  onClick={() => void handleSelectExisting()}
                  disabled={!selectedPlayer || isBusy}
                  className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:hover:bg-zinc-300"
                >
                  {isBusy ? "登录中…" : "以该身份进入"}
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
                className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
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

            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase text-gray-500">角色</span>
              <div className="flex gap-1">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCreateRole(option.value)}
                    className={`flex-1 border py-1.5 text-sm transition-colors ${
                      createRole === option.value
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
              onClick={() => void handleCreate()}
              disabled={!name.trim() || isBusy}
              className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:hover:bg-zinc-300"
            >
              {isBusy ? "注册中…" : "建立个人运动档案"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
