import type { IOffboardingProcessRepository, IDossierRepository, IUserInfoProvider, IMessagingPort } from '../ports';
import type { IDomainEventBus } from '../events';
import type { IDossierService } from '../serviceInterfaces';
import type { Dossier, DossierSection } from '../../domain';
import { ProcessId, DossierGenerationRequestedEvent } from '../../domain';

export class DossierService implements IDossierService {
  readonly #offboardingProcessRepository: IOffboardingProcessRepository;
  readonly #dossierRepository: IDossierRepository;
  readonly #userInfoProvider: IUserInfoProvider;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;
  readonly #managersChannelId: string;

  constructor(
    offboardingProcessRepository: IOffboardingProcessRepository,
    dossierRepository: IDossierRepository,
    userInfoProvider: IUserInfoProvider,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
    managersChannelId: string,
  ) {
    this.#offboardingProcessRepository = offboardingProcessRepository;
    this.#dossierRepository = dossierRepository;
    this.#userInfoProvider = userInfoProvider;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
    this.#managersChannelId = managersChannelId;
  }

  async handleInterviewCompleted(processId: string): Promise<void> {
    // The backend owns dossier generation (reads the interview from the DB) —
    // slack-agent only requests it.
    await this.#eventBus.publish(new DossierGenerationRequestedEvent(new ProcessId(processId)));
  }

  async publishDossier(processId: string): Promise<void> {
    if (!this.#managersChannelId) {
      console.warn('DOSSIER_MANAGERS_CHANNEL_ID not set; skipping Slack publication of the handover dossier.');
      return;
    }

    let employeeName: string;
    let dossier: Dossier;
    try {
      const process = await this.#offboardingProcessRepository.findById(new ProcessId(processId));
      if (!process) return;
      const fetchedDossier = await this.#dossierRepository.findByProcessId(new ProcessId(processId));
      if (!fetchedDossier) return;
      dossier = fetchedDossier;

      employeeName = (await this.#userInfoProvider.getDisplayName(process.departingUserId.value)) ?? process.departingUserId.value;
    } catch (error) {
      console.error('Failed to fetch the generated dossier; will retry if the confirmation is redelivered:', error);
      return;
    }

    try {
      await this.#messagingPort.sendChannelMessage(
        this.#managersChannelId,
        `:memo: Handover dossier ready for *${employeeName}*.\n\n${dossier.summary ?? ''}`,
      );
      await this.#messagingPort.createChannelCanvas(
        this.#managersChannelId,
        `Handover Dossier — ${employeeName}`,
        this.#toMarkdown(dossier),
      );
    } catch (error) {
      console.error('Failed to publish the handover dossier to Slack; will retry if the confirmation is redelivered:', error);
    }
  }

  #toMarkdown(dossier: Dossier): string {
    const sections = dossier.sections.map((section) => `## ${section.title}\n\n${this.#sectionBody(section)}`).join('\n\n');
    return `# Summary\n\n${dossier.summary ?? ''}\n\n${sections}`;
  }

  #sectionBody(section: DossierSection): string {
    if (section.responsibilities) return section.responsibilities.map((r) => `- ${r}`).join('\n');
    if (section.contacts) {
      return section.contacts.map((c) => `- **${c.name}** (${c.role}) — ${c.email}, ${c.relationship}`).join('\n');
    }
    if (section.tasks) {
      return section.tasks.map((t) => `- ${t.description} (priority: ${t.priority}${t.deadline ? `, due ${t.deadline}` : ''})`).join('\n');
    }
    if (section.areas) {
      return section.areas.map((a) => `- **${a.topic}** (${a.expertiseLevel}): ${a.description}`).join('\n');
    }
    return '';
  }
}
