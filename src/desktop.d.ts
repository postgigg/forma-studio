export interface DesktopUpdateState {
  phase: 'idle' | 'unsupported' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion: string;
  required: boolean;
  reason: string;
  percent: number;
  message: string;
}
declare global {
  interface Window {
    formaDesktop?: {
      aiEndpoint: string;
      signIn(): Promise<boolean>;
      restartAI(): Promise<boolean>;
      saveFile(filename: string, bytes: ArrayBuffer): Promise<boolean>;
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
