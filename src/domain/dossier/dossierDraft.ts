export interface DossierDraftSection {
  readonly title: string;
  readonly content: string;
}

export interface DossierDraft {
  readonly summary: string;
  readonly sections: readonly DossierDraftSection[];
}
