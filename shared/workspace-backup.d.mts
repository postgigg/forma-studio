export interface WorkspaceBackup { format: 'forma-workspace-backup'; version: 1; createdAt: string; stores: { workspace: [string, any][]; fonts: [string, any][]; textKits: [string, any][] } }
export interface BackupSummary { createdAt: string; designs: number; campaigns: number; images: number; fonts: number; textKits: number; hasBrand: boolean }
export const backupFormat: 'forma-workspace-backup';
export const maxBackupBytes: number;
export function workspaceKey(key: unknown): boolean;
export function validateWorkspaceBackup(value: unknown): WorkspaceBackup;
export function backupSummary(value: unknown): BackupSummary;
