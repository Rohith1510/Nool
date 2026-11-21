"use client";
import { useState } from "react";
import { AudioLines, ArrowUpRight, Check, Mic } from "lucide-react";
import Link from "next/link";
import { ToolCall } from "./hairline/tool-call";
import { StreamingText } from "./hairline/streaming-text";
import { CompanyIdentity } from "./company-mark";

const examples = [
  {
    name: "Buyer request",
    question: "Can we increase order 1042 to 600 pieces?",
    tool: "Compare fabric and production slots",
    answer:
      "Standard capacity supports 500 pieces by November 27. A split plan ships 500 on that date and the remaining 100 on November 28.",
    detail:
      "The seeded scenario includes existing reservations and completed work. This is an example result, not a live tool call.",
  },
  {
    name: "Another line",
    question: "Would another production line help?",
    tool: "Inspect existing line allocations",
    answer:
      "Line B already has an allocation for Studio Common’s order 1048. That buyer’s commitment is preserved when calculating your options.",
    detail:
      "Capacity belonging to another order is not treated as free. Change a recorded capacity slot and evaluate again to explore a different plan.",
  },
  {
    name: "Before committing",
    question: "Explain the split shipment before submitting.",
    tool: "Review the proposed change",
    answer:
      "The 600-piece size split is S 120, M 180, L 180, and XL 120. Cost is unavailable because additional split freight cost is missing. Submission needs your separate confirmation.",
    detail:
      "The merchandiser submits a proposal. A production lead reviews and approves the commitment. Selecting or viewing a plan does not approve it.",
  },
];
export function LandingVoicePreview() {
  const [index, setIndex] = useState(0);
  const example = examples[index];
  return (
    <figure className="landing-voice-preview">
      <div className="voice-preview-navigation">
        <span>
          <AudioLines size={18} aria-hidden="true" />A conversation with Nool
        </span>
        <span>Illustrative transcript</span>
      </div>
      <div className="voice-preview-content">
        <div className="voice-preview-order">
          <span>
            Order <span className="mono">#1042</span>
          </span>
          <h3>
            <CompanyIdentity name="North & Form" />
          </h3>
          <div>
            <span>Current quantity</span>
            <strong className="mono">
              500 <small>pieces</small>
            </strong>
          </div>
          <div>
            <span>Buyer’s requested quantity</span>
            <strong className="mono">
              600 <small>pieces</small>
            </strong>
          </div>
          <p>
            <Check size={15} aria-hidden="true" />
            Estimates until production approval
          </p>
          <Link href="/orders">
            Open your orders <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="voice-preview-conversation">
          <div className="voice-preview-question">
            <Mic size={15} aria-hidden="true" />
            <p>{example.question}</p>
          </div>
          <ToolCall
            title={example.tool}
            status="done"
            statusLabel="Sample result"
          >
            {example.detail}
          </ToolCall>
          <div className="voice-preview-response">
            <span>
              <AudioLines size={16} aria-hidden="true" />
              Nool
            </span>
            <StreamingText content={example.answer} />
          </div>
        </div>
      </div>
      <div
        className="voice-preview-choices"
        role="group"
        aria-label="Example conversation topic"
      >
        {examples.map((item, value) => (
          <button
            type="button"
            key={item.name}
            aria-pressed={index === value}
            onClick={() => setIndex(value)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <figcaption>
        Sample conversation for illustration. Choose a topic to inspect the
        workflow; no live voice session starts here.
      </figcaption>
    </figure>
  );
}
