export interface IDossierService {
  handleInterviewCompleted(processId: string): Promise<void>;
  publishDossier(processId: string): Promise<void>;
}
