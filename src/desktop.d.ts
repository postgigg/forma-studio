export type DesktopEditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';
export interface CloudState { connected: boolean; busy: boolean; bucket: string; region: string; endpoint: string; prefix: string; automatic: boolean; lastBackupAt: string | null; lastError: string }
export interface CloudConnection { region: string; endpoint: string; bucket: string; prefix: string; accessKeyId: string; secretAccessKey: string; automatic: boolean }
export interface CloudBackup { key: string; bytes: number; createdAt: string }
export type LiveRole = 'edit'|'comment'|'view';
export interface LiveParticipant {id:string;name:string;role:LiveRole;color:string}
export interface LiveState {mode:'idle'|'host'|'joining'|'guest';self:LiveParticipant|null;connected:boolean;error:string;participants:LiveParticipant[];pending:{id:string;name:string;createdAt:number}[];invitation:{code:string;expiresAt:number;address:string}|null}
export interface LiveEvent {type:string;state?:LiveState;design?:any;revision?:number;seq?:number;participants?:LiveParticipant[];transactionId?:string;actorId?:string;ops?:import('../shared/collaboration.mjs').LiveChange[];conflicts?:string[];message?:string;participantId?:string;pageId?:string;x?:number|null;y?:number|null;selection?:string[]}
export interface LiveBridge {
  interfaces():Promise<{name:string;address:string}[]>;
  status():Promise<LiveState>;
  host(value:{name:string;address:string;design:unknown}):Promise<{state:LiveState;design:any;revision:number}>;
  join(value:{name:string;code:string}):Promise<{state:LiveState;design:any;revision:number}>;
  stop():Promise<LiveState>;
  renew():Promise<LiveState>;
  admit(value:{id:string;allow:boolean;role:LiveRole}):Promise<LiveState>;
  permission(value:{id:string;role:LiveRole}):Promise<LiveState>;
  remove(id:string):Promise<LiveState>;
  publish(value:{id:string;ops:import('../shared/collaboration.mjs').LiveChange[]}):Promise<unknown>;
  presence(value:{pageId:string;x?:number|null;y?:number|null;selection:string[]}):Promise<unknown>;
  onEvent(callback:(value:LiveEvent)=>void):()=>void;
}
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
      signIn(provider?:string,mode?:'cli'|'environment'): Promise<boolean>;
      restartAI(): Promise<boolean>;
      saveFile(filename: string, bytes: ArrayBuffer): Promise<boolean>;
      collaboration: LiveBridge;
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
