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
}
