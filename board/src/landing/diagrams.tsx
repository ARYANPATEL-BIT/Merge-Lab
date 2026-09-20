// Simple hairline line-art diagrams for the numbered capability rows and the
// AWS architecture. All monochrome, stroke = currentColor, no fills - they read
// as schematic marks beside the prose, not illustrations.

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  vectorEffect: "non-scaling-stroke" as const,
};

const frame = {
  viewBox: "0 0 220 150",
  width: "100%",
  height: "100%",
  role: "img" as const,
  "aria-hidden": true,
  preserveAspectRatio: "xMidYMid meet",
};

/** 01 - a file tree with one node still "dirty" (uncommitted), pushed to the wire. */
export function ExtractionDiagram() {
  return (
    <svg {...frame}>
      <path {...stroke} d="M24 30h34l6 8h30" />
      <path {...stroke} d="M24 30v78h70" />
      <path {...stroke} d="M40 54h30M40 70h30M40 86h18" />
      <circle {...stroke} cx="94" cy="86" r="4" />
      <path {...stroke} d="M110 70h44" />
      <path {...stroke} d="M150 62l10 8-10 8" />
      <rect {...stroke} x="168" y="44" width="32" height="52" rx="3" />
      <path {...stroke} d="M176 58h16M176 68h16M176 78h10" />
    </svg>
  );
}

/** 02 - six inputs converge into a gate that emits allow / warn / block. */
export function RulesDiagram() {
  return (
    <svg {...frame}>
      {[38, 54, 70, 86, 102, 118].map((y) => (
        <path key={y} {...stroke} d={`M24 ${y}h40`} />
      ))}
      <path {...stroke} d="M64 38q26 0 34 40 -8 40 -34 40" />
      <rect {...stroke} x="98" y="60" width="30" height="30" rx="4" />
      <path {...stroke} d="M128 75h30" />
      <path {...stroke} d="M158 60h34M158 75h34M158 90h34" />
      <circle {...stroke} cx="150" cy="60" r="2.4" />
      <circle {...stroke} cx="150" cy="90" r="2.4" />
    </svg>
  );
}

/** 03 - one working tree's declarations become another agent's context. */
export function InjectionDiagram() {
  return (
    <svg {...frame}>
      <circle {...stroke} cx="46" cy="75" r="20" />
      <path {...stroke} d="M40 75h12M46 69v12" />
      <circle {...stroke} cx="174" cy="75" r="20" />
      <path {...stroke} d="M166 70h16M166 78h16" />
      <path {...stroke} d="M70 68h64M70 82h64" />
      <path {...stroke} d="M126 60l12 8-12 8" />
      <path {...stroke} d="M118 74l-12 8 12 8" opacity="0.5" />
    </svg>
  );
}

/** 04 - a payload where source is struck out and only names/types pass. */
export function DeclarationsDiagram() {
  return (
    <svg {...frame}>
      <rect {...stroke} x="30" y="34" width="160" height="82" rx="6" />
      <path {...stroke} d="M46 56h60" />
      <path {...stroke} d="M46 74h96" opacity="0.9" />
      <path {...stroke} d="M46 92h44" />
      <path {...stroke} d="M118 50l24 12" opacity="0.55" />
      <path {...stroke} d="M142 50l-24 12" opacity="0.55" />
      <circle {...stroke} cx="164" cy="92" r="10" />
      <path {...stroke} d="M160 92l3 3 6-6" />
    </svg>
  );
}

/** The deploy topology: daemon -> HTTP API -> Lambdas -> DynamoDB + Bedrock. */
export function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 940 310"
      width="100%"
      height="100%"
      role="img"
      aria-label="Daemon and hooks call API Gateway HTTP API, fanning out to ingest, context and verdict Lambdas backed by DynamoDB, with async Bedrock semantic analysis."
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        <rect x="30" y="96" width="120" height="64" rx="6" />
        <text x="90" y="124" textAnchor="middle" fontSize="13" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">daemon</text>
        <text x="90" y="142" textAnchor="middle" fontSize="10.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)" opacity="0.6">+ hooks</text>

        <path d="M150 128h70" />
        <path d="M212 122l10 6-10 6" />

        <rect x="222" y="96" width="128" height="64" rx="6" />
        <text x="286" y="122" textAnchor="middle" fontSize="12.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">API Gateway</text>
        <text x="286" y="140" textAnchor="middle" fontSize="10.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)" opacity="0.6">HTTP API</text>

        <path d="M350 116l70 -44" />
        <path d="M350 128h70" />
        <path d="M350 140l70 44" />

        <rect x="422" y="40" width="150" height="52" rx="6" />
        <text x="497" y="71" textAnchor="middle" fontSize="12.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">ingest λ</text>
        <rect x="422" y="102" width="150" height="52" rx="6" />
        <text x="497" y="133" textAnchor="middle" fontSize="12.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">context λ</text>
        <rect x="422" y="164" width="150" height="52" rx="6" />
        <text x="497" y="195" textAnchor="middle" fontSize="12.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">verdict λ</text>

        <path d="M497 92v146" strokeDasharray="3 3" />
        <rect x="422" y="238" width="150" height="52" rx="6" strokeDasharray="4 3" />
        <text x="497" y="263" textAnchor="middle" fontSize="12" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">semantic λ</text>
        <text x="497" y="279" textAnchor="middle" fontSize="9.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)" opacity="0.6">async advisory</text>

        <path d="M572 66l90 56" />
        <path d="M572 128h90" />
        <path d="M572 190l90 -56" />
        <path d="M572 264l90 -110" strokeDasharray="3 3" />

        <ellipse cx="740" cy="104" rx="46" ry="14" />
        <path d="M694 104v52c0 7.7 20.6 14 46 14s46 -6.3 46 -14v-52" />
        <path d="M694 130c0 7.7 20.6 14 46 14s46 -6.3 46 -14" />
        <text x="740" y="200" textAnchor="middle" fontSize="12.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">DynamoDB</text>

        <path d="M572 264h130" strokeDasharray="3 3" />
        <rect x="702" y="238" width="160" height="52" rx="6" />
        <text x="782" y="263" textAnchor="middle" fontSize="12" fill="currentColor" stroke="none" fontFamily="var(--font-mono)">Amazon Bedrock</text>
        <text x="782" y="279" textAnchor="middle" fontSize="9.5" fill="currentColor" stroke="none" fontFamily="var(--font-mono)" opacity="0.6">Claude 3 Haiku</text>
      </g>
    </svg>
  );
}
