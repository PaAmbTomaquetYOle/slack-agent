import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  IKnowledgeGraphReadPort,
  KnowledgeGraphPerson,
  KnowledgeGraphTopic,
  KnowledgeGraphExpert,
  KnowledgeGraphPage,
  KnowledgeGraphPersonProfile,
} from '../../application/ports';
import { handleAxiosError } from '../http';

interface BackendPage<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  total_pages: number;
}

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export class HttpKnowledgeGraphAdapter implements IKnowledgeGraphReadPort {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async fetchAllPersons(page: number, size: number): Promise<KnowledgeGraphPage<KnowledgeGraphPerson>> {
    try {
      const response = await this.#http.get<BackendPage<KnowledgeGraphPerson>>('/knowledge-graph/persons', {
        params: { page, size },
      });
      return response.data;
    } catch (error) {
      return handleAxiosError(error, 'knowledge graph persons');
    }
  }

  async fetchAllTopics(page: number, size: number): Promise<KnowledgeGraphPage<KnowledgeGraphTopic>> {
    try {
      const response = await this.#http.get<BackendPage<KnowledgeGraphTopic>>('/knowledge-graph/topics', {
        params: { page, size },
      });
      return response.data;
    } catch (error) {
      return handleAxiosError(error, 'knowledge graph topics');
    }
  }

  async fetchExpertsByTopic(topic: string, limit: number): Promise<KnowledgeGraphExpert[]> {
    try {
      const response = await this.#http.get<KnowledgeGraphExpert[]>(
        `/knowledge-graph/topics/${encodeURIComponent(topic)}/experts`,
        { params: { limit } },
      );
      return response.data;
    } catch (error) {
      return handleAxiosError(error, 'knowledge graph experts', topic);
    }
  }

  async fetchPersonProfile(personId: string): Promise<KnowledgeGraphPersonProfile | null> {
    try {
      const response = await this.#http.get<KnowledgeGraphPersonProfile>(
        `/knowledge-graph/persons/${encodeURIComponent(personId)}`,
      );
      return response.data;
    } catch (error) {
      if (isNotFound(error)) return null;
      return handleAxiosError(error, 'knowledge graph person profile', personId);
    }
  }
}
