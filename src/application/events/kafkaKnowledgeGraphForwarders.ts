import type { DomainEvent, InterviewCompletedEvent, SopCreationRequestedEvent } from '../../domain/index.js';
import {
  KNOWLEDGE_GRAPH_INTERACTION_REGISTERED,
  KNOWLEDGE_GRAPH_DOCUMENT_REGISTERED,
  KNOWLEDGE_GRAPH_CHANNEL_ACTIVITY_REGISTERED,
} from '../../domain/index.js';
import type { IEventPublisher, IOffboardingProcessRepository, IUserInfoProvider } from '../ports/index.js';

const INTERVIEW_INTERACTION_TYPE = 'interview_topic';
const SOP_DOCUMENT_TITLE_MAX_LENGTH = 80;

function isInterviewCompletedEvent(event: DomainEvent): event is InterviewCompletedEvent {
  return event.eventName === 'interview.completed';
}

function isSopCreationRequestedEvent(event: DomainEvent): event is SopCreationRequestedEvent {
  return event.eventName === 'sop.creation_requested';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: when a guided offboarding interview
 * completes, publishes one `knowledge_graph.interaction_registered` event per distinct
 * topic the departing employee was classified as discussing, so the backend can index
 * their expertise in the knowledge graph.
 */
export function createInterviewKnowledgeGraphForwarder(
  publisher: IEventPublisher,
  repository: IOffboardingProcessRepository,
  userInfoProvider: IUserInfoProvider,
) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isInterviewCompletedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }

    const process = await repository.findById(event.processId);
    if (!process) return;

    const personId = process.departingUserId.value;
    const personName = (await userInfoProvider.getDisplayName(personId)) ?? personId;

    const topics = [...new Set(event.turns.map((turn) => turn.topic).filter((topic): topic is string => topic !== null))];

    await publisher.publishMany(
      topics.map((topic) => ({
        eventType: KNOWLEDGE_GRAPH_INTERACTION_REGISTERED,
        payload: {
          person_id: personId,
          person_name: personName,
          topic_name: topic,
          interaction_type: INTERVIEW_INTERACTION_TYPE,
        },
      })),
    );
  };
}

/**
 * Bridges the in-process DomainEventBus to Kafka: when an expert answer is accepted for
 * SOP capture, publishes a `knowledge_graph.document_registered` event so the backend can
 * index the resulting procedural document and its author in the knowledge graph.
 */
export function createSopKnowledgeGraphForwarder(publisher: IEventPublisher, userInfoProvider: IUserInfoProvider) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isSopCreationRequestedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }

    const authorId = event.authorId.value;
    const authorName = (await userInfoProvider.getDisplayName(authorId)) ?? authorId;
    const title = event.messageText.length > SOP_DOCUMENT_TITLE_MAX_LENGTH
      ? `${event.messageText.slice(0, SOP_DOCUMENT_TITLE_MAX_LENGTH)}…`
      : event.messageText;

    await publisher.publish({
      eventType: KNOWLEDGE_GRAPH_DOCUMENT_REGISTERED,
      payload: {
        document_id: `sop-${event.channelId.value}-${event.messageTs}`,
        title,
        author_id: authorId,
        author_name: authorName,
        topics: [],
      },
    });
  };
}

/**
 * Bridges the in-process DomainEventBus to Kafka: when an expert answer is accepted for
 * SOP capture, that acceptance is also the strongest available signal of channel activity —
 * so this publishes a `knowledge_graph.channel_activity_registered` event linking the author
 * to the channel the exchange happened in, for the backend's channel-activity knowledge graph.
 */
export function createKafkaChannelActivityRegisteredForwarder(
  publisher: IEventPublisher,
  userInfoProvider: IUserInfoProvider,
) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isSopCreationRequestedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }

    const personId = event.authorId.value;
    const personName = (await userInfoProvider.getDisplayName(personId)) ?? personId;
    const channelId = event.channelId.value;

    await publisher.publish({
      eventType: KNOWLEDGE_GRAPH_CHANNEL_ACTIVITY_REGISTERED,
      payload: {
        person_id: personId,
        person_name: personName,
        channel_id: channelId,
        channel_name: channelId,
      },
    });
  };
}
