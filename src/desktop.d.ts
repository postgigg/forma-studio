export type DesktopEditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';
export interface CloudState { connected: boolean; busy: boolean; bucket: string; region: string; endpoint: string; prefix: string; automatic: boolean; lastBackupAt: string | null; lastError: string }
export interface CloudConnection { region: string; endpoint: string; bucket: string; prefix: string; accessKeyId: string; secretAccessKey: string; automatic: boolean }
export interface CloudBackup { key: string; bytes: number; createdAt: string }
export interface DesktopUpdateState {
  phase: 'idle' | 'unsupported' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion: string;
  required: boolean;
  reason: string;
  percent: number;
  message: string;
  canInstall?: boolean;
  releaseUrl?: string;
  checkedAt?: string;
}
declare global {
  interface Window {
    formaDesktop?: {
      platform: string;
      aiEndpoint: string;
      editText(command: DesktopEditCommand): void;
      onEditCommand(callback: (command: DesktopEditCommand) => void): () => void;
      signIn(): Promise<boolean>;
      restartAI(): Promise<boolean>;
      saveFile(filename: string, bytes: ArrayBuffer): Promise<boolean>;
      cloud: {
        status(): Promise<CloudState>;
        connect(value: CloudConnection): Promise<CloudState>;
        automatic(value: boolean): Promise<CloudState>;
        disconnect(): Promise<CloudState>;
        backup(raw: string): Promise<CloudState & { unchanged: boolean; bytes?: number }>;
        list(): Promise<CloudBackup[]>;
        restore(key: string): Promise<{ raw: string; summary: import('../shared/workspace-backup.mjs').BackupSummary }>;
      };
      updateStatus(): Promise<DesktopUpdateState>;
      checkForUpdates(): Promise<DesktopUpdateState>;
      downloadUpdate(): Promise<DesktopUpdateState>;
      installUpdate(): Promise<boolean>;
      onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
      onShowUpdates(callback: () => void): () => void;
      onBeforeClose(callback: () => Promise<void>): () => void;
    };
  }
}
