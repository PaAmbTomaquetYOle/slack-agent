import type {
  IOffboardingProcessRepository,
  IUserInfoProvider,
  IMessagingPort,
  IDossierGenerationAgent,
} from '../ports';
import type { IDomainEventBus } from '../events';
import type { IDossierService } from '../serviceInterfaces';
import type { DossierDraft, InterviewTurn } from '../../domain';
import { ProcessId, InterviewId, DossierGenerationRequestedEvent } from '../../domain';

interface CachedDraft {
  employeeName: string;
  draft: DossierDraft;
}

export class DossierService implements IDossierService {
  readonly #dossierGenerationAgent: IDossierGenerationAgent;
  readonly #offboardingProcessRepository: IOffboardingProcessRepository;
  readonly #userInfoProvider: IUserInfoProvider;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;
  readonly #managersChannelId: string;
  readonly #drafts = new Map<string, CachedDraft>();

  constructor(
    dossierGenerationAgent: IDossierGenerationAgent,
    offboardingProcessRepository: IOffboardingProcessRepository,
    userInfoProvider: IUserInfoProvider,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
    managersChannelId: string,
  ) {
    this.#dossierGenerationAgent = dossierGenerationAgent;
    this.#offboardingProcessRepository = offboardingProcessRepository;
    this.#userInfoProvider = userInfoProvider;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
    this.#managersChannelId = managersChannelId;
  }

  async handleInterviewCompleted(processId: string, interviewId: string, turns: readonly InterviewTurn[]): Promise<void> {
    const process = await this.#offboardingProcessRepository.findById(new ProcessId(processId));
    if (!process) return;

    const employeeName = (await this.#userInfoProvider.getDisplayName(process.departingUserId.value)) ?? process.departingUserId.value;

    let draft: DossierDraft;
    try {
      draft = await this.#dossierGenerationAgent.generate({ employeeName, turns });
    } catch (error) {
      console.error('Dossier generation agent failed:', error);
      return;
    }

    this.#drafts.set(processId, { employeeName, draft });
    await this.#eventBus.publish(new DossierGenerationRequestedEvent(new ProcessId(processId), new InterviewId(interviewId), draft));
  }

  async publishDossier(processId: string): Promise<void> {
    const cached = this.#drafts.get(processId);
    if (!cached) return;

    this.#drafts.delete(processId);

    if (!this.#managersChannelId) {
      console.warn('DOSSIER_MANAGERS_CHANNEL_ID not set; skipping Slack publication of the handover dossier.');
      return;
    }

    const { employeeName, draft } = cached;
    await this.#messagingPort.sendChannelMessage(
      this.#managersChannelId,
      `:memo: Handover dossier ready for *${employeeName}*.\n\n${draft.summary}`,
    );
    await this.#messagingPort.createChannelCanvas(
      this.#managersChannelId,
      `Handover Dossier — ${employeeName}`,
      this.#toMarkdown(draft),
    );
  }

  #toMarkdown(draft: DossierDraft): string {
    const sections = draft.sections.map((section) => `## ${section.title}\n\n${section.content}`).join('\n\n');
    return `# Summary\n\n${draft.summary}\n\n${sections}`;
  }
}
