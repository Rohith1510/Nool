import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { Wordmark } from "./shell";
import { ThemeToggle } from "./theme-toggle";
import { LandingPreview } from "./landing-preview";
import { PlanningFigure } from "./planning-figure";
import { LandingVoicePreview } from "./landing-voice-preview";

export function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="landing-nav landing-container">
        <Link href="/" aria-label="Nool home">
          <Wordmark />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#workflow">How it works</a>
          <a href="#questions">Questions</a>
        </nav>
        <div>
          <ThemeToggle />
          <Link className="landing-login" href="/sign-in">
            Sign in <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero-scene landing-container">
          <div className="landing-hero-copy">
            <h1>
              Catch order <em className="hero-cursive">risks</em>
              <br />
              before they become <em className="hero-cursive">losses.</em>
            </h1>
            <p>
              Voice AI for garment orders, grounded in your production reality.
            </p>
            <div className="landing-actions">
              <Link href="/orders" className="landing-primary">
                Open workspace <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <a href="#voice" className="landing-text-link">
                See Nool at work
              </a>
            </div>
          </div>
          <PlanningFigure />
        </section>
        <section className="landing-context" id="workflow">
          <div className="landing-container">
            <div className="landing-section-head">
              <h2>
                One change.
                <br />
                The whole picture.
              </h2>
              <p>
                The answer is in the fabric, the production slots, and the
                promises already made.
              </p>
            </div>
            <div className="landing-context-rows">
              <article>
                <h3>Start with what’s true.</h3>
                <p>
                  Order quantities. Reserved fabric. Completed work. Every plan
                  starts with stored facts.
                </p>
              </article>
              <article>
                <h3>Talk through what changes.</h3>
                <p>
                  Ask a follow-up, compare shipment options, or investigate
                  another line’s existing commitments.
                </p>
              </article>
              <article>
                <h3>Commit with approval.</h3>
                <p>
                  Submit a proposal. Production rechecks resources before
                  approving the change.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="landing-accountability landing-container">
          <h2>
            The commitment
            <br />
            is yours.
          </h2>
          <div className="landing-decision-list">
            <div>
              <span>Buyer request</span>
              <p>What the buyer wants to change.</p>
              <span>Merchandiser</span>
            </div>
            <div>
              <span>Feasible plan</span>
              <p>What the current records support.</p>
              <span>Nool’s calculation engine</span>
            </div>
            <div>
              <span>Production commitment</span>
              <p>What the team has agreed to deliver.</p>
              <span>Production lead</span>
            </div>
            <p className="landing-decision-note">
              <Check size={16} aria-hidden="true" />
              An estimate becomes a commitment only after approval.
            </p>
          </div>
        </section>
        <section className="landing-voice-section" id="voice">
          <div className="landing-container">
            <div className="landing-section-head">
              <h2>
                Ask a question.
                <br />
                Follow the facts.
              </h2>
              <p>
                See the order, the check, and the consequence in the same
                conversation.
              </p>
            </div>
            <LandingVoicePreview />
          </div>
        </section>
        <section className="landing-explore landing-container">
          <div>
            <h2>
              More capacity.
              <br />A different answer.
            </h2>
            <p>
              Try a change in the sample scenario. The plan recalculates using
              Nool’s actual feasibility rules.
            </p>
            <span className="landing-sample-note">
              Sample company data. No database writes.
            </span>
          </div>
          <LandingPreview />
        </section>
        <section className="landing-faq landing-container" id="questions">
          <h2>Before you commit.</h2>
          <div>
            <details>
              <summary>Does the AI approve order changes?</summary>
              <p>
                No. Nool helps evaluate and submit a proposal. A signed-in
                production lead reviews and approves the actual commitment.
              </p>
            </details>
            <details>
              <summary>What if a cost or a resource is missing?</summary>
              <p>
                The plan names the constraint or missing cost. Estimates use
                configured inputs; Nool does not invent a complete quote.
              </p>
            </details>
            <details>
              <summary>Can I work without a voice connection?</summary>
              <p>
                Yes. Find orders, evaluate changes, submit proposals, and review
                approvals through ordinary workspace controls.
              </p>
            </details>
            <details>
              <summary>Is the preview connected to a factory?</summary>
              <p>
                The preview uses the labelled sample scenario and real
                calculation rules. It does not change database records or
                connect to factory machinery.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-top">
            <p>
              Your next order change.
              <br />A clearer commitment.
            </p>
            <Link href="/orders" className="landing-primary">
              Open workspace <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="landing-footer-bottom">
            <Link href="/" aria-label="Nool home">
              <Wordmark />
            </Link>
            <span>Voice AI for garment order decisions.</span>
            <Link href="/setup">Setup &amp; account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
