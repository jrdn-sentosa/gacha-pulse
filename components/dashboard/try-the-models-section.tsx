"use client";

import { useId, useState } from "react";
import { FlaskConical, Gauge, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RISK_BAND_BADGE_CLASSES, RISK_BAND_LABELS, SENTIMENT_BADGE_CLASSES } from "@/lib/theme";

const SENTIMENT_API_URL = process.env.NEXT_PUBLIC_SENTIMENT_API_URL;
const EOS_RISK_API_URL = process.env.NEXT_PUBLIC_EOS_RISK_API_URL;

const UNAVAILABLE_MESSAGE = "Model temporarily unavailable — try again shortly.";

const EOS_RISK_SHORT_CAVEAT =
  "Based on how many similarly-aged games have already shut down — not a prediction of this specific game's odds.";

type RequestStatus = "idle" | "loading" | "success" | "error";

export function TryTheModelsSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
        <FlaskConical className="h-5 w-5 text-muted-foreground" /> Try the Models
      </h2>
      <p className="max-w-3xl text-xs text-muted-foreground/70">
        Send a request straight to the deployed models below and see what they return.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SentimentTesterCard />
        <EosRiskTesterCard />
      </div>
    </section>
  );
}

interface SentimentResult {
  predicted_sentiment: "positive" | "negative";
  confidence: number;
}

function SentimentTesterCard() {
  const [reviewText, setReviewText] = useState("");
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const canSubmit = reviewText.trim().length > 0 && status !== "loading";

  async function handleSubmit() {
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch(`${SENTIMENT_API_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_text: reviewText }),
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data: SentimentResult = await res.json();
      setResult(data);
      setStatus("success");
    } catch {
      setErrorMessage(UNAVAILABLE_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" /> Sentiment Classifier
        </CardTitle>
        <CardDescription>
          Paste a game-review-style sentence and see how the deployed sentiment model scores it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="This game is absolutely amazing, I love the combat system!"
          rows={4}
          maxLength={5000}
        />
        <Button onClick={handleSubmit} disabled={!canSubmit} className="self-start">
          {status === "loading" ? "Scoring…" : "Predict Sentiment"}
        </Button>

        {status === "error" && <p className="text-xs text-destructive">{errorMessage}</p>}

        {status === "success" && result && (
          <div className="flex items-center gap-2">
            <Badge className={SENTIMENT_BADGE_CLASSES[result.predicted_sentiment]}>
              {result.predicted_sentiment === "positive" ? "Positive" : "Negative"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {(result.confidence * 100).toFixed(1)}% confidence
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface EosRiskResult {
  risk_score: number;
  base_rate_risk: number;
  score_sv: number;
  interpretation: "low" | "moderate" | "elevated" | "high";
  caveat: string;
}

interface EosRiskFormState {
  sentimentSlope: string;
  sentimentVolatility: string;
  volumeSlope: string;
  ageWeeks: string;
}

const EOS_RISK_FIELDS: {
  key: keyof EosRiskFormState;
  label: string;
  helper: string;
  placeholder: string;
}[] = [
  {
    key: "sentimentSlope",
    label: "Sentiment slope",
    helper: "Trailing 4-week change in % positive, per week",
    placeholder: "-17.5",
  },
  {
    key: "sentimentVolatility",
    label: "Sentiment volatility",
    helper: "Rolling std. deviation of weekly % positive",
    placeholder: "26.26",
  },
  {
    key: "volumeSlope",
    label: "Volume slope",
    helper: "Trailing 4-week change in review volume, per week",
    placeholder: "-1.4",
  },
  {
    key: "ageWeeks",
    label: "Age (weeks)",
    helper: "Age in weeks since first review",
    placeholder: "255",
  },
];

const EOS_RISK_EXAMPLE_VALUES: EosRiskFormState = {
  sentimentSlope: "-17.5",
  sentimentVolatility: "26.26",
  volumeSlope: "-1.4",
  ageWeeks: "255",
};

function isValidEosRiskForm(form: EosRiskFormState): boolean {
  const slope = Number(form.sentimentSlope);
  const volatility = Number(form.sentimentVolatility);
  const volumeSlope = Number(form.volumeSlope);
  const age = Number(form.ageWeeks);
  return (
    form.sentimentSlope.trim() !== "" &&
    form.sentimentVolatility.trim() !== "" &&
    form.volumeSlope.trim() !== "" &&
    form.ageWeeks.trim() !== "" &&
    Number.isFinite(slope) &&
    Number.isFinite(volatility) &&
    volatility >= 0 &&
    Number.isFinite(volumeSlope) &&
    Number.isFinite(age) &&
    age > 0
  );
}

function EosRiskTesterCard() {
  const [form, setForm] = useState<EosRiskFormState>({
    sentimentSlope: "",
    sentimentVolatility: "",
    volumeSlope: "",
    ageWeeks: "",
  });
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [result, setResult] = useState<EosRiskResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showFullCaveat, setShowFullCaveat] = useState(false);
  const formId = useId();

  const canSubmit = isValidEosRiskForm(form) && status !== "loading";

  function updateField(key: keyof EosRiskFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function fillExampleValues() {
    setForm(EOS_RISK_EXAMPLE_VALUES);
  }

  async function handleSubmit() {
    setStatus("loading");
    setErrorMessage("");
    setShowFullCaveat(false);
    try {
      const res = await fetch(`${EOS_RISK_API_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentiment_slope: Number(form.sentimentSlope),
          sentiment_volatility: Number(form.sentimentVolatility),
          volume_slope: Number(form.volumeSlope),
          age_weeks: Number(form.ageWeeks),
        }),
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data: EosRiskResult = await res.json();
      setResult(data);
      setStatus("success");
    } catch {
      setErrorMessage(UNAVAILABLE_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg">
          <Gauge className="h-4 w-4 text-muted-foreground" /> EoS Risk Score
          <Badge variant="outline" className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Experimental
          </Badge>
        </CardTitle>
        <CardDescription>
          Enter a game&rsquo;s current trend metrics to see the deployed EoS-risk pipeline&rsquo;s score.
          Far less rigorously validated than the sentiment classifier — validated against only 5
          known shutdown cases, so treat it as illustrative, not predictive.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fillExampleValues}
          disabled={status === "loading"}
          className="self-start"
        >
          Try example values (Honkai Impact 3rd)
        </Button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EOS_RISK_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label htmlFor={`${formId}-${field.key}`} className="text-xs font-medium text-foreground">
                {field.label}
              </label>
              <Input
                id={`${formId}-${field.key}`}
                type="number"
                step="any"
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
              <p className="text-[11px] leading-snug text-muted-foreground/70">{field.helper}</p>
            </div>
          ))}
        </div>

        <Button onClick={handleSubmit} disabled={!canSubmit} className="self-start">
          {status === "loading" ? "Scoring…" : "Predict Risk"}
        </Button>

        {status === "error" && <p className="text-xs text-destructive">{errorMessage}</p>}

        {status === "success" && result && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Risk score: {result.risk_score.toFixed(3)}
              </span>
              <Badge className={RISK_BAND_BADGE_CLASSES[result.interpretation]}>
                {RISK_BAND_LABELS[result.interpretation] ?? result.interpretation}
              </Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">{EOS_RISK_SHORT_CAVEAT}</p>
            <button
              type="button"
              onClick={() => setShowFullCaveat((prev) => !prev)}
              className="self-start text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {showFullCaveat ? "Hide details" : "What does this mean?"}
            </button>
            {showFullCaveat && (
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">{result.caveat}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
