/** A SOP candidate still awaiting its author's accept/reject decision, as persisted by the backend. */
export interface PendingSopCandidate {
  readonly channelId: string;
  readonly authorId: string;
  readonly content: string;
  readonly messageTs: string;
}

/**
 * BE-7/SA-16: the backend's REST surface is read-only — candidate writes flow over Kafka
 * (`sop.candidate_offered`/`sop.candidate_decided`). This port only survives so `SopService`
 * can rehydrate its in-memory candidate cache from the backend on restart.
 */
export interface ISopCandidateReadRepository {
  findPending(): Promise<PendingSopCandidate[]>;
}
