import { describe, it, expect, vi } from 'vitest';
import { createKafkaDossierGenerationRequestedForwarder } from '../kafkaDossierGenerationRequestedForwarder';
import type { IEventPublisher } from '../../ports';
import { DossierGenerationRequestedEvent, ProcessId, InterviewId, DOSSIER_GENERATION_REQUESTED } from '../../../domain';
import type { DossierDraft } from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

const DRAFT: DossierDraft = {
  summary: 'Alice led the CRM migration.',
  sections: [{ title: 'Ongoing Projects', content: 'CRM migration, completed.' }],
};

describe('createKafkaDossierGenerationRequestedForwarder', () => {
  it('forwards DossierGenerationRequestedEvent as a dossier.generation_requested Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaDossierGenerationRequestedForwarder(publisher);
    const event = new DossierGenerationRequestedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), DRAFT);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: DOSSIER_GENERATION_REQUESTED,
      payload: {
        process_id: 'proc-1',
        summary: 'Alice led the CRM migration.',
        sections: [{ title: 'Ongoing Projects', content: 'CRM migration, completed.' }],
      },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaDossierGenerationRequestedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
