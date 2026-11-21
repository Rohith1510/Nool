// Adapted from Hairline UI StreamingText, MIT License.
// Copyright (c) 2026 Hairline UI https://hairlineui.com/license#components
// Text comes from Agora; this component never simulates typing.
export function StreamingText({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="agent-streaming-text" aria-busy={streaming}>
      {content.split(/\n\s*\n/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {streaming && (
        <span className="agent-stream-status">Receiving transcript</span>
      )}
    </div>
  );
}
