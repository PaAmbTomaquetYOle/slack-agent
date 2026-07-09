export interface IOffboardingOrchestrator {
  /**
   * Entry point for the direct-message flow: re-arms the stall deadline, then delegates to the
   * interview service. `channelId` is the DM channel, used if the interview agent needs to hand
   * off to the Jira/Trello auth flow (see `AuthenticationRequiredError`).
   */
  handleInterviewMessage(userId: string, text: string, channelId: string): Promise<void>;
  /** Rebuilds in-memory process tracking and re-arms no-response deadlines from the backend read-model. Call once on startup. */
  recover(): Promise<void>;
  /** Notifies the orchestrator that the backend confirmed dossier generation, so it can advance in-memory state. */
  onDossierGenerated(processId: string): void;
  /** Notifies the orchestrator that the backend confirmed the offboarding is complete, so it can stop tracking the process. */
  onOffboardingCompleted(processId: string): void;
}
