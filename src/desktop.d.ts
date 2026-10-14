export {};
declare global {
  interface Window {
    formaDesktop?: {
      aiEndpoint: string;
      signIn(): Promise<boolean>;
      restartAI(): Promise<boolean>;
      saveFile(filename: string, bytes: ArrayBuffer): Promise<boolean>;
      onBeforeClose(callback: () => Promise<void>): () => void;
    };
  }
}
