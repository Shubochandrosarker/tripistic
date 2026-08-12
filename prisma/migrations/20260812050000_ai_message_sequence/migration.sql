-- Deterministic ordering for conversation messages.
--
-- `created_at` cannot order a thread. A user turn and the assistant turn that
-- answers it are written in one transaction, and PostgreSQL's `now()` is
-- transaction time, so both rows carry the same timestamp to the microsecond
-- and `ORDER BY created_at` returns them in an arbitrary order — which the
-- model then reads back as the assistant having spoken first.
--
-- Backfill uses `created_at` as the primary key of the ordering with `id` as the
-- tie-break. Within a tie the pairing is arbitrary, which is exactly the
-- pre-existing ambiguity; what matters is that it becomes *fixed* here so it
-- cannot keep changing between reads.

ALTER TABLE "ai_conversation_messages" ADD COLUMN "sequence" INTEGER;

UPDATE "ai_conversation_messages" AS target
SET "sequence" = ordered.position
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "conversation_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS position
  FROM "ai_conversation_messages"
) AS ordered
WHERE target."id" = ordered."id";

ALTER TABLE "ai_conversation_messages" ALTER COLUMN "sequence" SET NOT NULL;

CREATE UNIQUE INDEX "ai_conversation_messages_conversation_id_sequence_key"
  ON "ai_conversation_messages"("conversation_id", "sequence");
