export interface KnowledgeGraphPerson {
  person_id: string;
  name: string;
  department?: string;
}

export interface KnowledgeGraphTopic {
  name: string;
  description?: string;
}

export interface KnowledgeGraphDocument {
  document_id: string;
  title: string;
  url?: string;
  source?: string;
}

export interface KnowledgeGraphExpert {
  person: KnowledgeGraphPerson;
  topic: string;
  score: number;
  /** ISO timestamps of the earliest/most recent time this expertise was recorded (SA-19).
   * Absent for relationships written before the backend started tracking them. */
  first_seen?: string;
  last_seen?: string;
}

/**
 * A person's graph-analytics profile (SA-19): Louvain community, weighted PageRank
 * influence, and betweenness "broker" score, computed by the backend's Neo4j GDS layer
 * over a person-to-person projection. Absent/empty when GDS is unavailable server-side —
 * callers should fall back to client-side approximations rather than treat it as an error.
 */
export interface KnowledgeGraphPersonAnalytics {
  person_id: string;
  community_id: number;
  influence: number;
  broker_score: number;
}

/** A candidate to cover for another person, ranked by shared-topic similarity (SA-19). */
export interface KnowledgeGraphSuccessor {
  person: KnowledgeGraphPerson;
  similarity: number;
}

export interface KnowledgeGraphPage<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  total_pages: number;
}

export interface KnowledgeGraphPersonProfile {
  person: KnowledgeGraphPerson;
  topics: KnowledgeGraphTopic[];
  documents: KnowledgeGraphDocument[];
}

export interface IKnowledgeGraphReadPort {
  fetchAllPersons(page: number, size: number): Promise<KnowledgeGraphPage<KnowledgeGraphPerson>>;
  fetchAllTopics(page: number, size: number): Promise<KnowledgeGraphPage<KnowledgeGraphTopic>>;
  fetchExpertsByTopic(topic: string, limit: number): Promise<KnowledgeGraphExpert[]>;
  fetchPersonProfile(personId: string): Promise<KnowledgeGraphPersonProfile | null>;
  /** Per-person community/influence/broker analytics. Empty array when the backend's GDS layer is unavailable. */
  fetchPersonAnalytics(): Promise<KnowledgeGraphPersonAnalytics[]>;
  /** Ranked "who can cover for this person" candidates. Empty array when GDS is unavailable. */
  fetchSuccessors(personId: string, limit: number): Promise<KnowledgeGraphSuccessor[]>;
}
