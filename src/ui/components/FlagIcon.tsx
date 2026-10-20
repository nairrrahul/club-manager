import { getFlagCode } from "../../engine/nations";

/**
 * A national flag in a small rounded container. Everything is sized in `em`, so the flag
 * scales with the text beside it without touching the text size.
 *
 *  code  - three-letter nation code (e.g. "ENG"); the flag-icons code comes from nation_info.json
 *  size  - scale of the whole flag relative to the surrounding text (1 = one line of text tall)
 *  zoom  - scale of the artwork inside the container (>1 crops in on the flag)
 */
export function FlagIcon(props: {
  code: string | null | undefined;
  size?: number;
  zoom?: number;
  className?: string;
}) {
  const flagCode = getFlagCode(props.code);
  const size = props.size ?? 1;
  const zoom = props.zoom ?? 1;

  return (
    <span
      className={`relative inline-block overflow-hidden bg-navy-600 shrink-0 ${props.className ?? ""}`}
      style={{
        width: `${size * (4 / 3)}em`,
        height: `${size}em`,
        borderRadius: "0.18em",
        verticalAlign: "-0.15em"
      }}
      aria-hidden="true"
    >
      {flagCode && (
        <span
          className={`fi fi-${flagCode}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            backgroundSize: "cover",
            transform: zoom !== 1 ? `scale(${zoom})` : undefined
          }}
        />
      )}
    </span>
  );
}

export default FlagIcon;
