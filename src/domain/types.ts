export type ProjectKind = 'mobile' | 'manipulator';
export type WorkspaceMode = 'assembly' | 'wiring' | 'code' | 'simulation';

export interface ProjectTemplate {
  id: string;
  title: string;
  kind: ProjectKind;
  description: string;
  components: readonly string[];
}

/** Начало версии формата хранения проекта; будет расширено в V0.1–V0.2. */
export interface ProjectFile {
  schemaVersion: number;
  id: string;
  name: string;
  templateId: string | null;
  components: Array<{ id: string; definitionId: string }>;
}
