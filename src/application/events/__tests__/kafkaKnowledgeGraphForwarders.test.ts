import { describe, it, expect, vi } from 'vitest';
import { createInterviewKnowledgeGraphForwarder, createSopKnowledgeGraphForwarder } from '../kafkaKnowledgeGraphForwarders';
import type { IEventPublisher, IOffboardingProcessRepository, IUserInfoProvider } from '../../ports';
import {
  InterviewCompletedEvent,
  SopCreationRequestedEvent,
  ProcessId,
  InterviewId,
  ChannelId,
  UserId,
  OffboardingProcess,
  KNOWLEDGE_GRAPH_INTERACTION_REGISTERED,
  KNOWLEDGE_GRAPH_DOCUMENT_REGISTERED,
} from '../../../domain';
import type { InterviewTurn } from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

function makeRepositoryMock(process: OffboardingProcess | null): IOffboardingProcessRepository {
  return {
    findById: vi.fn().mockResolvedValue(process),
    findAll: vi.fn().mockResolvedValue({ items: [], count: 0 }),
  };
}

function makeUserInfoProviderMock(name: string | null): IUserInfoProvider {
  return { getDisplayName: vi.fn().mockResolvedValue(name) };
}

function makeTurn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    turnType: 'note',
    speakerRole: 'interviewee',
    timestamp: new Date('2026-07-06T10:00:00.000Z'),
    content: 'I own the onboarding docs.',
    order: 0,
    topic: 'current_projects',
    sentiment: 'positive',
    answerText: 'Owns onboarding docs.',
    ...overrides,
  };
}

describe('createInterviewKnowledgeGraphForwarder', () => {
  it('publishes one interaction_registered event per distinct topic', async () => {
    const process = OffboardingProcess.create(new ProcessId('proc-1'), new UserId('U-DEPARTING'), new UserId('U-INIT'));
    const publisher = makePublisherMock();
    const repository = makeRepositoryMock(process);
    const userInfoProvider = makeUserInfoProviderMock('Ana Garcia');
    const forward = createInterviewKnowledgeGraphForwarder(publisher, repository, userInfoProvider);
    const turns = [
      makeTurn({ topic: 'current_projects' }),
      makeTurn({ topic: 'key_contacts' }),
      makeTurn({ topic: 'current_projects' }),
      makeTurn({ topic: null }),
    ];
    const event = new InterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), turns);

    await forward(event);

    expect(repository.findById).toHaveBeenCalledWith(event.processId);
    expect(publisher.publishMany).toHaveBeenCalledWith([
      {
        eventType: KNOWLEDGE_GRAPH_INTERACTION_REGISTERED,
        payload: {
          person_id: 'U-DEPARTING',
          person_name: 'Ana Garcia',
          topic_name: 'current_projects',
          interaction_type: 'interview_topic',
        },
      },
      {
        eventType: KNOWLEDGE_GRAPH_INTERACTION_REGISTERED,
        payload: {
          person_id: 'U-DEPARTING',
          person_name: 'Ana Garcia',
          topic_name: 'key_contacts',
          interaction_type: 'interview_topic',
        },
      },
    ]);
  });

  it('falls back to the user id when the display name cannot be resolved', async () => {
    const process = OffboardingProcess.create(new ProcessId('proc-1'), new UserId('U-DEPARTING'), new UserId('U-INIT'));
    const publisher = makePublisherMock();
    const repository = makeRepositoryMock(process);
    const userInfoProvider = makeUserInfoProviderMock(null);
    const forward = createInterviewKnowledgeGraphForwarder(publisher, repository, userInfoProvider);
    const event = new InterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), [makeTurn()]);

    await forward(event);

    const call = vi.mocked(publisher.publishMany).mock.calls[0]?.[0];
    expect(call?.[0]?.payload).toMatchObject({ person_id: 'U-DEPARTING', person_name: 'U-DEPARTING' });
  });

  it('does nothing when the process cannot be found', async () => {
    const publisher = makePublisherMock();
    const repository = makeRepositoryMock(null);
    const userInfoProvider = makeUserInfoProviderMock('Ana Garcia');
    const forward = createInterviewKnowledgeGraphForwarder(publisher, repository, userInfoProvider);
    const event = new InterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), [makeTurn()]);

    await forward(event);

    expect(publisher.publishMany).not.toHaveBeenCalled();
  });

  it('throws on an unexpected event type', async () => {
    const forward = createInterviewKnowledgeGraphForwarder(
      makePublisherMock(),
      makeRepositoryMock(null),
      makeUserInfoProviderMock('Ana'),
    );
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});

describe('createSopKnowledgeGraphForwarder', () => {
  it('publishes a document_registered event with author and truncated title', async () => {
    const publisher = makePublisherMock();
    const userInfoProvider = makeUserInfoProviderMock('Carlos Lopez');
    const forward = createSopKnowledgeGraphForwarder(publisher, userInfoProvider);
    const event = new SopCreationRequestedEvent(
      new ChannelId('C123'),
      new UserId('U456'),
      'Run the deploy pipeline twice in staging before prod.',
      '1234.5678',
    );

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: KNOWLEDGE_GRAPH_DOCUMENT_REGISTERED,
      payload: {
        document_id: 'sop-C123-1234.5678',
        title: 'Run the deploy pipeline twice in staging before prod.',
        author_id: 'U456',
        author_name: 'Carlos Lopez',
        topics: [],
      },
    });
  });

  it('truncates long message text for the document title', async () => {
    const publisher = makePublisherMock();
    const userInfoProvider = makeUserInfoProviderMock('Carlos Lopez');
    const forward = createSopKnowledgeGraphForwarder(publisher, userInfoProvider);
    const longText = 'a'.repeat(100);
    const event = new SopCreationRequestedEvent(new ChannelId('C1'), new UserId('U1'), longText, '1.1');

    await forward(event);

    const call = vi.mocked(publisher.publish).mock.calls[0]?.[0];
    const title = (call as { payload: { title: string } }).payload.title;
    expect(title.length).toBeLessThan(longText.length);
    expect(title.endsWith('…')).toBe(true);
  });

  it('throws on an unexpected event type', async () => {
    const forward = createSopKnowledgeGraphForwarder(makePublisherMock(), makeUserInfoProviderMock('Ana'));
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
