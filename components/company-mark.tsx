/** Original textile-inspired artwork for sample companies; no external assets. */
export function CompanyMark({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const normalized = name.toLowerCase();
  const kind = normalized.includes("threadworks")
    ? "woven"
    : normalized.includes("north")
      ? "north"
      : "studio";
  return (
    <svg
      className="company-art"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        width="48"
        height="48"
        rx="13"
        fill={
          kind === "woven"
            ? "#204F49"
            : kind === "north"
              ? "#DA6448"
              : "#5550A0"
        }
      />
      {kind === "north" ? (
        <>
          <path d="M10 35V13h7l14 22h7V13h-7v22L17 13h-7" fill="#FFE3A8" />
          <path d="m31 7 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#FFF5DF" />
        </>
      ) : kind === "woven" ? (
        <>
          <path d="M13 9v30M24 9v30M35 9v30" stroke="#BDE3B3" strokeWidth="6" />
          <path d="M9 14h30M9 25h30M9 36h30" stroke="#F2BD6C" strokeWidth="5" />
          <path
            d="M13 20v10M24 9v10M35 30v9"
            stroke="#BDE3B3"
            strokeWidth="6"
          />
        </>
      ) : (
        <>
          <circle cx="19" cy="20" r="11" fill="#D8CAF9" />
          <circle cx="29" cy="28" r="11" fill="#F8AE83" />
          <path
            d="M19 18a10 10 0 0 1 10 12 10 10 0 0 1-10-12Z"
            fill="#FFF0C7"
          />
        </>
      )}
    </svg>
  );
}

export function CompanyIdentity({ name }: { name: string }) {
  return (
    <span className="company-identity">
      <CompanyMark name={name} />
      <span>{name}</span>
    </span>
  );
}
