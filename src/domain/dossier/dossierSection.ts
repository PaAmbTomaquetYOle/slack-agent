export interface Contact {
  readonly name: string;
  readonly role: string;
  readonly email: string;
  readonly relationship: string;
}

export interface PendingTask {
  readonly description: string;
  readonly priority: string;
  readonly deadline: string | null;
}

export interface KnowledgeArea {
  readonly topic: string;
  readonly description: string;
  readonly expertiseLevel: string;
}

export interface DossierSection {
  readonly title: string;
  readonly sectionType: 'responsibilities' | 'contacts' | 'pending_tasks' | 'knowledge_areas';
  readonly responsibilities: readonly string[] | null;
  readonly contacts: readonly Contact[] | null;
  readonly tasks: readonly PendingTask[] | null;
  readonly areas: readonly KnowledgeArea[] | null;
}
