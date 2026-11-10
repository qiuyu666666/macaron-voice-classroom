// Design-only contracts: no implementation, credentials, endpoints or execution.
export type Binding = { accountBindingId: string; callId: string; courseId: string; courseVersion: number };
export type ContextBundle = { binding: Binding; capturedAt: string; sourceRefs: string[]; text: string; limitations: string[] };
export type WorkerJob = { jobId: string; binding: Binding; goal: string; skillIds: string[]; promptVersion: string; status: 'queued'|'running'|'awaiting_review'|'succeeded'|'failed'|'cancelled'|'unknown'; artifactRefs: string[] };
export interface WorkerPort { submit(request: { binding: Binding; goal: string; materialRefs: string[]; skillIds: string[]; promptVersion: string }): Promise<WorkerJob>; cancel(jobId: string): Promise<void> }
export interface AccountContextPort { readAuthorizedContext(binding: Binding): Promise<ContextBundle> }
export interface SummarySyncPort { enqueue(request: { binding: Binding; summaryRef: string; approvalRef: string; idempotencyKey: string }): Promise<{ syncId: string; status: 'queued'|'unknown' }> }
export interface ArtifactReviewPort { publish(request: { artifactRef: string; expectedVersion: number; approvalRef: string }): Promise<{ version: number }> }
