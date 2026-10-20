import { useState } from "react";
import { useGame, useGameStore } from "../../store/gameStore";
import { ConfirmDialog, Empty, NationTag, OvrBadge, PageHeader, Panel, PlayerLink, PosBadge } from "../components/common";
import type { Player } from "../../engine/types";

export default function Academy() {
  const game = useGame();
  const promote = useGameStore(s => s.promote);
  const release = useGameStore(s => s.releaseYouth);
  const team = game.managerTeam;
  const [pendingRelease, setPendingRelease] = useState<Player | null>(null);
  const players = [...(team.youthAcademySquad ?? [])].sort((a, b) => b.potential - a.potential || b.overall - a.overall);
  const seniorFull = (team.seniorSquad?.length ?? 0) >= team.maxSeniorSquadSize;

  return (
    <div>
      <PageHeader
        title="Youth Academy"
        subtitle={`${players.length}/${team.maxYouthAcademySquadSize} players · Players aged 18+ must be promoted or released before the next season`}
      />
      <Panel title="Academy players">
        {players.length === 0 ? (
          <Empty>The academy is empty. Send a scout to find young talent.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Pos</th><th>Name</th><th className="num">Age</th><th className="num">OVR</th><th className="num">POT</th>
                  <th>Nationality</th><th>Secondary</th><th></th><th></th>
                </tr>
              </thead>
              <tbody>
                {players.map(player => (
                  <tr key={player.id}>
                    <td><PosBadge position={player.position} /></td>
                    <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                    <td className="num">{player.age}</td>
                    <td className="num"><OvrBadge value={player.overall} /></td>
                    <td className="num"><OvrBadge value={player.potential} /></td>
                    <td><NationTag code={player.primaryNationality} /></td>
                    <td>{player.secondaryNationality ? <NationTag code={player.secondaryNationality} muted /> : <span className="text-navy-400">–</span>}</td>
                    <td className="text-xs">
                      {player.age >= 18 && <span className="text-accent-yellow font-semibold">Aging out</span>}
                    </td>
                    <td className="text-right space-x-1">
                      <button className="btn-primary btn-sm" disabled={seniorFull} onClick={() => promote(player.id)}>Promote</button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => setPendingRelease(player)}
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {seniorFull && players.length > 0 && (
          <p className="px-4 py-2 text-xs text-accent-yellow">Senior squad is full — release a senior player to promote.</p>
        )}
      </Panel>
      {pendingRelease && (
        <ConfirmDialog
          title="Release player"
          confirmLabel="Release"
          message={<>Release <b>{pendingRelease.firstName} {pendingRelease.lastName}</b> ({pendingRelease.position}, {pendingRelease.overall} OVR / {pendingRelease.potential} POT) from the youth academy? They will join the free agents, and you won't be able to re-sign them for 2 seasons.</>}
          onCancel={() => setPendingRelease(null)}
          onConfirm={() => { release(pendingRelease.id); setPendingRelease(null); }}
        />
      )}
    </div>
  );
}
