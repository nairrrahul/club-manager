import { useRef, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { parseSaveText } from "../../engine/save";
import type { SaveFile } from "../../engine/save";
import { ConfirmDialog, Modal } from "./common";

export function SaveGameButton(props: { className?: string }) {
  const exportSave = useGameStore(s => s.exportSave);
  const notify = useGameStore(s => s.notify);

  const save = () => {
    const result = exportSave();
    if (!result) return;
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify("success", `Game saved as ${result.filename} (${(blob.size / 1048576).toFixed(2)} MB).`);
  };

  return (
    <button className={props.className ?? "btn-ghost"} onClick={save}>
      Save game
    </button>
  );
}

export function LoadGameButton(props: { className?: string; label?: string; confirmReplace?: boolean }) {
  const loadSave = useGameStore(s => s.loadSave);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<SaveFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (file: SaveFile) => {
    const problem = loadSave(file);
    if (problem) setError(problem);
    setPending(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseSaveText(await file.text());
      if (props.confirmReplace) setPending(parsed);
      else load(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleFile(file);
        }}
      />
      <button className={props.className ?? "btn-ghost"} onClick={() => input.current?.click()}>
        {props.label ?? "Load game"}
      </button>

      {pending && (
        <ConfirmDialog
          title="Load saved game"
          confirmLabel="Load game"
          message={
            <div className="space-y-2">
              <p>
                Load <b>{pending.meta.mode === "observer" ? "Observer Mode" : pending.meta.team}</b> — season {pending.meta.season}, matchday {pending.meta.matchday}
                {pending.meta.godMode ? " (God Mode on)" : ""}?
              </p>
              <p className="text-navy-300 text-xs">
                Saved {new Date(pending.meta.savedAt).toLocaleString()}. Your current game will be replaced — save it first if you want to keep it.
              </p>
            </div>
          }
          onCancel={() => setPending(null)}
          onConfirm={() => load(pending)}
        />
      )}
      {error && (
        <Modal title="Could not load game" onClose={() => setError(null)}>
          <p className="text-sm">{error}</p>
          <div className="mt-5 text-right">
            <button className="btn-yellow" onClick={() => setError(null)}>OK</button>
          </div>
        </Modal>
      )}
    </>
  );
}
