"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { SignaturePad } from "./signature-pad";

type ParticipantStatus = {
  participantId: string;
  firstName: string;
  lastName: string;
  signed: boolean;
};

type WaiverText = { title: string; bodyText: string };

/**
 * Renders nothing while loading and nothing if the tour doesn't require a
 * waiver (the API 400s in that case) — the caller doesn't need to know
 * `tour.waiverRequired` ahead of time.
 */
export function WaiverSection({ publicToken }: { publicToken: string }) {
  const [waiver, setWaiver] = useState<WaiverText | null>(null);
  const [participants, setParticipants] = useState<ParticipantStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/bookings/${publicToken}/waiver`);
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const body = (await res.json()) as { waiver: WaiverText | null; participants: ParticipantStatus[] };
      setWaiver(body.waiver);
      setParticipants(body.participants);
    } catch {
      // Silent — the guest still has their booking confirmation either way.
    } finally {
      setLoaded(true);
    }
  }, [publicToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loaded || !waiver) return null;

  return (
    <SectionCard title="Waiver" className="print:hidden">
      <div className="space-y-4">
        <details className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">{waiver.title}</summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{waiver.bodyText}</p>
        </details>

        <ul className="space-y-2">
          {participants.map((participant) => (
            <li key={participant.participantId} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {participant.firstName} {participant.lastName}
                </span>
                {participant.signed ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Signed
                  </span>
                ) : signingId === participant.participantId ? null : (
                  <Button type="button" size="sm" onClick={() => setSigningId(participant.participantId)}>
                    Sign waiver
                  </Button>
                )}
              </div>
              {signingId === participant.participantId ? (
                <SignForm
                  publicToken={publicToken}
                  participantId={participant.participantId}
                  defaultName={`${participant.firstName} ${participant.lastName}`}
                  onDone={() => {
                    setSigningId(null);
                    load();
                  }}
                  onCancel={() => setSigningId(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

function SignForm({
  publicToken,
  participantId,
  defaultName,
  onDone,
  onCancel,
}: {
  publicToken: string;
  participantId: string;
  defaultName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signature) {
      setError("Please draw a signature above before submitting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/bookings/${publicToken}/waiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, signerName: name, signatureImage: signature }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save the signature. Try again.");
        return;
      }
      onDone();
    } catch {
      setError("Could not save the signature. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <Field label="Signed by (full legal name)" htmlFor={`signer-name-${participantId}`}>
        <Input
          id={`signer-name-${participantId}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
        />
      </Field>
      <SignaturePad onChange={setSignature} />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Submit signature"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
