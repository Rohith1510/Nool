import "server-only";
export function readiness() {
  const checks = [
    {
      name: "Supabase connection",
      description: "Persisted orders, sign-in, and live updates.",
      keys: [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ],
    },
    {
      name: "Trusted backend",
      description:
        "Seals evaluated proposals and binds voice sessions to your account.",
      keys: ["SUPABASE_SECRET_KEY"],
    },
    {
      name: "Agora voice transport",
      description: "Enable Conversational AI on your Agora project.",
      keys: [
        "NEXT_PUBLIC_AGORA_APP_ID",
        "AGORA_APP_CERTIFICATE",
        "AGORA_CUSTOMER_ID",
        "AGORA_CUSTOMER_SECRET",
      ],
    },
    {
      name: "Gemini reasoning",
      description:
        "A text model with function calling. Model ID stays configurable.",
      keys: ["GEMINI_API_KEY", "GEMINI_MODEL"],
    },
    {
      name: "Murf Falcon speech",
      description: "Streaming voice output using your selected English voice.",
      keys: ["MURF_API_KEY", "MURF_VOICE_ID", "MURF_LOCALE"],
    },
    {
      name: "Secure tool callbacks",
      description: "A public HTTPS URL for Agora and a session signing secret.",
      keys: ["APP_URL", "AGORA_TOOL_SECRET"],
    },
  ];
  return checks.map((c) => ({
    ...c,
    configured:
      c.keys.every((k) => Boolean(process.env[k])) &&
      (c.name !== "Secure tool callbacks" ||
        Boolean(process.env.APP_URL?.startsWith("https://"))),
  }));
}
